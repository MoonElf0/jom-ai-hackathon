import { useState } from 'react'
import '../index.css'

const TYPE_COLOURS = {
  fitness_corner: '#22d3ee', playground: '#4ade80', basketball_court: '#f97316',
  badminton_court: '#a78bfa', tennis_court: '#fbbf24', swimming_pool: '#38bdf8',
  multi_purpose_court: '#f472b6', gym: '#fb923c', jogging_track: '#86efac',
  sheltered_pavilion: '#94a3b8',
}

function formatType(t) {
  return (t || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ── Demo crowd/status data seeded by facility id ─────────────────────────────
const CROWD_LEVELS = [
  { label: 'Empty',    pct: 5,  colour: '#10b981', people: 0,  desc: 'Basically empty — perfect time to go!' },
  { label: 'Quiet',   pct: 25, colour: '#34d399', people: 2,  desc: 'Very quiet. Plenty of space available.' },
  { label: 'Moderate',pct: 55, colour: '#fbbf24', people: 7,  desc: 'Moderately busy. Some wait time possible.' },
  { label: 'Busy',    pct: 80, colour: '#f97316', people: 14, desc: 'Getting crowded. Arrive early to get a spot.' },
  { label: 'Full',    pct: 98, colour: '#ef4444', people: 20, desc: 'Completely full. Try again in ~30 minutes.' },
]

const MOCK_TAGS = [
  ['☀️ Too Hot', '#f97316'], ['💨 Good Breeze', '#38bdf8'], ['🌧️ Wet Floor', '#60a5fa'],
  ['🌿 Well Maintained', '#10b981'], ['🦟 Mosquitoes', '#a78bfa'], ['💡 Good Lighting', '#fbbf24'],
]

function seed(id) {
  let h = 0
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return h
}

function StatusTab({ facility }) {
  const h      = seed(facility.id)
  const level  = CROWD_LEVELS[h % CROWD_LEVELS.length]
  const tags   = MOCK_TAGS.filter((_, i) => (h >> i) & 1).slice(0, 3)
  const temp   = 28 + (h % 7)
  const humid  = 70 + (h % 20)
  const uvIdx  = 3 + (h % 9)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0' }}>

      {/* ── Crowd level ── */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Live Crowd</p>
            <p style={{ fontSize: '20px', fontWeight: 800, color: level.colour, margin: 0 }}>{level.label}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '28px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>{level.people}</p>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>people nearby</p>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ height: '8px', borderRadius: '99px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ height: '100%', width: `${level.pct}%`, borderRadius: '99px', background: level.colour, transition: 'width 0.5s ease' }} />
        </div>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>{level.desc}</p>
        <p style={{ fontSize: '10px', color: '#475569', marginTop: 6, margin: 0 }}>📡 Via GPS geofencing · Updated just now</p>
      </div>

      {/* ── Geofence info ── */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '14px' }}>
        <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Geofence Zone (30 m radius)</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { icon: '📍', val: `${level.people} active`, label: 'JOM AI users' },
            { icon: '⏳', val: '~25 min', label: 'Avg. session' },
            { icon: '🏃', val: `${level.people > 0 ? Math.floor(level.people * 0.3) : 0} leaving`, label: 'Leaving soon' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: '#0f172a', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '16px', margin: '0 0 4px' }}>{s.icon}</p>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', margin: '0 0 2px' }}>{s.val}</p>
              <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Micro-climate tags ── */}
      {tags.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '14px' }}>
          <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Community Tags</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {tags.map(([tag, colour]) => (
              <span key={tag} style={{
                padding: '4px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: 600,
                background: `${colour}22`, color: colour, border: `1px solid ${colour}44`,
              }}>{tag}</span>
            ))}
          </div>
          <p style={{ fontSize: '10px', color: '#475569', marginTop: 8, margin: '8px 0 0' }}>Reported by residents in the last 4 hours</p>
        </div>
      )}

      {/* ── Weather snapshot ── */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '14px' }}>
        <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Weather Now</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { icon: '🌡️', val: `${temp}°C`, label: 'Temp' },
            { icon: '💧', val: `${humid}%`,  label: 'Humidity' },
            { icon: '☀️', val: `UV ${uvIdx}`, label: 'UV Index' },
          ].map(w => (
            <div key={w.label} style={{ flex: 1, background: '#0f172a', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '16px', margin: '0 0 4px' }}>{w.icon}</p>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', margin: '0 0 2px' }}>{w.val}</p>
              <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>{w.label}</p>
            </div>
          ))}
        </div>
        {facility.is_sheltered && (
          <p style={{ fontSize: '12px', color: '#34d399', marginTop: 10, margin: '10px 0 0' }}>✅ Sheltered — weather has less impact here</p>
        )}
      </div>

    </div>
  )
}

