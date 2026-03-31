import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import ListingsPage from './pages/ListingsPage'
import MyApplicationsPage from './pages/MyApplicationsPage'
import MyListingsPage from './pages/MyListingsPage'
import ApplicationTimelinePage from './pages/ApplicationTimelinePage'
import AuthPage from './pages/AuthPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ListingsPage />} />
          <Route path="/listings" element={<ListingsPage />} />
          <Route path="/my-applications" element={<RequireAuth><MyApplicationsPage /></RequireAuth>} />
          <Route path="/my-applications/:id" element={<RequireAuth><ApplicationTimelinePage /></RequireAuth>} />
          <Route path="/my-listings" element={<RequireAuth><MyListingsPage /></RequireAuth>} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
