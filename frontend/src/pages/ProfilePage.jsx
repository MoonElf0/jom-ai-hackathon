import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../utils/useAuth'

const TRANSPORT_OPTIONS = [
  { value: 'pt',    label: '🚌 Bus / MRT' },
  { value: 'walk',  label: '🚶 Walk'      },
  { value: 'cycle', label: '🚲 Cycle'     },
  { value: 'drive', label: '🚗 Drive'     },
]

const FACILITY_TYPE_OPTIONS = [
  { value: 'basketball_court',    label: '🏀 Basketball'    },
  { value: 'badminton_court',     label: '🏸 Badminton'     },
  { value: 'tennis_court',        label: '🎾 Tennis'        },
  { value: 'volleyball_court',    label: '🏐 Volleyball'    },
  { value: 'football_field',      label: '⚽ Football'      },
  { value: 'futsal_court',        label: '🥅 Futsal'        },
  { value: 'gym',                 label: '💪 Gym'           },
  { value: 'fitness_corner',      label: '🏋️ Fitness'       },
  { value: 'swimming_pool',       label: '🏊 Swimming'      },
  { value: 'playground',          label: '🛝 Playground'    },
  { value: 'jogging_track',       label: '🏃 Jogging'       },
  { value: 'cycling_path',        label: '🚴 Cycling'       },
  { value: 'multi_purpose_court', label: '🏟️ Multi-Purpose' },
  { value: 'skate_park',          label: '🛹 Skate Park'    },
]