export default function FacilitySidePane({ facility, onClose, onNavigateTo, user, isSaved, onSaveToggle }) {
  const [activeTab, setActiveTab] = useState('overview')

  if (!facility) return null

  return (
    <div className="side-pane">
      <button className="side-pane-close" onClick={onClose}>✕</button>

      <div className="side-pane-image">
        <span className="image-placeholder-text">📸 No photos yet</span>
      </div>

      <div className="side-pane-content">
        <h2 className="side-pane-title">{facility.name}</h2>
        <div className="side-pane-rating">
          <span className="rating-score">4.2</span>
          <span className="rating-stars">★★★★☆</span>
          <span className="rating-count">(18)</span>
          <span className="rating-price">· Free</span>
        </div>
        <p className="side-pane-type" style={{ color: TYPE_COLOURS[facility.type] || '#6366f1' }}>
          {formatType(facility.type)}
          {facility.is_verified === false && <span style={{ color: '#f59e0b', marginLeft: '6px' }}>★ Community spot</span>}
        </p>

        <div className="side-pane-tabs">
          <button className={`side-pane-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
          <button className={`side-pane-tab ${activeTab === 'status'   ? 'active' : ''}`} onClick={() => setActiveTab('status')}>Status</button>
          <button className={`side-pane-tab ${activeTab === 'reviews'  ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>Reviews</button>
        </div>

        <div className="side-pane-actions">
          <button className="side-pane-action-btn" onClick={() => { onNavigateTo?.(facility); onClose(); }}>
            <div className="side-pane-action-icon" style={{ background: '#0ea5e9' }}>🚌</div>
            <span>Directions</span>
          </button>
          <button className="side-pane-action-btn" onClick={() => onSaveToggle?.(facility)}>
            <div className="side-pane-action-icon" style={{ background: isSaved ? '#f43f5e' : '#334155' }}>{isSaved ? '❤️' : '🤍'}</div>
            <span>Save</span>
          </button>
          <button className="side-pane-action-btn">
            <div className="side-pane-action-icon" style={{ background: '#334155' }}>📱</div>
            <span>Send to phone</span>
          </button>
          <button className="side-pane-action-btn">
            <div className="side-pane-action-icon" style={{ background: '#334155' }}>🔗</div>
            <span>Share</span>
          </button>
        </div>

        <div className="side-pane-tab-content">
          {activeTab === 'overview' && (
            <>
              <div className="side-pane-info-row">
                <span className="side-pane-info-icon">📍</span>
                <span className="side-pane-info-text">{facility.address || 'Tampines, Singapore'}</span>
              </div>
              <div className="side-pane-info-row">
                <span className="side-pane-info-icon">🕒</span>
                <span className="side-pane-info-text" style={{ color: '#10b981' }}>Open 24 Hours</span>
              </div>
              {(facility.is_sheltered || facility.is_indoor) && (
                <div className="side-pane-info-row">
                  <span className="side-pane-info-icon">✨</span>
                  <span className="side-pane-info-text">
                    {facility.is_sheltered && 'Sheltered'}
                    {facility.is_indoor && (facility.is_sheltered ? ' · Indoor' : 'Indoor')}
                  </span>
                </div>
              )}
            </>
          )}

          {activeTab === 'status' && <StatusTab facility={facility} />}

          {activeTab === 'reviews' && (
            <>
              {user ? (
                <div className="side-pane-review-input-container">
                  <input type="text" placeholder="Share your experience..." className="side-pane-review-input" />
                  <button className="side-pane-post-review-btn">Post</button>
                </div>
              ) : (
                <p className="side-pane-login-prompt">Log in to post a review.</p>
              )}

              <div className="side-pane-review-card">
                <div className="side-pane-review-header">
                  <div className="side-pane-reviewer-avatar">JD</div>
                  <div>
                    <p className="side-pane-reviewer-name">John D.</p>
                    <p className="side-pane-reviewer-stars">★★★★★ <span className="side-pane-review-time">2 months ago</span></p>
                  </div>
                </div>
                <p className="side-pane-review-body">Great courts, usually empty in the mornings! Very clean and well maintained.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

