import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'

export default function ResetPasswordPage() {
  const navigate  = useNavigate()
  const [ready,    setReady]    = useState(false)   // true once Supabase confirms recovery session
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [done,     setDone]     = useState(false)

  // Supabase sends the recovery token in the URL hash.
  // onAuthStateChange fires with PASSWORD_RECOVERY once it's parsed.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
      setTimeout(() => navigate('/map', { replace: true }), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-text">JOM AI</span>
          <span className="auth-logo-sub">Tampines</span>
        </div>

        <h1 className="auth-title">Set new password</h1>

        {!ready && !done && (
          <p className="auth-subtitle" style={{ marginBottom: 0 }}>
            Verifying your reset link…
            <span className="auth-spinner" style={{ marginLeft: 10, verticalAlign: 'middle' }} />
          </p>
        )}

        {done && (
          <div className="auth-alert success">
            Password updated! Redirecting you to the map…
          </div>
        )}

        {ready && !done && (
          <>
            <p className="auth-subtitle">Enter your new password below.</p>
            {error && <div className="auth-alert error">{error}</div>}

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-field">
                <label className="auth-label">New password</label>
                <input
                  className="auth-input"
                  type="password"
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              <div className="auth-field">
                <label className="auth-label">Confirm new password</label>
                <input
                  className="auth-input"
                  type="password"
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              <button className="auth-submit" type="submit" disabled={loading}>
                {loading ? <span className="auth-spinner" /> : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
