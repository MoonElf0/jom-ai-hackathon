// src/components/FacilityHub.jsx
// Page C — The Facility Hub
// Full-screen bottom sheet triggered by tapping a map marker.
// Sections: Hero | Dashboard (Crowd / Weather / Vibe) | Redirect (Decoy) |
//           CTA "I'm Going Here" | Amenities | Smart Locker | Crowd Report | Reviews

import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../utils/useAuth'

// ─── Hero config per facility type ───────────────────────────────
const TYPE_HERO = {
  basketball_court:    { gradient: 'linear-gradient(135deg,#f97316 0%,#ea580c 100%)', emoji: '🏀' },
  badminton_court:     { gradient: 'linear-gradient(135deg,#a78bfa 0%,#7c3aed 100%)', emoji: '🏸' },
  tennis_court:        { gradient: 'linear-gradient(135deg,#fbbf24 0%,#d97706 100%)', emoji: '🎾' },
  volleyball_court:    { gradient: 'linear-gradient(135deg,#34d399 0%,#059669 100%)', emoji: '🏐' },
  football_field:      { gradient: 'linear-gradient(135deg,#4ade80 0%,#16a34a 100%)', emoji: '⚽' },
  futsal_court:        { gradient: 'linear-gradient(135deg,#60a5fa 0%,#2563eb 100%)', emoji: '🥅' },
  gym:                 { gradient: 'linear-gradient(135deg,#fb923c 0%,#dc2626 100%)', emoji: '💪' },
  fitness_corner:      { gradient: 'linear-gradient(135deg,#22d3ee 0%,#0891b2 100%)', emoji: '🏋️' },
  swimming_pool:       { gradient: 'linear-gradient(135deg,#38bdf8 0%,#0284c7 100%)', emoji: '🏊' },
  playground:          { gradient: 'linear-gradient(135deg,#4ade80 0%,#22d3ee 100%)', emoji: '🛝' },
  jogging_track:       { gradient: 'linear-gradient(135deg,#86efac 0%,#16a34a 100%)', emoji: '🏃' },
  cycling_path:        { gradient: 'linear-gradient(135deg,#fde68a 0%,#f59e0b 100%)', emoji: '🚴' },
  multi_purpose_court: { gradient: 'linear-gradient(135deg,#f472b6 0%,#db2777 100%)', emoji: '🏟️' },
  skate_park:          { gradient: 'linear-gradient(135deg,#94a3b8 0%,#475569 100%)', emoji: '🛹' },
  sheltered_pavilion:  { gradient: 'linear-gradient(135deg,#cbd5e1 0%,#64748b 100%)', emoji: '⛺' },
  park:                { gradient: 'linear-gradient(135deg,#4ade80 0%,#84cc16 100%)', emoji: '🌳' },
}
const DEFAULT_HERO = { gradient: 'linear-gradient(135deg,#6366f1 0%,#4338ca 100%)', emoji: '📍' }

// ─── Crowd score mapping ──────────────────────────────────────────
const OCCUPANCY_SCORE = { empty: 5, quiet: 25, moderate: 55, busy: 80, full: 100 }

// ─── Amenities per type ───────────────────────────────────────────
const AMENITIES_BY_TYPE = {
  basketball_court:    ['💡 Night lighting', '🅿️ Carpark nearby', '🚿 Shower nearby'],
  badminton_court:     ['💡 Indoor lighting', '❄️ Air-conditioned', '🚿 Shower nearby'],
  tennis_court:        ['💡 Night lighting', '🅿️ Carpark nearby', '🚿 Shower nearby'],
  volleyball_court:    ['💡 Night lighting', '🅿️ Carpark nearby'],
  football_field:      ['💡 Night lighting', '🚿 Changing room', '🅿️ Carpark nearby'],
  futsal_court:        ['💡 Indoor lighting', '❄️ Air-conditioned', '🚿 Shower nearby'],
  gym:                 ['❄️ Air-conditioned', '🚿 Shower nearby', '🔒 Locker available', '🅿️ Carpark nearby'],
  fitness_corner:      ['🌳 Outdoor & shaded', '💧 Water cooler nearby'],
  swimming_pool:       ['🚿 Changing room', '🔒 Locker available', '🏊 Lifeguard on duty', '🅿️ Carpark nearby'],
  playground:          ['🌳 Shaded area', '🚽 Toilet nearby', '🅿️ Carpark nearby'],
  jogging_track:       ['💡 Night lighting', '💧 Water point', '🌳 Scenic route'],
  cycling_path:        ['🌳 Park connector', '💡 Night lighting'],
  multi_purpose_court: ['💡 Night lighting', '🅿️ Carpark nearby'],
  skate_park:          ['💡 Night lighting', '🚽 Toilet nearby'],
  sheltered_pavilion:  ['☂️ Sheltered', '🔌 Electrical outlet', '🚽 Toilet nearby'],
  park:                ['🌳 Nature trail', '💧 Water point', '🚽 Toilet nearby', '🅿️ Carpark nearby'],
}

