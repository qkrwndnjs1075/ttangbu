import { Outlet, Link, useNavigate } from 'react-router-dom'
import './Layout.css'

const AUTH_TOKEN_KEY = 'ttangbu_auth_token'

export default function Layout() {
  const navigate = useNavigate()
  const hasToken = !!localStorage.getItem(AUTH_TOKEN_KEY)

  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <h1 className="logo">
            <Link to="/">땅부</Link>
          </h1>
          <nav className="nav">
            <Link to="/listings" className="nav-link">매물 탐색</Link>
            <Link to="/my-applications" className="nav-link">내 신청</Link>
            <Link to="/my-listings" className="nav-link">내 매물</Link>
            {hasToken ? (
              <button
                type="button"
                className="nav-button"
                onClick={() => {
                  localStorage.removeItem(AUTH_TOKEN_KEY)
                  navigate('/login')
                }}
              >
                로그아웃
              </button>
            ) : (
              <>
                <Link to="/login" className="nav-link">로그인</Link>
                <Link to="/register" className="nav-link">회원가입</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <p>&copy; 2026 땅부. 모든 권리 보유.</p>
      </footer>
    </div>
  )
}
