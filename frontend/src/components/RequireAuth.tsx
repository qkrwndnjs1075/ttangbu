import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

const AUTH_TOKEN_KEY = 'ttangbu_auth_token'

interface RequireAuthProps {
  children: ReactNode
}

export default function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation()
  const token = localStorage.getItem(AUTH_TOKEN_KEY)

  if (!token) {
    const redirect = `${location.pathname}${location.search}`
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />
  }

  return <>{children}</>
}
