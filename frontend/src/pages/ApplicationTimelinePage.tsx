import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import MessagePanel from '../components/MessagePanel'
import StatusBadge, { getStatusClass, getStatusLabel } from '../components/StatusBadge'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const AUTH_TOKEN_KEY = 'ttangbu_auth_token'

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (!token) {
    return {}
  }
  return {
    Authorization: `Bearer ${token}`,
  }
}

interface ApplicationDetail {
  id: number
  listing_id: number
  applicant_id: number
  status: string
  message: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
  listing_title: string
  owner_id: number
  applicant_name: string
  applicant_email: string
}

interface StatusLog {
  id: number
  from_status: string | null
  to_status: string
  reason: string | null
  created_at: string
  changed_by_name: string
}

interface ApplicationDetailResponse {
  success: boolean
  data: {
    application: ApplicationDetail
    status_logs: StatusLog[]
  }
}

interface UserInfo {
  id: number
  email: string
  name: string
  phone: string | null
  role: string
}

interface UserResponse {
  success: boolean
  data: {
    user: UserInfo
  }
}

interface ApiErrorResponse {
  error?: string
  message?: string
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const typed = payload as ApiErrorResponse
  return typed.message ?? typed.error ?? fallback
}

function getAvailableTransitions(status: string, isOwner: boolean, isApplicant: boolean): string[] {
  const transitions: string[] = []

  if (isOwner) {
    if (status === 'pending') {
      transitions.push('approved', 'rejected', 'cancelled')
    }
    if (status === 'approved') {
      transitions.push('active', 'cancelled')
    }
    if (status === 'active') {
      transitions.push('completed', 'cancelled')
    }
  }

  if (isApplicant && ['pending', 'approved', 'active'].includes(status)) {
    transitions.push('cancelled')
  }

  return [...new Set(transitions)]
}

export default function ApplicationTimelinePage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [nextStatus, setNextStatus] = useState('')
  const [reason, setReason] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | ''>('')

  const { data: userData } = useQuery<UserResponse>({
    queryKey: ['current-user'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return response.json()
    },
    retry: false,
  })

  const { data, isLoading, error } = useQuery<ApplicationDetailResponse>({
    queryKey: ['application-detail', id],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/applications/${id}`, {
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return response.json()
    },
    retry: false,
  })

  const application = data?.data.application
  const currentUserId = userData?.data.user.id
  const isOwner = application?.owner_id === currentUserId
  const isApplicant = application?.applicant_id === currentUserId

  const availableTransitions = useMemo(() => {
    if (!application) {
      return []
    }

    return getAvailableTransitions(application.status, !!isOwner, !!isApplicant)
  }, [application, isOwner, isApplicant])

  const transitionMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/applications/${id}/transition`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: nextStatus,
          reason: reason.trim() || undefined,
        }),
      })

      const payload = (await response.json()) as unknown
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, '상태 변경에 실패했습니다.'))
      }
    },
    onSuccess: () => {
      setFeedbackType('success')
      setFeedbackMessage('신청 상태가 업데이트되었습니다.')
      setReason('')
      setNextStatus('')
      queryClient.invalidateQueries({ queryKey: ['application-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['applications-all'] })
    },
    onError: (mutationError) => {
      setFeedbackType('error')
      setFeedbackMessage(mutationError instanceof Error ? mutationError.message : '상태 변경 중 오류가 발생했습니다.')
    },
  })

  if (isLoading) {
    return (
      <div className="page">
        <h2>신청 상태 타임라인</h2>
        <div className="state-message">
          <p>로딩 중...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <h2>신청 상태 타임라인</h2>
        <div className="state-message error-message">
          <p>신청을 찾을 수 없거나 접근 권한이 없습니다.</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            오류: {error instanceof Error ? error.message : '알 수 없는 오류'}
          </p>
          <Link to="/my-applications" className="button" style={{ marginTop: '1rem' }}>
            내 신청으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  if (!application) {
    return (
      <div className="page">
        <h2>신청 상태 타임라인</h2>
        <div className="state-message error-message">
          <p>신청 정보를 불러올 수 없습니다.</p>
        </div>
      </div>
    )
  }

  const statusLogs = data?.data.status_logs || []

  return (
    <div className="page">
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/my-applications" style={{ fontSize: '0.875rem' }}>
          ← 내 신청으로 돌아가기
        </Link>
      </div>

      <h2>신청 상태 타임라인</h2>

      {feedbackMessage && (
        <div className={feedbackType === 'error' ? 'auth-error' : 'auth-success'}>{feedbackMessage}</div>
      )}

      <div className="timeline-summary">
        <div className="summary-row">
          <span className="summary-label">매물:</span>
          <span className="summary-value">{application.listing_title}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">신청자:</span>
          <span className="summary-value">{application.applicant_name} ({application.applicant_email})</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">현재 상태:</span>
          <StatusBadge status={application.status} />
        </div>
        <div className="summary-row">
          <span className="summary-label">신청일:</span>
          <span className="summary-value">{new Date(application.created_at).toLocaleString('ko-KR')}</span>
        </div>
        {application.message && (
          <div className="summary-row">
            <span className="summary-label">메시지:</span>
            <span className="summary-value">{application.message}</span>
          </div>
        )}
      </div>

      {availableTransitions.length > 0 && (
        <section className="section-card">
          <h3>상태 관리</h3>
          <p>{isOwner ? '소유자 권한으로 신청 상태를 변경할 수 있습니다.' : '신청자 권한으로 취소를 요청할 수 있습니다.'}</p>
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault()
              transitionMutation.mutate()
            }}
          >
            <label htmlFor="next-status">다음 상태</label>
            <select id="next-status" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)} required>
              <option value="">선택하세요</option>
              {availableTransitions.map((status) => (
                <option key={status} value={status}>{getStatusLabel(status)}</option>
              ))}
            </select>

            <label htmlFor="reason">사유 (선택)</label>
            <textarea id="reason" className="message-input" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="승인/거절/취소 사유를 남길 수 있습니다." />

            <button type="submit" className="button" disabled={!nextStatus || transitionMutation.isPending}>
              {transitionMutation.isPending ? '변경 중...' : '상태 변경 적용'}
            </button>
          </form>
        </section>
      )}

      <h3 style={{ marginTop: '2rem', marginBottom: '1rem' }}>상태 변경 이력</h3>

      {statusLogs.length === 0 ? (
        <div className="state-message">
          <p>상태 변경 이력이 없습니다.</p>
        </div>
      ) : (
        <div className="timeline-container">
          {statusLogs.map((log, index) => (
            <div key={log.id} className="timeline-item">
              <div className="timeline-marker">
                <div className="timeline-dot"></div>
                {index < statusLogs.length - 1 && <div className="timeline-line"></div>}
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className={`status-badge ${getStatusClass(log.to_status)}`}>
                    {getStatusLabel(log.from_status)} → {getStatusLabel(log.to_status)}
                  </span>
                  <span className="timeline-date">{new Date(log.created_at).toLocaleString('ko-KR')}</span>
                </div>
                <div className="timeline-body">
                  <p className="timeline-actor">담당자: {log.changed_by_name}</p>
                  {log.reason && <p className="timeline-reason">사유: {log.reason}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <MessagePanel applicationId={id!} currentUserId={userData?.data.user.id} />
    </div>
  )
}
