import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './utils/useAuth'

// Apply saved theme before first render to avoid flash
const savedTheme = localStorage.getItem('jom-theme') || 'light'
document.documentElement.dataset.theme = savedTheme
import MapView          from './pages/MapView'
import AuthPage         from './pages/AuthPage'
import ProfilePage      from './pages/ProfilePage'
import ResetPasswordPage from './pages/ResetPasswordPage'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-loading"><div className="auth-loading-spinner" /></div>
  if (!user)   return <Navigate to="/auth" replace />
  return children
}

function RedirectIfAuthed({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-loading"><div className="auth-loading-spinner" /></div>
  if (user)    return <Navigate to="/map" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/map" replace />} />
        <Route path="/auth"           element={<RedirectIfAuthed><AuthPage /></RedirectIfAuthed>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/map"            element={<RequireAuth><MapView /></RequireAuth>} />
        <Route path="/profile"        element={<RequireAuth><ProfilePage /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  )
}
