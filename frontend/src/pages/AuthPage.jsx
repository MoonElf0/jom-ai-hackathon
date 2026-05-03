import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'

export default function AuthPage() {
  const navigate = useNavigate()
  const [mode,        setMode]        = useState('login')   // 'login' | 'signup' | 'forgot'
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error,       setError]       = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [success,     setSuccess]     = useState(null)

  function switchMode(next) {
    setMode(next)
    setError(null)
    setSuccess(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      if (mode === 'forgot') {
        const redirectTo = `${window.location.origin}/reset-password`
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
        if (error) throw error
        setSuccess('Password reset link sent! Check your email.')
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/map', { replace: true })
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error

        if (data.user) {
          await supabase.from('user_profiles').upsert({
            id:                  data.user.id,
            display_name:        displayName.trim() || null,
            preferred_transport: 'pt',
            favorite_types:      [],
          })
        }

        if (data.session) {
          navigate('/map', { replace: true })
        } else {
          setSuccess('Check your email to confirm your account, then log in.')
          switchMode('login')
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isForgot = mode === 'forgot'
  const isLogin  = mode === 'login'

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-text">JOM AI</span>
          <span className="auth-logo-sub">Tampines</span>
        </div>

        <h1 className="auth-title">
          {isForgot ? 'Reset password' : isLogin ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="auth-subtitle">
          {isForgot
            ? "We'll send a reset link to your email"
            : isLogin
              ? 'Sign in to your Tampines guide'
              : 'Join the Tampines community'}
        </p>

        {error   && <div className="auth-alert error">{error}</div>}
        {success && <div className="auth-alert success">{success}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && !isForgot && (
            <div className="auth-field">
              <label className="auth-label">Display name (optional)</label>
              <input
                className="auth-input"
                type="text"
                placeholder="e.g. Ahmad"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {!isForgot && (
            <div className="auth-field">
              <label className="auth-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Password
                {isLogin && (
                  <button type="button" className="auth-forgot-link" onClick={() => switchMode('forgot')}>
                    Forgot password?
                  </button>
                )}
              </label>
              <input
                className="auth-input"
                type="password"
                placeholder={isLogin ? '••••••••' : 'Min. 6 characters'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
            </div>
          )}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? <span className="auth-spinner" />
              : isForgot ? 'Send reset link' : isLogin ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {isForgot ? (
          <p className="auth-toggle">
            Remember your password?{' '}
            <button className="auth-toggle-btn" onClick={() => switchMode('login')}>Sign in</button>
          </p>
        ) : (
          <p className="auth-toggle">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button className="auth-toggle-btn" onClick={() => switchMode(isLogin ? 'signup' : 'login')}>
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
