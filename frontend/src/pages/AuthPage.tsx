import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const AUTH_TOKEN_KEY = 'ttangbu_auth_token'

type AuthMode = 'login' | 'register'

interface ApiErrorResponse {
  error?: string
  message?: string
}

interface LoginSuccessResponse {
  success: boolean
  data: {
    token: string
    expires_at: string
    user: {
      id: number
      email: string
      name: string
      phone: string | null
      role: string
    }
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const typed = payload as ApiErrorResponse
  return typed.message ?? typed.error ?? fallback
}

export default function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const redirectTarget = useMemo(() => searchParams.get('redirect') ?? '/my-applications', [searchParams])
  const pathDefaultMode: AuthMode = location.pathname === '/register' ? 'register' : 'login'

  const [mode, setMode] = useState<AuthMode>(pathDefaultMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const existingToken = localStorage.getItem(AUTH_TOKEN_KEY)

  useEffect(() => {
    setMode(pathDefaultMode)
  }, [pathDefaultMode])

  const resetMessages = () => {
    setErrorMessage('')
    setSuccessMessage('')
  }

  const clearAuth = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    resetMessages()
    setSuccessMessage('로그아웃되었습니다.')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resetMessages()
    setIsSubmitting(true)

    try {
      if (mode === 'register') {
        const registerResponse = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            name,
            phone: phone.trim() || undefined,
          }),
        })

        const registerPayload = (await registerResponse.json()) as unknown
        if (!registerResponse.ok) {
          throw new Error(extractErrorMessage(registerPayload, '회원가입에 실패했습니다.'))
        }

        setMode('login')
        setSuccessMessage('회원가입이 완료되었습니다. 방금 만든 계정으로 로그인하세요.')
        setIsSubmitting(false)
        return
      }

      const loginResponse = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const loginPayload = (await loginResponse.json()) as unknown
      if (!loginResponse.ok) {
        throw new Error(extractErrorMessage(loginPayload, '로그인에 실패했습니다.'))
      }

      const typedPayload = loginPayload as LoginSuccessResponse
      localStorage.setItem(AUTH_TOKEN_KEY, typedPayload.data.token)
      navigate(redirectTarget)
    } catch (error) {
      const message = error instanceof Error ? error.message : '인증 처리 중 오류가 발생했습니다.'
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="page auth-page">
      <h2>로그인 / 회원가입</h2>

      {existingToken && (
        <div className="state-message">
          <p>이미 로그인된 상태입니다.</p>
          <div className="auth-inline-actions">
            <Link to="/my-applications" className="button">내 신청 보기</Link>
            <button type="button" className="button button-secondary" onClick={clearAuth}>로그아웃</button>
          </div>
        </div>
      )}

      <div className="auth-card">
        <div className="auth-mode-toggle">
          <button
            type="button"
            className={`button ${mode === 'login' ? '' : 'button-secondary'}`}
            onClick={() => {
              setMode('login')
              resetMessages()
            }}
          >
            로그인
          </button>
          <button
            type="button"
            className={`button ${mode === 'register' ? '' : 'button-secondary'}`}
            onClick={() => {
              setMode('register')
              resetMessages()
            }}
          >
            회원가입
          </button>
        </div>

        {successMessage && <p className="auth-success">{successMessage}</p>}
        {errorMessage && <p className="auth-error">{errorMessage}</p>}

        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="email">이메일</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@example.com"
            required
          />

          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="8자 이상"
            minLength={8}
            required
          />

          {mode === 'register' && (
            <>
              <label htmlFor="name">이름</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="홍길동"
                required
              />

              <label htmlFor="phone">전화번호 (선택)</label>
              <input
                id="phone"
                type="text"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="010-1234-5678"
              />
            </>
          )}

          <button type="submit" className="button" disabled={isSubmitting}>
            {isSubmitting ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>
      </div>
    </div>
  )
}
