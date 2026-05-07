import { useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/useAuth'
import '../styles/FacilityHub.css'

const WEATHER_STATES = [
  { icon: '🌤️', text: 'Sunny with a light breeze' },
  { icon: '🌦️', text: 'Rain in 20 mins' },
  { icon: '⛅', text: 'Cloudy, cool and breezy' },
  { icon: '🌧️', text: 'Showers arriving soon' },
]

const ALT_SPOTS = [
  {
    name: 'Block 201 Basketball Court',
    status: 'Completely empty right now',
    note: 'Freshly resurfaced and quiet for a low-key game.',
  },
  {
    name: 'Pocket Court @ Pavilion',
    status: 'Only 18% full',
    note: 'Great for a quick shooting session with fewer crowds.',
  },
  {
    name: 'Block 178 Community Court',
    status: 'Very calm and easy to access',
    note: 'Popular with locals looking for a relaxed session.',
  },
]

function formatFacilityType(type) {
  if (!type) return 'Facility'
  return type.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export default function FacilityHub() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const facility = location.state?.facility

  const [intentSet, setIntentSet] = useState(false)
  const [lockerUnlocked, setLockerUnlocked] = useState(false)
  const [showAlternative, setShowAlternative] = useState(false)
  const [crowdPercent] = useState(() => Math.min(100, Math.max(5, Math.round((facility?.crowd_level || 87) + 5 - Math.random() * 20))))
  const [weather] = useState(() => WEATHER_STATES[Math.floor(Math.random() * WEATHER_STATES.length)])
  const [vibe] = useState(() => (facility?.type === 'basketball_court' ? 'High-energy' : 'Calm'))

  const alternative = useMemo(() => {
    return ALT_SPOTS[Math.floor(Math.random() * ALT_SPOTS.length)]
  }, [])

  if (!facility) {
    return (
      <div className="facility-hub-page">
        <div className="facility-hub-header">
          <button className="hub-back-btn" onClick={() => navigate('/map')}>&larr; Back to Map</button>
          <div className="hub-header-title">Facility Hub</div>
        </div>
        <div className="facility-hub-fallback">
          <p>No facility selected yet.</p>
          <button className="hub-primary-btn" onClick={() => navigate('/map')}>Return to Map</button>
        </div>
      </div>
    )
  }

  const handleIntent = () => {
    setIntentSet(true)
    if (crowdPercent >= 80) {
      setShowAlternative(true)
    } else {
      setShowAlternative(false)
    }
  }

  return (
    <div className="facility-hub-page">
      <div className="facility-hub-header">
        <button className="hub-back-btn" onClick={() => navigate('/map')}>&larr; Back to Map</button>
        <div className="hub-header-title">Facility Hub</div>
      </div>

      <section className="hub-hero">
        <div className="hub-hero-overlay" />
        <div className="hub-hero-content">
          <span className="hub-hero-type">{formatFacilityType(facility.type)}</span>
          <h1>{facility.name}</h1>
          <p>{facility.address || 'Tampines, Singapore'}</p>
        </div>
      </section>

      <div className="hub-dashboard-grid">
        <article className="hub-card hub-card-big">
          <div className="hub-card-title">Current crowd</div>
          <div className="hub-card-value">{crowdPercent}%</div>
          <div className="hub-card-sub">{crowdPercent >= 85 ? 'Very busy' : crowdPercent >= 60 ? 'Moderate' : 'Light'}</div>
          <div className="hub-progress-bar"><div style={{ width: `${crowdPercent}%` }} /></div>
        </article>

        <article className="hub-card">
          <div className="hub-card-title">Weather</div>
          <div className="hub-card-value">{weather.icon}</div>
          <div className="hub-card-sub">{weather.text}</div>
        </article>

        <article className="hub-card">
          <div className="hub-card-title">Vibe</div>
          <div className="hub-card-value">{vibe}</div>
          <div className="hub-card-sub">Best for {vibe === 'High-energy' ? 'pickup games' : 'quiet practice'}</div>
        </article>
      </div>

      <section className="hub-action-panel">
        <div className="hub-action-copy">
          <h2>{facility.name}</h2>
          <p>Tap “I’m going here” to mark your intent and help the system recommend the best arrival window.</p>
        </div>
        <div className="hub-action-buttons">
          <button className="hub-primary-btn" onClick={handleIntent}>
            {intentSet ? 'I’m going here' : 'I’m going here'}
          </button>
          <button className="hub-secondary-btn" onClick={() => setLockerUnlocked(true)}>
            Unlock Smart Locker
          </button>
        </div>
      </section>

      {showAlternative && (
        <section className="hub-decoy-card">
          <div className="hub-decoy-badge">Looking for a quieter game?</div>
          <h3>{alternative.name}</h3>
          <p>{alternative.status}</p>
          <p>{alternative.note}</p>
          <button className="hub-tertiary-btn" onClick={() => navigate('/map')}>Explore alternative</button>
        </section>
      )}

      <section className="hub-stats-panel">
        <div className="hub-stats-card">
          <p className="hub-stats-label">Amenities</p>
          <ul>
            <li>🏀 2 full courts</li>
            <li>💧 Water fountain</li>
            <li>🔒 Smart locker</li>
            <li>🚻 Restrooms</li>
          </ul>
        </div>
        <div className="hub-stats-card">
          <p className="hub-stats-label">Capacity</p>
          <p className="hub-stats-value">Up to 32 players</p>
          <p className="hub-stats-note">Maximum 8 players per court</p>
        </div>
        <div className="hub-stats-card">
          <p className="hub-stats-label">Smart locker</p>
          <p className="hub-stats-value">{lockerUnlocked ? 'Unlocked' : 'Locked'}</p>
          <p className="hub-stats-note">Tap the button when you arrive.</p>
        </div>
      </section>

      <section className="hub-review-panel">
        <div className="hub-review-header">
          <h2>What people say</h2>
          <span>18 reviews</span>
        </div>
        <article className="hub-review-card">
          <div>
            <p className="hub-review-user">@MayaL</p>
            <p className="hub-review-stars">★★★★☆</p>
          </div>
          <p>Great atmosphere in the evening, but it gets crowded fast. Perfect for a fast-paced game.</p>
        </article>
      </section>
    </div>
  )
}