// ─── Vibe meta ───────────────────────────────────────────────────
const VIBE_META = {
  chill:       { emoji: '😌', label: 'Chill vibes'    },
  competitive: { emoji: '🔥', label: 'Competitive'    },
  family:      { emoji: '👨‍👩‍👧', label: 'Family-friendly' },
  quiet:       { emoji: '🤫', label: 'Quiet'           },
  busy:        { emoji: '🌊', label: 'Buzzing'         },
  social:      { emoji: '🤝', label: 'Social'          },
  training:    { emoji: '🏋️', label: 'Training mode'   },
}

const CROWD_LEVELS = [
  { value: 'empty',    label: '👻 Empty'    },
  { value: 'quiet',    label: '😌 Quiet'    },
  { value: 'moderate', label: '🙂 Moderate' },
  { value: 'busy',     label: '🔥 Busy'     },
  { value: 'full',     label: '🚫 Full'     },
]

// ─── Helpers ─────────────────────────────────────────────────────
function crowdColor(pct) {
  if (pct === null || pct === undefined) return '#94a3b8'
  if (pct <= 30) return '#22c55e'
  if (pct <= 60) return '#f59e0b'
  if (pct <= 80) return '#f97316'
  return '#ef4444'
}
function crowdLabel(pct) {
  if (pct === null || pct === undefined) return 'No data'
  if (pct <= 30) return 'Quiet'
  if (pct <= 60) return 'Moderate'
  if (pct <= 80) return 'Busy'
  return 'Very Busy'
}
function wc2emoji(code, rain) {
  if (rain)       return '🌧️'
  if (code <= 1)  return '☀️'
  if (code <= 3)  return '⛅'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '🌨️'
  if (code <= 99) return '⛈️'
  return '🌤️'
}
function formatType(type) {
  return (type || 'Facility').split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}
async function fetchCrowdAvg(facilityId) {
  const { data } = await supabase
    .from('crowd_reports')
    .select('level')
    .eq('facility_id', facilityId)
    .order('created_at', { ascending: false })
    .limit(3)
  if (!data?.length) return null
  const scores = data.map(r => OCCUPANCY_SCORE[r.level] ?? 50)
  return Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
}

