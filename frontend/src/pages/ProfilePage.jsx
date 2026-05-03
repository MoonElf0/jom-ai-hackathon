import { useState, useEffect } from 'react'
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
  const navigate = useNavigate()
  const { user } = useAuth()

  const [displayName,   setDisplayName]   = useState('')
  const [prefTransport, setPrefTransport] = useState('pt')
  const [favTypes,      setFavTypes]      = useState([])
  const [savedFacs,     setSavedFacs]     = useState([])
  const [saving,        setSaving]        = useState(false)
  const [saveMsg,       setSaveMsg]       = useState(null)
  const [loading,       setLoading]       = useState(true)

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
      }
      if (savedRes.data) setSavedFacs(savedRes.data.filter(r => r.facilities))
      setLoading(false)
    }
    load()
  }, [user])

  async function savePreferences() {
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('user_profiles').upsert({
      id:                  user.id,
      display_name:        displayName.trim() || null,
      preferred_transport: prefTransport,
      favorite_types:      favTypes,
      updated_at:          new Date().toISOString(),
    })
    setSaving(false)
    setSaveMsg(error ? 'error' : 'ok')
    setTimeout(() => setSaveMsg(null), 2000)
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
        <div style={{ width: 40 }} /> {/* Spacer to center title */}
      </div>

      <div className="profile-scroll">
        {/* ── Identity ── */}
        <div className="profile-identity">
          <div className="profile-avatar">{initials()}</div>
          <div className="profile-identity-info">
            <p className="profile-display-name">{displayName || 'Tampines Resident'}</p>
            <p className="profile-email">{user?.email}</p>
          </div>
        </div>

        {/* ── Personal Info ── */}
        <div className="profile-section">
          <h2 className="profile-section-title">Personal Info</h2>
          <p className="profile-section-sub">Update your display name.</p>
          <input
            className="profile-input"
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
          />
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
          <p className="profile-section-sub">{favTypes.length} types selected.</p>
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
              {saveMsg === 'ok' ? '✓ Settings saved successfully' : 'Failed to save settings'}
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