export default function ProfilePage() {
  const navigate    = useNavigate()
  const { user }    = useAuth()
  const fileInputRef = useRef(null)

  const [displayName,    setDisplayName]    = useState('')
  const [homeAddress,    setHomeAddress]    = useState('')
  const [bio,            setBio]            = useState('')
  const [avatarUrl,      setAvatarUrl]      = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError,    setAvatarError]    = useState(null)
  const [prefTransport,  setPrefTransport]  = useState('pt')
  const [favTypes,       setFavTypes]       = useState([])
  const [theme,          setTheme]          = useState(() => localStorage.getItem('jom-theme') || 'light')
  const [savedFacs,      setSavedFacs]      = useState([])
  const [saving,         setSaving]         = useState(false)
  const [saveMsg,        setSaveMsg]        = useState(null)
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('jom-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!user) return
    async function load() {
      setLoading(true)
      const [profRes, savedRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', user.id).single(),
        supabase
          .from('saved_facilities')
          .select('id, facility_id, facilities(id, name, type, address)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ])
      if (profRes.data) {
        setDisplayName(profRes.data.display_name || '')
        setPrefTransport(profRes.data.preferred_transport || 'pt')
        setFavTypes(profRes.data.favorite_types || [])
        setHomeAddress(profRes.data.home_address || '')
        setBio(profRes.data.bio || '')
        setAvatarUrl(profRes.data.avatar_url || null)
        if (profRes.data.theme) setTheme(profRes.data.theme)
      }
      if (savedRes.data) setSavedFacs(savedRes.data.filter(r => r.facilities))
      setLoading(false)
    }
    load()
  }, [user])

  // ── Avatar upload ──────────────────────────────────────────────
  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''   // reset so same file can be re-selected

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select an image file (JPG, PNG, etc.).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5 MB.')
      return
    }

    setAvatarUploading(true)
    setAvatarError(null)

    try {
      const ext  = file.name.split('.').pop().toLowerCase() || 'jpg'
      const path = `${user.id}/avatar.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      // Append timestamp so the browser doesn't serve the old cached version
      const freshUrl = `${urlData.publicUrl}?t=${Date.now()}`

      setAvatarUrl(freshUrl)

      // Immediately persist so it's available without clicking Save
      await supabase.from('user_profiles').upsert({
        id:         user.id,
        avatar_url: freshUrl,
        updated_at: new Date().toISOString(),
      })
    } catch (err) {
      setAvatarError(err.message || 'Upload failed. Check your connection.')
    } finally {
      setAvatarUploading(false)
    }
  }

  async function savePreferences() {
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('user_profiles').upsert({
      id:                  user.id,
      display_name:        displayName.trim() || null,
      preferred_transport: prefTransport,
      favorite_types:      favTypes,
      home_address:        homeAddress.trim() || null,
      bio:                 bio.trim() || null,
      avatar_url:          avatarUrl || null,
      theme,
      updated_at:          new Date().toISOString(),
    })
    setSaving(false)
    setSaveMsg(error ? 'error' : 'ok')
    setTimeout(() => setSaveMsg(null), 2500)
  }

  async function unsaveFacility(savedId) {
    await supabase.from('saved_facilities').delete().eq('id', savedId)
    setSavedFacs(prev => prev.filter(r => r.id !== savedId))
  }

  function toggleFavType(type) {
    setFavTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
  }

  function initials() {
    const name = displayName.trim() || user?.email || ''
    return name.slice(0, 2).toUpperCase()
  }

  function formatType(type) {
    return (type || 'Facility').split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="profile-loading-spinner" />
      </div>
    )
  }

  return (
    <div className="profile-page">
      {/* ── Header ── */}
      <div className="profile-header">
        <button className="profile-back" onClick={() => navigate('/map')} aria-label="Back">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="profile-header-title">Profile Settings</h1>
        <div style={{ width: 40 }} />
      </div>

      <div className="profile-scroll">
        {/* ── Identity ── */}
        <div className="profile-identity">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />

          {/* Avatar — tap to upload */}
          <button
            className="profile-avatar-wrap"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            aria-label="Change profile photo"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile"
                className="profile-avatar profile-avatar-img"
              />
            ) : (
              <div className="profile-avatar profile-avatar-initials">
                {initials()}
              </div>
            )}
            <div className="profile-avatar-edit-badge">
              {avatarUploading ? <div className="profile-avatar-spinner" /> : '📷'}
            </div>
          </button>

          <div className="profile-identity-info">
            <p className="profile-display-name">{displayName || 'Tampines Resident'}</p>
            <p className="profile-email">{user?.email}</p>
            <p className="profile-tap-hint">
              {avatarUploading ? 'Uploading…' : 'Tap photo to change'}
            </p>
          </div>
        </div>

        {avatarError && (
          <p className="profile-avatar-error">{avatarError}</p>
        )}

        {/* ── Personal Info ── */}
        <div className="profile-section">
          <h2 className="profile-section-title">Personal Info</h2>
          <p className="profile-section-sub">Your display name shown in the app.</p>
          <input
            className="profile-input"
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
          />
        </div>

        {/* ── Home Location ── */}
        <div className="profile-section">
          <h2 className="profile-section-title">Home Location</h2>
          <p className="profile-section-sub">Your block or street — JOM AI will suggest facilities close to you.</p>
          <div className="profile-input-icon-wrap">
            <span className="profile-input-icon">📍</span>
            <input
              className="profile-input profile-input-with-icon"
              type="text"
              placeholder="e.g. Blk 456 Tampines St 44"
              value={homeAddress}
              onChange={e => setHomeAddress(e.target.value)}
            />
          </div>
        </div>

        {/* ── About Me (AI Bio) ── */}
        <div className="profile-section">
          <h2 className="profile-section-title">About Me</h2>
          <p className="profile-section-sub">Tell JOM AI about yourself — this personalises every response.</p>
          <textarea
            className="profile-textarea"
            placeholder="e.g. I jog every morning and prefer sheltered courts. Usually out around 7 AM on weekdays..."
            value={bio}
            onChange={e => setBio(e.target.value)}
            rows={4}
            maxLength={400}
          />
          <p className="profile-bio-count">{bio.length} / 400</p>
        </div>

        {/* ── Appearance ── */}
        <div className="profile-section">
          <h2 className="profile-section-title">Appearance</h2>
          <p className="profile-section-sub">Choose your preferred colour scheme.</p>
          <div className="profile-theme-row">
            <button
              className={`profile-theme-btn${theme === 'light' ? ' active' : ''}`}
              onClick={() => setTheme('light')}
            >
              <span className="profile-theme-icon">☀️</span>
              <span>Light</span>
            </button>
            <button
              className={`profile-theme-btn${theme === 'dark' ? ' active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              <span className="profile-theme-icon">🌙</span>
              <span>Dark</span>
            </button>
          </div>
        </div>

        {/* ── Transport ── */}
        <div className="profile-section">
          <h2 className="profile-section-title">Default Transport</h2>
          <p className="profile-section-sub">Preferred mode for navigation.</p>
          <div className="profile-transport-grid">
            {TRANSPORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`profile-transport-btn${prefTransport === opt.value ? ' active' : ''}`}
                onClick={() => setPrefTransport(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Activities ── */}
        <div className="profile-section">
          <h2 className="profile-section-title">Favourite Activities</h2>
          <p className="profile-section-sub">{favTypes.length} selected.</p>
          <div className="profile-fav-grid">
            {FACILITY_TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`profile-fav-pill${favTypes.includes(opt.value) ? ' active' : ''}`}
                onClick={() => toggleFavType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Saved Places ── */}
        <div className="profile-section">
          <h2 className="profile-section-title">Saved Places</h2>
          {savedFacs.length === 0 ? (
            <p className="profile-empty">No saved places yet. Tap ❤️ on the map!</p>
          ) : (
            <div className="profile-saved-list">
              {savedFacs.map(row => {
                const f = row.facilities
                return (
                  <div key={row.id} className="profile-saved-card">
                    <div className="profile-saved-info">
                      <p className="profile-saved-name">{f.name}</p>
                      <p className="profile-saved-type">{formatType(f.type)}</p>
                      <p className="profile-saved-addr">{f.address}</p>
                    </div>
                    <div className="profile-saved-actions">
                      <button className="profile-saved-nav" onClick={() => navigate('/map')} title="Go to map">📍</button>
                      <button className="profile-saved-remove" onClick={() => unsaveFacility(row.id)} title="Remove">🗑️</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div style={{ marginTop: 24 }}>
          {saveMsg && (
            <p className={`profile-save-msg ${saveMsg === 'ok' ? 'ok' : 'err'}`}>
              {saveMsg === 'ok' ? '✓ Settings saved' : 'Failed to save — check your connection'}
            </p>
          )}
          <button className="profile-save-btn" onClick={savePreferences} disabled={saving}>
            {saving ? <span className="profile-save-spinner" /> : 'Save Changes'}
          </button>
          <button className="profile-signout" onClick={signOut}>Log out</button>
        </div>
      </div>
    </div>
  )
}
