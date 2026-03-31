import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import StatusBadge from '../components/StatusBadge'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const AUTH_TOKEN_KEY = 'ttangbu_auth_token'

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (!token) {
    return {}
  }
  return {
    'Authorization': `Bearer ${token}`,
  }
}

interface User {
  id: number
  email: string
  name: string
}

interface Application {
  id: number
  listing_id: number
  applicant_id: number
  status: string
  message: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
  listing_title: string
  applicant_name: string
  applicant_email: string
}

interface MeResponse {
  success: boolean
  data: {
    user: User
  }
}

interface ApplicationsResponse {
  success: boolean
  data: {
    applications: Application[]
  }
}

export default function MyApplicationsPage() {
  // Fetch current user
  const { data: meData, isLoading: meLoading, error: meError } = useQuery<MeResponse>({
    queryKey: ['auth-me'],
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

  // Fetch all applications
  const { data: applicationsData, isLoading: applicationsLoading } = useQuery<ApplicationsResponse>({
    queryKey: ['applications-all'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/applications`, {
        headers: getAuthHeaders(),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return response.json()
    },
    enabled: !!meData,
  })

  // Handle unauthenticated state
  if (meError) {
    return (
      <div className="page">
        <h2>내 신청</h2>
        <div className="state-message error-message">
          <p>로그인이 필요합니다. 인증 정보를 확인해주세요.</p>
          <Link to="/login?redirect=/my-applications" className="button" style={{ marginTop: '0.75rem' }}>
            로그인하러 가기
          </Link>
        </div>
      </div>
    )
  }

  if (meLoading) {
    return (
      <div className="page">
        <h2>내 신청</h2>
        <div className="state-message">
          <p>로딩 중...</p>
        </div>
      </div>
    )
  }

  const currentUser = meData?.data.user

  // Filter applications where user is the applicant
  const myApplications = applicationsData?.data.applications.filter(
    (app) => app.applicant_id === currentUser?.id
  ) || []

  const isLoading = applicationsLoading

  return (
    <div className="page">
      <h2>내 신청</h2>
      <p>제출한 임대 신청 목록을 표시합니다.</p>

      {isLoading && (
        <div className="state-message">
          <p>로딩 중...</p>
        </div>
      )}

      {!isLoading && (
        <>
          {myApplications.length === 0 ? (
            <div className="state-message">
              <p>제출한 신청이 없습니다.</p>
            </div>
          ) : (
            <div className="application-list">
              {myApplications.map((app) => (
                <div key={app.id} className="application-card">
                  <div className="application-header">
                    <div>
                      <h4>{app.listing_title}</h4>
                      <p className="application-meta">
                        신청일: {new Date(app.created_at).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>
                  
                  {app.message && (
                    <div className="application-body">
                      <p className="application-message">메시지: {app.message}</p>
                    </div>
                  )}
                  
                  {app.start_date && (
                    <div className="application-body">
                      <p className="application-dates">
                        시작일: {new Date(app.start_date).toLocaleDateString('ko-KR')}
                        {app.end_date && ` ~ 종료일: ${new Date(app.end_date).toLocaleDateString('ko-KR')}`}
                      </p>
                    </div>
                  )}
                  
                  <div className="application-footer">
                    <span className="application-id">신청 ID: {app.id}</span>
                    <Link to={`/my-applications/${app.id}`} className="timeline-link">
                      타임라인 보기 →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