// ══════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function FacilityHub({ facility, onClose, onNavigateTo }) {
  const { user } = useAuth()

  const [crowd,            setCrowd]            = useState(null)
  const [weather,          setWeather]          = useState(null)
  const [vibe,             setVibe]             = useState(null)
  const [reviews,          setReviews]          = useState([])
  const [avgRating,        setAvgRating]        = useState(null)
  const [intents,          setIntents]          = useState(0)
  const [userIntent,       setUserIntent]       = useState(false)
  const [alternative,      setAlternative]      = useState(null)
  const [lockerCode,       setLockerCode]       = useState(null)
  const [myRating,         setMyRating]         = useState(0)
  const [myComment,        setMyComment]        = useState('')
  const [reviewDone,       setReviewDone]       = useState(false)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reportingCrowd,   setReportingCrowd]   = useState(false)
  const [crowdReported,    setCrowdReported]    = useState(false)
  const [loading,          setLoading]          = useState(true)

  const hero      = TYPE_HERO[facility?.type] || DEFAULT_HERO
  const amenities = AMENITIES_BY_TYPE[facility?.type] || []
  const hasLocker = amenities.some(a => a.includes('Locker'))

  // ── Load all data on mount / facility change ───────────────────
  useEffect(() => {
    if (!facility) return
    let cancelled = false

    setCrowd(null); setWeather(null); setVibe(null)
    setReviews([]); setAvgRating(null); setIntents(0)
    setUserIntent(false); setAlternative(null); setLockerCode(null)
    setMyRating(0); setMyComment(''); setReviewDone(false)
    setCrowdReported(false); setLoading(true)

    Promise.all([
      // Crowd
      (async () => {
        try {
          const avg = await fetchCrowdAvg(facility.id)
          if (cancelled) return
          setCrowd(avg)
          if (avg !== null && avg >= 75) {
            const { data: sameType } = await supabase
              .from('facilities').select('id, name, address, type, lat, lng')
              .eq('type', facility.type).neq('id', facility.id).limit(20)
            if (!sameType?.length || cancelled) return
            const withCrowd = await Promise.all(
              sameType.map(async f => ({ ...f, crowd: (await fetchCrowdAvg(f.id)) ?? 25 }))
            )
            const quieter = withCrowd.filter(f => f.crowd < avg - 10).sort((a, b) => a.crowd - b.crowd)
            if (!cancelled && quieter.length) setAlternative(quieter[0])
          }
        } catch { /* no crowd data */ }
      })(),

      // Weather (OpenMeteo – free, no key)
      (async () => {
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${facility.lat}&longitude=${facility.lng}&minutely_15=precipitation,weather_code&forecast_minutely_15=4&timezone=Asia%2FSingapore`
          const data = await (await fetch(url)).json()
          const precip = data.minutely_15?.precipitation || []
          const codes  = data.minutely_15?.weather_code  || []
          const rain   = precip.some(v => v > 0)
          const code   = codes[0] ?? 0
          if (!cancelled) setWeather({ rain, code, emoji: wc2emoji(code, rain) })
        } catch {
          if (!cancelled) setWeather({ rain: false, code: 0, emoji: '☀️' })
        }
      })(),

      // Vibe (microclimate_tags last 24 h)
      (async () => {
        try {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          const { data } = await supabase
            .from('microclimate_tags').select('tag')
            .eq('facility_id', facility.id).gte('created_at', since)
            .order('created_at', { ascending: false }).limit(10)
          if (!data?.length || cancelled) return
          const tally = {}
          data.forEach(r => { tally[r.tag] = (tally[r.tag] || 0) + 1 })
          const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
          if (top && !cancelled) setVibe(top[0])
        } catch { /* no vibe */ }
      })(),

      // Reviews
      (async () => {
        try {
          const { data } = await supabase
            .from('facility_reviews')
            .select('id, rating, comment, created_at, user_id')
            .eq('facility_id', facility.id)
            .order('created_at', { ascending: false }).limit(20)
          if (!data?.length || cancelled) return
          setReviews(data)
          setAvgRating(Math.round(data.reduce((s, r) => s + r.rating, 0) / data.length * 10) / 10)
          if (user) {
            const mine = data.find(r => r.user_id === user.id)
            if (mine) { setMyRating(mine.rating); setMyComment(mine.comment || ''); setReviewDone(true) }
          }
        } catch { /* no reviews */ }
      })(),

      // Intents
      (async () => {
        try {
          const now = new Date().toISOString()
          const { count } = await supabase
            .from('facility_intents')
            .select('*', { count: 'exact', head: true })
            .eq('facility_id', facility.id).gt('expires_at', now)
          if (!cancelled) setIntents(count || 0)
          if (user) {
            const { data } = await supabase
              .from('facility_intents').select('id')
              .eq('facility_id', facility.id).eq('user_id', user.id)
              .gt('expires_at', now).limit(1)
            if (!cancelled) setUserIntent(!!data?.length)
          }
        } catch { /* no intents */ }
      })(),
    ]).finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [facility?.id, user?.id])

  // ── Actions ───────────────────────────────────────────────────
  async function toggleIntent() {
    if (!user || !facility) return
    if (userIntent) {
      await supabase.from('facility_intents')
        .delete().eq('facility_id', facility.id).eq('user_id', user.id)
      setIntents(v => Math.max(0, v - 1)); setUserIntent(false)
    } else {
      const expires = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
      await supabase.from('facility_intents').upsert(
        { facility_id: facility.id, user_id: user.id, expires_at: expires },
        { onConflict: 'facility_id,user_id' }
      )
      setIntents(v => v + 1); setUserIntent(true)
    }
  }

  async function submitCrowdReport(level) {
    if (!user || !facility || reportingCrowd) return
    setReportingCrowd(true)
    try {
      await supabase.from('crowd_reports').insert({ facility_id: facility.id, user_id: user.id, level })
      setCrowd(await fetchCrowdAvg(facility.id))
      setCrowdReported(true)
    } catch { /* ignore */ }
    finally { setReportingCrowd(false) }
  }

  async function submitReview() {
    if (!user || !facility || myRating === 0 || submittingReview) return
    setSubmittingReview(true)
    try {
      await supabase.from('facility_reviews').upsert(
        { facility_id: facility.id, user_id: user.id, rating: myRating, comment: myComment.trim() || null },
        { onConflict: 'facility_id,user_id' }
      )
      setReviewDone(true)
      const { data } = await supabase
        .from('facility_reviews').select('id, rating, comment, created_at, user_id')
        .eq('facility_id', facility.id).order('created_at', { ascending: false }).limit(20)
      if (data?.length) {
        setReviews(data)
        setAvgRating(Math.round(data.reduce((s, r) => s + r.rating, 0) / data.length * 10) / 10)
      }
    } catch { /* ignore */ }
    finally { setSubmittingReview(false) }
  }

  function unlockLocker() {
    setLockerCode(String(Math.floor(1000 + Math.random() * 9000)))
  }

  if (!facility) return null

  const vibeInfo    = vibe ? (VIBE_META[vibe] || { emoji: '✨', label: vibe }) : null
  const crowdColour = crowdColor(crowd)
  const ringPct     = crowd ?? 0
  const circumference = 2 * Math.PI * 18   // r=18 → ≈ 113.1

  return (
    <div className="hub-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hub-sheet">

        {/* ── Hero ── */}
        <div className="hub-hero" style={{ background: hero.gradient }}>
          <button className="hub-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
          <div className="hub-hero-emoji" aria-hidden="true">{hero.emoji}</div>
          <div className="hub-hero-info">
            <h2 className="hub-hero-name">{facility.name}</h2>
            <p className="hub-hero-type">{formatType(facility.type)}</p>
            {facility.address && <p className="hub-hero-addr">📍 {facility.address}</p>}
            {facility.is_verified === false && (
              <span className="hub-community-badge">★ Community Spot</span>
            )}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="hub-body">

          {/* Dashboard */}
          <div className="hub-dashboard">

            <div className="hub-dash-card">
              <p className="hub-dash-label">Crowd</p>
              {loading ? <div className="hub-dash-skeleton" /> : (
                <>
                  <svg className="hub-crowd-ring" viewBox="0 0 44 44" width="54" height="54" aria-hidden="true">
                    <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="4"/>
                    <circle cx="22" cy="22" r="18" fill="none" stroke={crowdColour} strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${ringPct / 100 * circumference} ${circumference}`}
                      transform="rotate(-90 22 22)"
                      style={{ transition: 'stroke-dasharray 0.6s ease' }}
                    />
                    <text x="22" y="27" textAnchor="middle" fontSize="10" fontWeight="700" fill={crowdColour}>
                      {crowd !== null ? `${crowd}%` : '–'}
                    </text>
                  </svg>
                  <p className="hub-dash-value" style={{ color: crowdColour }}>{crowdLabel(crowd)}</p>
                </>
              )}
            </div>

            <div className="hub-dash-card">
              <p className="hub-dash-label">Weather</p>
              {loading ? <div className="hub-dash-skeleton" /> : (
                <>
                  <p className="hub-dash-big-emoji">{weather?.emoji || '☀️'}</p>
                  <p className="hub-dash-value">{weather?.rain ? 'Rain soon' : 'Looks fine'}</p>
                </>
              )}
            </div>

            <div className="hub-dash-card">
              <p className="hub-dash-label">Vibe</p>
              {loading ? <div className="hub-dash-skeleton" /> : (
                <>
                  <p className="hub-dash-big-emoji">{vibeInfo?.emoji || '✨'}</p>
                  <p className="hub-dash-value">{vibeInfo?.label || 'No reports'}</p>
                </>
              )}
            </div>
          </div>

          {/* Decoy redirect */}
          {alternative && (
            <div className="hub-redirect">
              <div className="hub-redirect-icon">💡</div>
              <div className="hub-redirect-body">
                <p className="hub-redirect-title">Quieter option nearby</p>
                <p className="hub-redirect-name">{alternative.name}</p>
                <p className="hub-redirect-crowd">
                  <span style={{ color: crowdColor(alternative.crowd) }}>●</span>
                  {' '}{crowdLabel(alternative.crowd)}{' '}
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>({alternative.crowd}%)</span>
                </p>
              </div>
              <button className="hub-redirect-btn" onClick={() => { onNavigateTo?.(alternative); onClose() }}>
                Go →
              </button>
            </div>
          )}

          {/* CTA */}
          <div className="hub-cta-wrap">
            <button className={`hub-cta-btn${userIntent ? ' active' : ''}`} onClick={toggleIntent}>
              {userIntent ? "✅ I'm Going!" : "🏃 I'm Going Here"}
            </button>
            {intents > 0 && (
              <p className="hub-intent-badge">{intents} {intents === 1 ? 'person' : 'people'} going</p>
            )}
          </div>

          {onNavigateTo && (
            <button className="hub-route-btn" onClick={() => { onNavigateTo(facility); onClose() }}>
              🚌 Get Route
            </button>
          )}

          {/* Amenities */}
          {(amenities.length > 0 || facility.is_sheltered || facility.is_indoor) && (
            <div className="hub-section">
              <h3 className="hub-section-title">Amenities</h3>
              <div className="hub-amenities">
                {amenities.map((a, i) => <span key={i} className="hub-amenity-pill">{a}</span>)}
                {facility.is_sheltered && <span className="hub-amenity-pill">☂️ Sheltered</span>}
                {facility.is_indoor    && <span className="hub-amenity-pill">🏠 Indoor</span>}
              </div>
            </div>
          )}

          {/* Smart Locker */}
          {hasLocker && (
            <div className="hub-section">
              <h3 className="hub-section-title">Smart Locker</h3>
              <div className="hub-locker">
                {lockerCode ? (
                  <div className="hub-locker-code-wrap">
                    <p className="hub-locker-code">{lockerCode}</p>
                    <p className="hub-locker-hint">Valid for 30 min — enter at locker keypad</p>
                  </div>
                ) : (
                  <>
                    <p className="hub-locker-hint">Generate a temporary access code for available lockers</p>
                    <button className="hub-locker-btn" onClick={unlockLocker}>🔓 Unlock Locker</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Crowd Report */}
          {user && (
            <div className="hub-section">
              <h3 className="hub-section-title">Report Crowd</h3>
              {crowdReported ? (
                <p className="hub-crowd-thanks">✓ Thanks for reporting! Your update helps others.</p>
              ) : (
                <>
                  <p className="hub-section-sub">How busy is it right now?</p>
                  <div className="hub-crowd-btns">
                    {CROWD_LEVELS.map(cl => (
                      <button key={cl.value} className="hub-crowd-report-btn"
                        onClick={() => submitCrowdReport(cl.value)} disabled={reportingCrowd}>
                        {cl.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Reviews */}
          <div className="hub-section">
            <h3 className="hub-section-title">
              Reviews
              {avgRating !== null && (
                <span className="hub-avg-rating"> ⭐ {avgRating}{' '}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({reviews.length})</span>
                </span>
              )}
            </h3>

            {user && !reviewDone && (
              <div className="hub-review-form">
                <div className="hub-stars">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} className={`hub-star${myRating >= n ? ' active' : ''}`}
                      onClick={() => setMyRating(n)} aria-label={`${n} star`}>★</button>
                  ))}
                </div>
                <textarea className="hub-review-input"
                  placeholder="Share your experience (optional)…"
                  value={myComment} onChange={e => setMyComment(e.target.value)}
                  rows={3} maxLength={300} />
                <button className="hub-review-submit" onClick={submitReview}
                  disabled={myRating === 0 || submittingReview}>
                  {submittingReview ? <span className="hub-review-spinner" /> : 'Submit Review'}
                </button>
              </div>
            )}

            {reviewDone && <p className="hub-review-done">✓ Thanks for your review!</p>}
            {reviews.length === 0 && !user && (
              <p className="hub-no-reviews">No reviews yet — be the first to visit!</p>
            )}

            <div className="hub-reviews-list">
              {reviews.map(r => (
                <div key={r.id} className="hub-review-card">
                  <div className="hub-review-top">
                    <span className="hub-review-stars">
                      <span style={{ color: '#f59e0b' }}>{'★'.repeat(r.rating)}</span>
                      <span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - r.rating)}</span>
                    </span>
                    <span className="hub-review-date">
                      {new Date(r.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  {r.comment && <p className="hub-review-comment">{r.comment}</p>}
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 48 }} />
        </div>
      </div>
    </div>
  )
}
