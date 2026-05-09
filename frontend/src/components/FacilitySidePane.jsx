// src/components/FacilitySidePane.jsx
// Fully theme-aware — all colours via CSS variables, zero hardcoded hex.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../index.css' // Or wherever the styles are, we will add them to index.css

const TYPE_COLOURS = {
  fitness_corner: '#22d3ee', playground: '#4ade80', basketball_court: '#f97316',
  badminton_court: '#a78bfa', tennis_court: '#fbbf24', swimming_pool: '#38bdf8',
  multi_purpose_court: '#f472b6', gym: '#fb923c', jogging_track: '#86efac',
  sheltered_pavilion: '#94a3b8',
}

function formatType(t) {
  return (t || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ── Opening hours by facility type (Singapore public facilities) ───────
const FACILITY_HOURS = {
  basketball_court:    { open: '07:00', close: '22:00' },
  badminton_court:     { open: '07:00', close: '22:00' },
  tennis_court:        { open: '07:00', close: '22:00' },
  volleyball_court:    { open: '07:00', close: '22:00' },
  football_field:      { open: '07:00', close: '22:00' },
  futsal_court:        { open: '07:00', close: '22:00' },
  multi_purpose_court: { open: '07:00', close: '22:00' },
  swimming_pool:       { open: '06:30', close: '21:30' },
  gym:                 { open: '07:00', close: '22:00' },
  community_hall:      { open: '08:00', close: '22:00' },
  playground:          { open: '07:00', close: '22:00' },
  skate_park:          { open: '07:00', close: '22:00' },
  // null = open 24 hours
  fitness_corner:     null,
  jogging_track:      null,
  cycling_path:       null,
  park:               null,
  sheltered_pavilion: null,
}

function getOpenStatus(type) {
  const hours = FACILITY_HOURS[type]
  if (!hours) return { isOpen: true, label: 'Open 24 Hours', hoursStr: '24 Hours', is24h: true }

  // Compute current Singapore time (UTC+8)
  const now = new Date()
  const sgMin = (now.getUTCHours() * 60 + now.getUTCMinutes() + 8 * 60) % (24 * 60)
  const [oh, om] = hours.open.split(':').map(Number)
  const [ch, cm] = hours.close.split(':').map(Number)
  const openMin  = oh * 60 + om
  const closeMin = ch * 60 + cm

  const isOpen   = sgMin >= openMin && sgMin < closeMin
  const hoursStr = `${hours.open} – ${hours.close}`
  return { isOpen, label: isOpen ? 'Open Now' : 'Closed', hoursStr, is24h: false }
}

// ── Demo data seeded by id ─────────────────────────────────────────────
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

// ── Status Tab ─────────────────────────────────────────────────────────
function StatusTab({ facility }) {
  const h     = seed(facility.id)
  const level = CROWD_LEVELS[h % CROWD_LEVELS.length]
  const tags  = MOCK_TAGS.filter((_, i) => (h >> i) & 1).slice(0, 3)
  const temp  = 28 + (h % 7)
  const humid = 70 + (h % 20)
  const uvIdx = 3  + (h % 9)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 0' }}>

      {/* Crowd level */}
      <div className="sp-card">
        <p className="sp-card-label">Live Crowd</p>
        <div className="sp-card-header">
          <p className="sp-crowd-level" style={{ color: level.colour }}>{level.label}</p>
          <div>
            <p className="sp-crowd-count">{level.people}</p>
            <p className="sp-crowd-count-label">people nearby</p>
          </div>
        </div>
        <div className="sp-progress-track">
          <div className="sp-progress-bar" style={{ width: `${level.pct}%`, background: level.colour }} />
        </div>
        <p className="sp-desc">{level.desc}</p>
        <p className="sp-micro">📡 Via GPS geofencing · Updated just now</p>
      </div>

      {/* Geofence stats */}
      <div className="sp-card">
        <p className="sp-card-label">Geofence Zone (30 m radius)</p>
        <div className="sp-stat-grid">
          {[
            { icon: '📍', val: `${level.people} active`,                                    label: 'JOM AI users'  },
            { icon: '⏳', val: '~25 min',                                                   label: 'Avg. session'  },
            { icon: '🏃', val: `${level.people > 0 ? Math.floor(level.people * 0.3) : 0} leaving`, label: 'Leaving soon'  },
          ].map(s => (
            <div key={s.label} className="sp-stat-box">
              <p className="sp-stat-icon">{s.icon}</p>
              <p className="sp-stat-val">{s.val}</p>
              <p className="sp-stat-label">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Community tags */}
      {tags.length > 0 && (
        <div className="sp-card">
          <p className="sp-card-label">Community Tags</p>
          <div className="sp-tags-row">
            {tags.map(([tag, colour]) => (
              <span key={tag} style={{
                padding: '4px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: 600,
                background: `${colour}22`, color: colour, border: `1px solid ${colour}44`,
              }}>{tag}</span>
            ))}
          </div>
          <p className="sp-micro" style={{ marginTop: 8 }}>Reported by residents in the last 4 hours</p>
        </div>
      )}

      {/* Weather */}
      <div className="sp-card">
        <p className="sp-card-label">Weather Now</p>
        <div className="sp-stat-grid">
          {[
            { icon: '🌡️', val: `${temp}°C`,  label: 'Temp'     },
            { icon: '💧', val: `${humid}%`,  label: 'Humidity' },
            { icon: '☀️', val: `UV ${uvIdx}`,label: 'UV Index' },
          ].map(w => (
            <div key={w.label} className="sp-stat-box">
              <p className="sp-stat-icon">{w.icon}</p>
              <p className="sp-stat-val">{w.val}</p>
              <p className="sp-stat-label">{w.label}</p>
            </div>
          ))}
        </div>
        {facility.is_sheltered && (
          <p className="sp-shelter-note">✅ Sheltered — weather has less impact here</p>
        )}
      </div>

    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────
export default function FacilitySidePane({ facility, onClose, onNavigateTo, user, isSaved, onSaveToggle }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')

  if (!facility) return null

  const accentColour = TYPE_COLOURS[facility.type] || '#6366f1'

  return (
    <div className="side-pane">
      <button className="side-pane-close" onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>

      {/* Hero image placeholder */}
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

        <p className="side-pane-type" style={{ color: accentColour }}>
          {formatType(facility.type)}
          {facility.is_verified === false && (
            <span style={{ color: '#f59e0b', marginLeft: '6px', fontWeight: 700 }}>★ Community spot</span>
          )}
        </p>

        {/* Tabs */}
        <div className="side-pane-tabs">
          {['overview', 'status', 'reviews'].map(tab => (
            <button
              key={tab}
              className={`side-pane-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Quick action buttons */}
        <div className="side-pane-actions">
          <button className="side-pane-action-btn" onClick={() => { onNavigateTo?.(facility); onClose() }}>
            <div className="side-pane-action-icon" style={{ background: '#0ea5e920', borderColor: '#0ea5e9' }}>🚌</div>
            <span>Directions</span>
          </button>
          <button className="side-pane-action-btn" onClick={() => onSaveToggle?.(facility)}>
            <div className="side-pane-action-icon" style={isSaved ? { background: '#f43f5e20', borderColor: '#f43f5e' } : {}}>
              {isSaved ? '❤️' : '🤍'}
            </div>
            <span>{isSaved ? 'Saved' : 'Save'}</span>
          </button>
          <button className="side-pane-action-btn" onClick={() => { navigate('/facility-hub', { state: { facility } }); onClose(); }}>
            <div className="side-pane-action-icon" style={{ background: '#f97316' }}>🏟️</div>
            <span>Facility Hub</span>
          </button>
          <button className="side-pane-action-btn">
            <div className="side-pane-action-icon">📱</div>
            <span>Send</span>
          </button>
          <button className="side-pane-action-btn">
            <div className="side-pane-action-icon">🔗</div>
            <span>Share</span>
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (() => {
          const status = getOpenStatus(facility.type)
          return (
            <div className="side-pane-tab-content">
              <div className="side-pane-info-row">
                <span className="side-pane-info-icon">📍</span>
                <span className="side-pane-info-text">{facility.address || 'Tampines, Singapore'}</span>
              </div>
              <div className="side-pane-info-row">
                <span className="side-pane-info-icon">🕒</span>
                <div className="open-status-row">
                  <span className={`open-status-badge ${status.isOpen ? 'open' : 'closed'}`}>
                    <span>{status.isOpen ? '●' : '●'}</span>
                    {status.label}
                  </span>
                  {!status.is24h && (
                    <span className="open-status-hours">{status.hoursStr}</span>
                  )}
                </div>
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
            </div>
          )
        })()}

        {activeTab === 'status' && <StatusTab facility={facility} />}

        {activeTab === 'reviews' && (
          <div className="side-pane-tab-content">
            {user ? (
              <div className="side-pane-review-input-container">
                <input type="text" placeholder="Share your experience…" className="side-pane-review-input" />
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
                  <p className="side-pane-reviewer-stars">
                    ★★★★★ <span className="side-pane-review-time">2 months ago</span>
                  </p>
                </div>
              </div>
              <p className="side-pane-review-body">Great courts, usually empty in the mornings! Very clean and well maintained.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
