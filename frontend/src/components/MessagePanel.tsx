import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

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

interface Message {
  id: number
  application_id: number
  sender_id: number
  content: string
  created_at: string
  sender_name: string
  sender_email: string
}

interface MessagesResponse {
  success: boolean
  data: {
    messages: Message[]
  }
}

interface MessagePanelProps {
  applicationId: string
  currentUserId?: number
}

export default function MessagePanel({ applicationId, currentUserId }: MessagePanelProps) {
  const [messageContent, setMessageContent] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<MessagesResponse>({
    queryKey: ['messages', applicationId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/applications/${applicationId}/messages`, {
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return response.json()
    },
    retry: false,
  })

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(`${API_BASE}/applications/${applicationId}/messages`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', applicationId] })
      setMessageContent('')
    },
  })

  const handleSendMessage = (e: FormEvent) => {
    e.preventDefault()
    if (messageContent.trim()) {
      sendMutation.mutate(messageContent)
    }
  }

  if (isLoading) {
    return (
      <div className="message-panel">
        <h3>대화</h3>
        <div className="state-message">
          <p>메시지를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="message-panel">
        <h3>대화</h3>
        <div className="state-message error-message">
          <p>메시지를 불러올 수 없습니다.</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            {error instanceof Error ? error.message : '알 수 없는 오류'}
          </p>
        </div>
      </div>
    )
  }

  const messages = data?.data.messages || []

  return (
    <div className="message-panel">
      <h3>대화</h3>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="state-message">
            <p>아직 메시지가 없습니다. 첫 메시지를 보내보세요!</p>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((message) => {
              const isOwnMessage = currentUserId === message.sender_id
              return (
                <div
                  key={message.id}
                  className={`message-item ${isOwnMessage ? 'message-own' : 'message-other'}`}
                >
                  <div className="message-header">
                    <span className="message-sender">{message.sender_name}</span>
                    <span className="message-time">
                      {new Date(message.created_at).toLocaleString('ko-KR')}
                    </span>
                  </div>
                  <div className="message-content">
                    {message.content}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <form onSubmit={handleSendMessage} className="message-form">
        <textarea
          className="message-input"
          value={messageContent}
          onChange={(e) => setMessageContent(e.target.value)}
          placeholder="메시지를 입력하세요..."
          rows={3}
          disabled={sendMutation.isPending}
        />
        <button
          type="submit"
          className="button"
          disabled={!messageContent.trim() || sendMutation.isPending}
        >
          {sendMutation.isPending ? '전송 중...' : '메시지 보내기'}
        </button>
        {sendMutation.isError && (
          <p className="error-message" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
            메시지 전송 실패: {sendMutation.error instanceof Error ? sendMutation.error.message : '알 수 없는 오류'}
          </p>
        )}
      </form>
    </div>
  )
}
