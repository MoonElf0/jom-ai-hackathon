// src/pages/MapView.jsx

import { useEffect, useState, useRef, memo, lazy, Suspense, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../utils/useAuth'
import { isInTampines } from '../utils/tampinesBoundary'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

const FacilityMap = lazy(() => import('../components/FacilityMap'))
import SearchBar from '../components/SearchBar'
import FacilitySidePane from '../components/FacilitySidePane'

// ── Travel mode metadata ──────────────────────────────────────────
const MODE_ICONS  = { walk: '🚶', drive: '🚗', cycle: '🚲', pt: '🚌' }
const MODE_LABELS = { walk: 'Walking', drive: 'Driving', cycle: 'Cycling', pt: 'Transit' }

// ── Navigation constants ──────────────────────────────────────────
const TRANSPORT_MODES = [
  { label: '🚌 Bus / MRT', value: 'pt'    },
  { label: '🚶 Walk',       value: 'walk'  },
  { label: '🚲 Cycle',      value: 'cycle' },
  { label: '🚗 Drive',      value: 'drive' },
]

const SPOT_TYPE_OPTIONS = [
  { value: 'basketball_court',    label: '🏀 Basketball Court'    },
  { value: 'badminton_court',     label: '🏸 Badminton Court'     },
  { value: 'tennis_court',        label: '🎾 Tennis Court'        },
  { value: 'volleyball_court',    label: '🏐 Volleyball Court'    },
  { value: 'football_field',      label: '⚽ Football Field'      },
  { value: 'futsal_court',        label: '🥅 Futsal Court'        },
  { value: 'gym',                 label: '💪 Gym'                 },
  { value: 'fitness_corner',      label: '🏋️ Fitness Corner'      },
  { value: 'swimming_pool',       label: '🏊 Swimming Pool'       },
  { value: 'playground',          label: '🛝 Playground'          },
  { value: 'jogging_track',       label: '🏃 Jogging Track'       },
  { value: 'cycling_path',        label: '🚴 Cycling Path'        },
  { value: 'multi_purpose_court', label: '🏟️ Multi-Purpose Court' },
  { value: 'skate_park',          label: '🛹 Skate Park'          },
  { value: 'sheltered_pavilion',  label: '⛺ Sheltered Pavilion'  },
  { value: 'park',                label: '🌳 Park'                },
]

// Fallback origin for users outside Tampines
const TAMPINES_MRT_LAT = 1.35468
const TAMPINES_MRT_LNG = 103.94565

// Matches navigation intent in typed text
const NAV_REGEX = /\b(go to|take me|get me|navigate|direction|how (do|to) (i |get to|reach)|get to|route to|way to|bring me|head to|want(?:na)? to (?:go|navigate)|wanna go|want to go)\b/i

// Extracts destination from various navigation phrases (not anchored — works mid-sentence)
const NAV_WITH_DEST = /(?:(?:go|take me|get me|navigate|bring me|head|get)\s+(?:to|towards?|me to)|(?:want(?:na)?\s+to\s+(?:go|navigate)(?:\s+to)?|wanna\s+go(?:\s+to)?))\s+(.+)/i

// Maps user-typed facility keywords to Supabase type values
const FACILITY_TYPE_MAP = {
  'basketball':          'basketball_court',
  'basketball court':    'basketball_court',
  'badminton':           'badminton_court',
  'badminton court':     'badminton_court',
  'tennis':              'tennis_court',
  'tennis court':        'tennis_court',
  'volleyball':          'volleyball_court',
  'volleyball court':    'volleyball_court',
  'football':            'football_field',
  'soccer':              'football_field',
  'futsal':              'futsal_court',
  'futsal court':        'futsal_court',
  'gym':                 'gym',
  'fitness':             'fitness_corner',
  'fitness corner':      'fitness_corner',
  'swimming':            'swimming_pool',
  'swim':                'swimming_pool',
  'pool':                'swimming_pool',
  'swimming pool':       'swimming_pool',
  'playground':          'playground',
  'jogging':             'jogging_track',
  'jogging track':       'jogging_track',
  'running track':       'jogging_track',
  'cycling':             'cycling_path',
  'cycling path':        'cycling_path',
  'mpc':                 'multi_purpose_court',
  'multi purpose court': 'multi_purpose_court',
  'skate':               'skate_park',
  'skate park':          'skate_park',
}

function detectFacilityType(query) {
  return FACILITY_TYPE_MAP[query.toLowerCase().trim()] || null
}

// ── Stable message ID counter ─────────────────────────────────────
let _msgIdCounter = 100
const nextId = () => ++_msgIdCounter

function mkGreeting() {
  return {
    id:      nextId(),
    role:    'ai',
    text:    "Hey! I'm JOM AI, your Tampines neighbourhood guide. What can I help you with?",
    buttons: [
      { label: '🗺️ Navigate somewhere', value: '__nav__'  },
      { label: '🔍 Ask a question',     value: '__chat__' },
    ],
  }
}

// ── Strip markdown from AI replies ───────────────────────────────
function formatReply(text) {
  if (!text) return text
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** → bold
    .replace(/\*([^*\n]+?)\*/g, '$1')  // *italic* → italic
    .replace(/`([^`]+?)`/g, '$1')      // `code` → code
    .replace(/^#{1,6}\s+/gm, '')       // ## headers
    .replace(/^(\d+)\.\s+/gm, '• ')   // 1. item → • item
    .replace(/^[-–—]\s+/gm, '• ')     // - item → • item
    .trim()
}

// ── Haversine distance (km) ───────────────────────────────────────
function distKm(lat1, lng1, lat2, lng2) {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Strip "go to / take me to / …" prefix + americanise spellings ─
function stripNavPrefix(text) {
  return text
    .replace(/^(?:go|take me|navigate|bring me|head|get)\s+(?:to|towards?)\s+/i, '')
    .replace(/\bcenter\b/gi, 'centre')  // US → SG spelling
    .trim()
}

// ══════════════════════════════════════════════════════════════════
// NAVBAR
// ══════════════════════════════════════════════════════════════════
const Navbar = memo(function Navbar({ onNavigateProfile, onSignOut }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    if (!isMenuOpen) return
    const close = (e) => {
      if (!e.target.closest('.dropdown-wrapper')) setIsMenuOpen(false)
    }
    const t = setTimeout(() => document.addEventListener('pointerdown', close), 30)
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', close) }
  }, [isMenuOpen])

  return (
    <nav className="navbar">
      <div className="dropdown-wrapper">
        <button
          className={`btn-menu${isMenuOpen ? ' is-open' : ''}`}
          onClick={() => setIsMenuOpen(v => !v)}
          aria-label="Open navigation menu"
          aria-expanded={isMenuOpen}
        >
          <div className="btn-menu-bar" />
          <div className="btn-menu-bar" />
          <div className="btn-menu-bar" />
        </button>

        <div className={`dropdown-menu${isMenuOpen ? ' is-open' : ''}`} role="menu" align="center">
          <button className="dropdown-item" onClick={() => setIsMenuOpen(false)} role="menuitem">
            Map Home
          </button>
          <button className="dropdown-item" onClick={() => setIsMenuOpen(false)} role="menuitem">
            Saved Areas
          </button>
          <button className="dropdown-item danger" onClick={onSignOut} role="menuitem">
            Log Out
          </button>
        </div>
      </div>

      <div className="navbar-logo">
        <span className="navbar-logo-text">JOM AI</span>
        <span className="navbar-logo-sub">Tampines</span>
      </div>

      <button className="btn-profile" onClick={onNavigateProfile} aria-label="Go to profile">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>
    </nav>
  )
})

// ── Build step list for a PT itinerary ───────────────────────────
function buildPTSteps(legs) {
  if (!legs?.length) return []
  return legs.map((leg) => {
    const dist = leg.distance
      ? leg.distance >= 1000
        ? `${(leg.distance / 1000).toFixed(1)} km`
        : `${Math.round(leg.distance)} m`
      : ''
    if (leg.mode === 'WALK') {
      return { mode: 'WALK', icon: '🚶', action: `Walk ${dist} to ${leg.to?.name || 'next stop'}`, detail: null }
    }
    if (leg.mode === 'BUS') {
      const stops = (leg.intermediateStops?.length || 0) + 2
      return {
        mode: 'BUS', icon: '🚌',
        action: `Bus ${leg.route || '–'}: ${leg.from?.name || ''} → ${leg.to?.name || ''}`,
        detail: `${stops} stop${stops !== 1 ? 's' : ''} · ${dist}`,
      }
    }
    const stops    = (leg.intermediateStops?.length || 0) + 2
    const fromName = (leg.from?.name || '').replace(/ MRT STATION$/, '')
    const toName   = (leg.to?.name   || '').replace(/ MRT STATION$/, '')
    return {
      mode: leg.mode, icon: '🚇',
      action: `${leg.route || leg.mode} Line: ${fromName} → ${toName}`,
      detail: `${stops} stop${stops !== 1 ? 's' : ''} · ${dist}`,
    }
  })
}

// ══════════════════════════════════════════════════════════════════
// ROUTE PANEL
// ══════════════════════════════════════════════════════════════════
const RoutePanel = memo(function RoutePanel({ routeInfo, onClear }) {
  const [showSteps, setShowSteps] = useState(false)

  const { type, destinationName, summary, itinerary, instructions, notice } = routeInfo || {}
  const dist    = summary?.distance || 0
  const distStr = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : dist > 0 ? `${Math.round(dist)} m` : ''
  const durStr  = summary?.duration > 0 ? `~${summary.duration} min` : ''
  const ptSteps   = useMemo(() => type === 'pt' ? buildPTSteps(itinerary?.legs) : [], [type, itinerary])
  const walkSteps = type !== 'pt' && instructions?.length > 0 ? instructions : []
  const hasSteps  = ptSteps.length > 0 || walkSteps.length > 0

  if (!routeInfo) return null

  return (
    <div className="route-panel" role="region" aria-label="Active route">
      <div className="route-panel-header">
        <span className="route-panel-mode-icon" aria-hidden="true">{MODE_ICONS[type] || '📍'}</span>
        <div className="route-panel-info">
          <p className="route-panel-dest">{destinationName}</p>
          <p className="route-panel-meta">
            {MODE_LABELS[type] || type}
            {(distStr || durStr) && ' · '}{distStr}{distStr && durStr && ' · '}{durStr}
          </p>
        </div>
        <button className="route-panel-close" onClick={onClear} aria-label="Clear route">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {notice && (
        <p className="route-panel-notice">{notice}</p>
      )}

      {type === 'pt' && itinerary?.legs?.length > 0 && (
        <div className="route-panel-legs">
          {itinerary.legs.map((leg, i) => (
            <span key={i} className={`route-leg-badge route-leg-${leg.mode?.toLowerCase()}`}>
              {leg.mode === 'WALK' ? '🚶 Walk' : leg.mode === 'BUS' ? `🚌 ${leg.route || 'Bus'}` : `🚇 ${leg.route || 'MRT'}`}
            </span>
          ))}
        </div>
      )}

      {hasSteps && (
        <button className="route-steps-toggle" onClick={() => setShowSteps(v => !v)} aria-expanded={showSteps}>
          {showSteps ? 'Hide directions ▲' : 'Show directions ▼'}
        </button>
      )}

      {showSteps && (
        <div className="route-steps">
          {type === 'pt'
            ? ptSteps.map((step, i) => (
                <div key={i} className={`route-step route-step-${step.mode?.toLowerCase()}`}>
                  <span className="route-step-icon">{step.icon}</span>
                  <div className="route-step-body">
                    <span className="route-step-action">{step.action}</span>
                    {step.detail && <span className="route-step-detail">{step.detail}</span>}
                  </div>
                </div>
              ))
            : walkSteps.map((instr, i) => (
                <div key={i} className="route-step route-step-walk">
                  <span className="route-step-num">{i + 1}</span>
                  <div className="route-step-body">
                    <span className="route-step-action">{instr[9] || instr[0]}</span>
                    {instr[5] && instr[5] !== '0m' && <span className="route-step-detail">{instr[5]}</span>}
                  </div>
                </div>
              ))
          }
        </div>
      )}
    </div>
  )
})

// ══════════════════════════════════════════════════════════════════
// MAP AREA
// ══════════════════════════════════════════════════════════════════
const MapArea = memo(function MapArea({ facilities, loading, error, routeInfo, userLocation, onClearRoute, onNavigateTo, user, savedFacilityIds, onSaveToggle, pinMode, pendingPin, onTogglePinMode, onMapClick, selectedFacility, onSelectFacility, onShowDetails }) {
  return (
    <div className="map-area">
      <div style={{ position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, width: 'calc(100% - 32px)', maxWidth: '520px' }}>
        <SearchBar facilities={facilities} onSelectFacility={onSelectFacility} />
      </div>
      {loading && (
        <div className="map-loading" aria-live="polite">
          <div className="map-loading-spinner" />
          <p className="map-loading-text">Loading Tampines…</p>
        </div>
      )}
      {error && (
        <div className="map-error" role="alert">
          <div className="map-error-card">
            <p className="map-error-title">Failed to load map</p>
            <p className="map-error-msg">{error}</p>
          </div>
        </div>
      )}
      {/* Pin mode banner */}
      {pinMode && (
        <div className="pin-mode-banner">
          📍 Tap anywhere on the map to place your spot
        </div>
      )}

      {/* Add Spot FAB */}
      <button
        className={`map-fab${pinMode ? ' active' : ''}`}
        onClick={onTogglePinMode}
        aria-label={pinMode ? 'Cancel adding spot' : 'Add new spot'}
        title={pinMode ? 'Cancel' : 'Add a new spot'}
      >
        {pinMode ? '✕' : '+'}
      </button>

      <Suspense fallback={null}>
        <FacilityMap
          facilities={facilities}
          routeInfo={routeInfo}
          userLocation={userLocation}
          selectedFacility={selectedFacility}
          onNavigateTo={onNavigateTo}
          user={user}
          savedFacilityIds={savedFacilityIds}
          onSaveToggle={onSaveToggle}
          pinMode={pinMode}
          pendingPin={pendingPin}
          onMapClick={onMapClick}
          onShowDetails={onShowDetails}
        />
      </Suspense>
      <RoutePanel routeInfo={routeInfo} onClear={onClearRoute} />
    </div>
  )
})

// ══════════════════════════════════════════════════════════════════
// CHAT SHEET
//
// Flow states:
//   idle        → greeting with action buttons
//   nav_dest    → text input: where to go?
//   nav_mode    → 4 transport mode buttons (input hidden)
//   nav_confirm → confirm "Go to X by Y?" (input hidden)
//   routing     → calling OneMap, no AI (input hidden)
//   chat        → general queries → AI
//
// Navigation NEVER touches the AI.
// Location is polled every 30 s for proximity sorting + AI context.
// ══════════════════════════════════════════════════════════════════
const ChatSheet = memo(function ChatSheet({ onRouteReady, defaultNavMode = 'pt', userProfile = null }) {
  const [isOpen,    setIsOpen]    = useState(false)
  const [messages,  setMessages]  = useState(() => [mkGreeting()])
  const [flowState, setFlowState] = useState('idle')
  const [navDest,   setNavDest]   = useState(null)
  const [navMode,   setNavMode]   = useState(defaultNavMode)
  const [input,     setInput]     = useState('')
  const [isTyping,  setIsTyping]  = useState(false)
  const bodyRef      = useRef(null)
  const inputRef     = useRef(null)
  const touchStartY  = useRef(null)
  const touchCurrY   = useRef(null)
  // Live location — useRef so location ticks don't cause re-renders
  const userLatLngRef = useRef(null)

  // Sync preferred transport when user profile loads
  useEffect(() => { setNavMode(defaultNavMode) }, [defaultNavMode])

  // ── Poll GPS every 30 s ──────────────────────────────────────────
  useEffect(() => {
    function updateLoc() {
      navigator.geolocation?.getCurrentPosition(
        pos => { userLatLngRef.current = [pos.coords.latitude, pos.coords.longitude] },
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      )
    }
    updateLoc()
    const id = setInterval(updateLoc, 30000)
    return () => clearInterval(id)
  }, [])

  // Auto-scroll — small delay lets DOM paint buttons before scrolling
  useEffect(() => {
    const t = setTimeout(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }, 60)
    return () => clearTimeout(t)
  }, [messages, isTyping])

  // Focus input (not during button-only states)
  useEffect(() => {
    const noInput = flowState === 'nav_mode' || flowState === 'routing'
    if (isOpen && !noInput) setTimeout(() => inputRef.current?.focus(), 450)
  }, [isOpen, flowState])

  // Blur keyboard on close
  const toggle = () => {
    setIsOpen(v => {
      if (v) inputRef.current?.blur()
      return !v
    })
  }

  // ── Message helpers ──────────────────────────────────────────────
  function addMsg(msg) {
    setMessages(prev => [...prev, { id: nextId(), ...msg }])
  }
  function updateMsg(id, patch) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  }
  function markUsed(id) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, buttonsUsed: true } : m))
  }

  // ── OneMap search (single attempt) ──────────────────────────────
  async function oneMapSearch(q) {
    if (!q) return []
    const res = await fetch(`${API_BASE}/api/onemap/search?searchVal=${encodeURIComponent(q)}`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || [])
      .map(r => ({
        name:    (r.BUILDING || r.SEARCHVAL || r.ADDRESS || '').trim(),
        address: (r.ADDRESS || '').trim(),
        lat:     parseFloat(r.LATITUDE),
        lng:     parseFloat(r.LONGITUDE),
      }))
      .filter(r => r.name && !isNaN(r.lat) && !isNaN(r.lng))
      // deduplicate by name
      .filter((r, i, arr) => arr.findIndex(x => x.name === r.name) === i)
  }

  // ── Search with fallbacks + proximity sort, restricted to Tampines ─
  async function searchDest(rawQuery) {
    const base = stripNavPrefix(rawQuery)
    if (!base) return []

    // Append "Tampines" to bias OneMap results toward the area
    const attempts = [
      `${base} Tampines`,
      base,
      `${base} Singapore`,
      !base.match(/\b(mrt|lrt|station|bus)\b/i) ? `${base} MRT Tampines` : null,
    ]

    for (const q of attempts) {
      if (!q) continue
      const results = await oneMapSearch(q)
      // Keep only results that fall inside the Tampines boundary polygon
      const inTampines = results.filter(r => isInTampines(r.lat, r.lng))
      if (inTampines.length) {
        const loc = userLatLngRef.current
        if (loc) {
          inTampines.sort((a, b) =>
            distKm(loc[0], loc[1], a.lat, a.lng) - distKm(loc[0], loc[1], b.lat, b.lng)
          )
        }
        return inTampines.slice(0, 5)
      }
    }
    return []
  }

  // ── Search + show results as buttons ────────────────────────────
  // If query matches a facility type keyword → query Supabase and show pick buttons.
  // Otherwise → OneMap search and go straight to transport mode (single top result).
  async function runDestSearch(destQuery) {
    setIsTyping(true)
    try {
      const facilityType = detectFacilityType(destQuery)

      if (facilityType) {
        // Direct Supabase query — no AI, no OneMap
        const { data } = await supabase
          .from('facilities')
          .select('id, name, type, address, lat, lng')
          .eq('type', facilityType)
          .limit(10)

        const loc     = userLatLngRef.current
        const results = (data || [])
          .filter(f => f.lat && f.lng && isInTampines(f.lat, f.lng))
          .sort((a, b) => loc
            ? distKm(loc[0], loc[1], a.lat, a.lng) - distKm(loc[0], loc[1], b.lat, b.lng)
            : 0
          )
          .slice(0, 5)

        if (!results.length) {
          addMsg({ role: 'ai', text: `No ${destQuery} found in Tampines lah. Try another facility?` })
          setFlowState('nav_dest')
        } else {
          setFlowState('nav_mode')
          addMsg({
            role:    'ai',
            text:    `Found ${results.length} ${destQuery}${results.length > 1 ? 's' : ''} nearby. Pick one:`,
            buttons: results.map(f => ({
              label: `📍 ${f.name}`,
              value: `__dest__${JSON.stringify({ lat: f.lat, lng: f.lng, name: f.name })}`,
            })),
          })
        }
      } else {
        // OneMap search — always pick closest result
        const results = await searchDest(destQuery)
        if (!results.length) {
          addMsg({
            role: 'ai',
            text: `Couldn't find "${destQuery.slice(0, 40)}" in Tampines lah. I only support destinations within Tampines — try a block number, road name, or landmark here.`,
          })
          setFlowState('nav_dest')
        } else {
          const dest       = results[0]
          const addrSuffix = dest.address && dest.address !== dest.name
            ? `\n${dest.address}` : ''
          setNavDest(dest)
          setFlowState('nav_mode')
          addMsg({
            role:    'ai',
            text:    `Found: ${dest.name}${addrSuffix}\n\nHow would you like to get there?`,
            buttons: TRANSPORT_MODES.map(m => ({ label: m.label, value: `__mode__${m.value}` })),
          })
        }
      }
    } catch {
      addMsg({ role: 'ai', text: 'Search failed. Check your connection and try again.' })
      setFlowState('nav_dest')
    } finally {
      setIsTyping(false)
    }
  }

  // ── Execute routing (no AI) ──────────────────────────────────────
  async function doRoute(dest, mode, loadId) {
    try {
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 10000, maximumAge: 30000,
        })
      )
      const rawLat = position.coords.latitude
      const rawLng = position.coords.longitude
      userLatLngRef.current = [rawLat, rawLng]

      let userLat = rawLat
      let userLng = rawLng
      if (!isInTampines(rawLat, rawLng)) {
        userLat = TAMPINES_MRT_LAT
        userLng = TAMPINES_MRT_LNG
        addMsg({
          role: 'ai',
          text: "You're outside Tampines lah — I only support Tampines residents! Routing from Tampines MRT instead.",
        })
      }

      const now  = new Date()
      const date = [String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'), now.getFullYear()].join('-')
      const time = [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'), String(now.getSeconds()).padStart(2, '0')].join(':')

      const params = new URLSearchParams({
        start: `${userLat},${userLng}`, end: `${dest.lat},${dest.lng}`, routeType: mode,
        ...(mode === 'pt' ? { date, time, mode: 'TRANSIT', maxWalkDistance: '1000', numItineraries: '3' } : {}),
      })

      const routeRes  = await fetch(`${API_BASE}/api/onemap/route?${params}`)
      const routeData = await routeRes.json()
      if (routeData.error) throw new Error(routeData.error)

      const routeInfo = { type: mode, destinationName: dest.name, destination: dest }
      if (mode === 'pt') {
        const itin = routeData.plan?.itineraries?.[0]
        const hasTransit = itin?.legs?.some(l => l.mode && l.mode !== 'WALK')

        if (!hasTransit) {
          // No transit legs — off-hours or no service. Fall back to walk.
          addMsg({ role: 'ai', text: 'Bus and MRT service is not available at this hour — public transport in Singapore typically stops operating past midnight and resumes around 5:30 AM. Showing walking route instead lah.' })
          const walkParams = new URLSearchParams({
            start: `${userLat},${userLng}`, end: `${dest.lat},${dest.lng}`, routeType: 'walk',
          })
          const walkRes  = await fetch(`${API_BASE}/api/onemap/route?${walkParams}`)
          const walkData = await walkRes.json()
          if (!walkData.route_geometry) throw new Error('No route found.')
          routeInfo.type         = 'walk'
          routeInfo.geometry     = walkData.route_geometry
          routeInfo.summary      = {
            duration: Math.round((walkData.route_summary?.total_time || 0) / 60),
            distance: walkData.route_summary?.total_distance || 0,
          }
          routeInfo.instructions = walkData.route_instructions || []
        } else {
          routeInfo.itinerary = itin
          const totalDist = itin.legs.reduce((s, l) => s + (l.distance || 0), 0)
          routeInfo.summary = { duration: Math.round((itin.duration || 0) / 60), distance: totalDist }
        }
      } else {
        if (!routeData.route_geometry) throw new Error('No route geometry returned.')
        routeInfo.geometry     = routeData.route_geometry
        routeInfo.summary      = {
          duration: Math.round((routeData.route_summary?.total_time || 0) / 60),
          distance: routeData.route_summary?.total_distance || 0,
        }
        routeInfo.instructions = routeData.route_instructions || []
      }

      onRouteReady(routeInfo, [userLat, userLng])

      const d       = routeInfo.summary.distance
      const distStr = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : d > 0 ? `${Math.round(d)} m` : ''
      const durStr  = routeInfo.summary.duration > 0 ? `~${routeInfo.summary.duration} min` : ''
      updateMsg(loadId, {
        text: `Route set! ${MODE_ICONS[mode]} ${distStr}${distStr && durStr ? ' · ' : ''}${durStr} to ${dest.name}.`,
      })
    } catch (err) {
      updateMsg(loadId, {
        text: err.code === 1
          ? 'Location access denied. Allow location in your browser settings and try again.'
          : `Couldn't get route: ${err.message}`,
      })
    }
  }

  // ── Quick-reply button handler ───────────────────────────────────
  async function handleBtn(value, msgId) {
    markUsed(msgId)

    if (value === '__nav__') {
      setFlowState('nav_dest')
      addMsg({ role: 'ai', text: 'Where do you want to go? Type a place name or address.' })
      return
    }
    if (value === '__chat__') {
      setFlowState('chat')
      addMsg({ role: 'ai', text: 'Ask me anything about Tampines — facilities, crowd levels, or local tips!' })
      return
    }
    if (value === '__cancel__') {
      setFlowState('idle')
      setNavDest(null)
      setNavMode('pt')
      setMessages(prev => [...prev, mkGreeting()])
      return
    }
    if (value.startsWith('__mode__')) {
      const mode      = value.replace('__mode__', '')
      const modeLabel = TRANSPORT_MODES.find(m => m.value === mode)?.label || mode
      setNavMode(mode)
      addMsg({ role: 'user', text: modeLabel })
      setFlowState('routing')
      const dest   = navDest
      const loadId = nextId()
      setMessages(prev => [...prev, { id: loadId, role: 'ai', text: 'Getting your location…' }])
      await doRoute(dest, mode, loadId)
      setIsOpen(false)
      inputRef.current?.blur()
      setFlowState('idle')
      setNavDest(null)
      setNavMode('pt')
      setMessages(prev => [...prev, mkGreeting()])
      return
    }
    if (value.startsWith('__dest__')) {
      try {
        const dest = JSON.parse(value.slice(8))
        setNavDest(dest)
        addMsg({ role: 'user', text: dest.name })
        setFlowState('nav_mode')
        addMsg({
          role:    'ai',
          text:    `Found: ${dest.name}. How would you like to get there?`,
          buttons: TRANSPORT_MODES.map(m => ({ label: m.label, value: `__mode__${m.value}` })),
        })
      } catch {
        addMsg({ role: 'ai', text: 'Something went wrong. Try again.' })
        setFlowState('nav_dest')
      }
      return
    }

    // AI suggested a facility → jump straight to mode selection (shared navDest)
    if (value.startsWith('__nav_to_fac__')) {
      try {
        const dest = JSON.parse(value.slice(14))
        setNavDest(dest)
        markUsed(msgId)
        addMsg({ role: 'user', text: `Navigate to ${dest.name}` })
        setFlowState('nav_mode')
        addMsg({
          role:    'ai',
          text:    `How would you like to get to ${dest.name}?`,
          buttons: TRANSPORT_MODES.map(m => ({ label: m.label, value: `__mode__${m.value}` })),
        })
      } catch {
        addMsg({ role: 'ai', text: 'Something went wrong. Try again.' })
      }
      return
    }
  }

  // ── Text input handler ───────────────────────────────────────────
  async function handleSubmit() {
    const text = input.trim()
    if (!text || isTyping) return

    // Navigation flow is button-driven — never accept typed input during these states
    if (flowState === 'nav_mode' || flowState === 'routing') return

    setInput('')

    // In nav_dest: user is typing a destination
    if (flowState === 'nav_dest') {
      addMsg({ role: 'user', text })
      await runDestSearch(text)
      return
    }

    // In idle/chat: detect "go to X" style and extract destination inline
    if (flowState === 'idle' || flowState === 'chat') {
      if (NAV_REGEX.test(text)) {
        addMsg({ role: 'user', text })
        const destMatch = text.match(NAV_WITH_DEST)
        if (destMatch) {
          // Extract destination from the phrase and search immediately
          const destQuery = (destMatch[1] || '').trim()
          setFlowState('nav_dest')
          await runDestSearch(destQuery)
        } else {
          // Just nav intent, no destination yet
          setFlowState('nav_dest')
          addMsg({ role: 'ai', text: 'Where do you want to go? Type a place name or address.' })
        }
        return
      }
    }

    // General query → AI
    addMsg({ role: 'user', text })
    if (flowState !== 'chat') setFlowState('chat')
    setIsTyping(true)

    const loc = userLatLngRef.current
    const payload = [
      ...messages
        .filter(m => (m.role === 'ai' || m.role === 'user') && m.text)
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })),
      { role: 'user', content: text },
    ]

    try {
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages: payload,
          location:    loc ? { lat: loc[0], lng: loc[1] } : null,
          preferences: userProfile ? {
            display_name:        userProfile.display_name,
            favorite_types:      userProfile.favorite_types,
            preferred_transport: userProfile.preferred_transport,
            home_address:        userProfile.home_address,
            bio:                 userProfile.bio,
          } : null,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Server error ${res.status}`)
      }
      const data    = await res.json()
      const aiMsg   = { role: 'ai', text: formatReply(data.reply) }

      // If AI found facilities, show one Navigate button per result so user can choose
      if (data.facilities && data.facilities.length > 0) {
        aiMsg.buttons = data.facilities.map(fac => ({
          label: `🗺️ ${fac.name}`,
          value: `__nav_to_fac__${JSON.stringify({ lat: fac.lat, lng: fac.lng, name: fac.name })}`,
        }))
      }
      addMsg(aiMsg)
    } catch (err) {
      addMsg({
        role: 'ai',
        text: err instanceof TypeError ? `Can't reach backend at ${API_BASE}.` : `Error: ${err.message}`,
      })
    } finally {
      setIsTyping(false)
    }
  }

  const showInput = flowState !== 'nav_mode' && flowState !== 'routing'

  const onTouchStart = (e) => { touchStartY.current = e.touches[0].clientY }
  const onTouchMove  = (e) => { if (touchStartY.current) touchCurrY.current = e.touches[0].clientY }
  const onTouchEnd   = () => {
    if (touchStartY.current && touchCurrY.current) {
      if (touchCurrY.current - touchStartY.current > 60) {
        inputRef.current?.blur()
        setIsOpen(false)
      }
    }
    touchStartY.current = null
    touchCurrY.current  = null
  }

  return (
    <>
      <div
        className={`chat-scrim${isOpen ? ' is-open' : ''}`}
        onClick={() => { inputRef.current?.blur(); setIsOpen(false) }}
        aria-hidden="true"
      />

      <div
        className={`chat-sheet${isOpen ? ' is-open' : ''}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        role="dialog"
        aria-label="JOM AI Chat"
      >
        {/* Handle — tap to toggle + dismiss keyboard */}
        <div
          className="chat-handle"
          onClick={toggle}
          role="button"
          tabIndex={0}
          aria-label={isOpen ? 'Collapse chat' : 'Expand chat'}
          onKeyDown={(e) => e.key === 'Enter' && toggle()}
        >
          <div className="chat-handle-pill" />
        </div>

        <div className="chat-header">
          <div className="chat-header-dot" aria-hidden="true" />
          <span className="chat-header-title">JOM AI</span>
          <span className="chat-header-sub">Powered by DeepSeek · Tampines</span>
        </div>

        <div className="chat-body" ref={bodyRef}>
          {messages.map(msg => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              <div className={`chat-bubble ${msg.role}`}>
                {msg.role === 'ai' && <div className="chat-bubble-sender">JOM AI</div>}
                {msg.text}
              </div>
              {msg.buttons && !msg.buttonsUsed && (
                <div className="chat-quick-replies">
                  {msg.buttons.map(btn => (
                    <button
                      key={btn.value}
                      className={`chat-quick-btn${btn.value.startsWith('__nav_to_fac__') ? ' nav-btn' : ''}`}
                      onClick={() => handleBtn(btn.value, msg.id)}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="chat-bubble ai">
              <div className="chat-bubble-sender">JOM AI</div>
              <div className="typing-dots"><span /><span /><span /></div>
            </div>
          )}
        </div>

        {showInput && (
          <div className="chat-input-area">
            <input
              ref={inputRef}
              className="chat-input"
              type="text"
              placeholder={flowState === 'nav_dest' ? 'Type a place or address…' : 'Ask JOM AI…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              aria-label="Chat message input"
              disabled={isTyping}
            />
            <button
              className={`btn-icon primary${isTyping ? ' is-loading' : ''}`}
              onClick={handleSubmit}
              disabled={isTyping}
              aria-label="Send message"
            >
              {isTyping
                ? <div className="btn-spinner" />
                : (
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )
              }
            </button>
          </div>
        )}
      </div>
    </>
  )
})

// ══════════════════════════════════════════════════════════════════
// MAP VIEW
// ══════════════════════════════════════════════════════════════════
export default function MapView() {
  const navigate     = useNavigate()
  const { user }     = useAuth()

  const [facilities,       setFacilities]       = useState([])
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState(null)
  const [routeInfo,        setRouteInfo]        = useState(null)
  const [userLocation,     setUserLocation]     = useState(null)
  const [userProfile,      setUserProfile]      = useState(null)
  const [savedFacilityIds, setSavedFacilityIds] = useState(new Set())
  const [selectedFacility, setSelectedFacility] = useState(null)
  const [detailsFacility,  setDetailsFacility]  = useState(null)
  const [pinMode,      setPinMode]      = useState(false)
  const [pendingPin,   setPendingPin]   = useState(null)
  const [showAddForm,  setShowAddForm]  = useState(false)
  const [addForm,      setAddForm]      = useState({ name: '', type: 'basketball_court', address: '', isSheltered: false, isIndoor: false })
  const [addingSpot,   setAddingSpot]   = useState(false)
  const [addSpotError, setAddSpotError] = useState(null)

  // Filter to only facilities actually inside the Tampines boundary polygon
  const tampinesFacilities = useMemo(
    () => facilities.filter(f => f.lat && f.lng && isInTampines(f.lat, f.lng)),
    [facilities]
  )

  const onRouteReady = useCallback((route, userLoc) => {
    setRouteInfo(null)
    setTimeout(() => {
      setRouteInfo(route)
      setUserLocation(userLoc)
    }, 0)
  }, [])

  const onClearRoute = useCallback(() => setRouteInfo(null), [])

  // ── Load user profile + saved facility IDs when user changes ──
  useEffect(() => {
    if (!user) { setUserProfile(null); setSavedFacilityIds(new Set()); return }
    async function loadUserData() {
      const [profRes, savedRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', user.id).single(),
        supabase.from('saved_facilities').select('facility_id').eq('user_id', user.id),
      ])
      if (profRes.data)  setUserProfile(profRes.data)
      if (savedRes.data) setSavedFacilityIds(new Set(savedRes.data.map(r => r.facility_id)))
    }
    loadUserData()
  }, [user])

  // ── Toggle save/unsave a facility ─────────────────────────────
  const onSaveToggle = useCallback(async (facility) => {
    if (!user) return
    const isSaved = savedFacilityIds.has(facility.id)
    if (isSaved) {
      await supabase.from('saved_facilities')
        .delete().eq('user_id', user.id).eq('facility_id', facility.id)
      setSavedFacilityIds(prev => { const s = new Set(prev); s.delete(facility.id); return s })
    } else {
      await supabase.from('saved_facilities').insert({ user_id: user.id, facility_id: facility.id })
      setSavedFacilityIds(prev => new Set([...prev, facility.id]))
    }
  }, [user, savedFacilityIds])

  const handleTogglePinMode = useCallback(() => {
    setPinMode(v => {
      if (v) { setPendingPin(null); setShowAddForm(false) }
      return !v
    })
  }, [])

  const handleMapClick = useCallback((lat, lng) => {
    setPendingPin({ lat, lng })
    setShowAddForm(true)
    setPinMode(false)
  }, [])

  const handleAddSpotSubmit = useCallback(async () => {
    if (!addForm.name.trim() || !pendingPin || !user) return
    setAddingSpot(true)
    setAddSpotError(null)
    try {
      const { data, error } = await supabase.from('facilities').insert({
        name:         addForm.name.trim(),
        type:         addForm.type,
        address:      addForm.address.trim() || null,
        lat:          pendingPin.lat,
        lng:          pendingPin.lng,
        is_sheltered: addForm.isSheltered,
        is_indoor:    addForm.isIndoor,
        is_verified:  false,
      }).select().single()
      if (error) throw error
      // Add to local list immediately (no refetch needed)
      setFacilities(prev => [...prev, data])
      setPendingPin(null)
      setShowAddForm(false)
      setAddForm({ name: '', type: 'basketball_court', address: '', isSheltered: false, isIndoor: false })
    } catch (err) {
      setAddSpotError(err.message || 'Failed to add spot')
    } finally {
      setAddingSpot(false)
    }
  }, [addForm, pendingPin, user])

  const handleAddSpotCancel = useCallback(() => {
    setPendingPin(null)
    setShowAddForm(false)
    setPinMode(false)
    setAddSpotError(null)
  }, [])

  // Called when user taps "Route here" on a map facility popup
  const routeFromUserTo = useCallback(async (facility) => {
    try {
      let userLat, userLng
      try {
        const position = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, {
            enableHighAccuracy: true, timeout: 5000, maximumAge: 60000,
          })
        )
        userLat = position.coords.latitude
        userLng = position.coords.longitude
      } catch (err) {
        console.warn('Geolocation failed, falling back to Tampines MRT:', err)
        userLat = TAMPINES_MRT_LAT
        userLng = TAMPINES_MRT_LNG
      }
      if (!isInTampines(userLat, userLng)) {
        userLat = TAMPINES_MRT_LAT
        userLng = TAMPINES_MRT_LNG
      }

      const now  = new Date()
      const date = [String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'), now.getFullYear()].join('-')
      const time = [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'), String(now.getSeconds()).padStart(2, '0')].join(':')

      const params = new URLSearchParams({
        start: `${userLat},${userLng}`,
        end:   `${facility.lat},${facility.lng}`,
        routeType: 'pt',
        date, time,
        mode: 'TRANSIT', maxWalkDistance: '1000', numItineraries: '3',
      })

      const res  = await fetch(`${API_BASE}/api/onemap/route?${params}`)
      const data = await res.json()
      const itin = data.plan?.itineraries?.[0]

      const dest = { lat: facility.lat, lng: facility.lng, name: facility.name }

      if (!itin?.legs?.length || !itin.legs.some(l => l.mode && l.mode !== 'WALK')) {
        // No transit available (off-hours) — fall back to walk route
        const walkParams = new URLSearchParams({
          start: `${userLat},${userLng}`, end: `${facility.lat},${facility.lng}`, routeType: 'walk',
        })
        const walkRes  = await fetch(`${API_BASE}/api/onemap/route?${walkParams}`)
        const walkData = await walkRes.json()
        if (!walkData.route_geometry) return
        onRouteReady(
          {
            type:         'walk',
            destinationName: facility.name,
            destination:  dest,
            geometry:     walkData.route_geometry,
            summary:      {
              duration: Math.round((walkData.route_summary?.total_time || 0) / 60),
              distance: walkData.route_summary?.total_distance || 0,
            },
            instructions: walkData.route_instructions || [],
            notice: 'Bus/MRT not operating at this hour (resumes ~5:30 AM). Showing walk route.',
          },
          [userLat, userLng]
        )
        return
      }

      const totalDist = itin.legs.reduce((s, l) => s + (l.distance || 0), 0)
      onRouteReady(
        {
          type: 'pt',
          destinationName: facility.name,
          destination:     dest,
          itinerary:       itin,
          summary:         { duration: Math.round((itin.duration || 0) / 60), distance: totalDist },
        },
        [userLat, userLng]
      )
    } catch (err) {
      console.error('Routing failed:', err)
      // silently ignore UI-wise — user can always use the chat flow instead
    }
  }, [onRouteReady])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('facilities')
          .select('id, name, type, lat, lng, address, is_sheltered, is_indoor')
          .order('name')
        if (error) throw error
        if (!cancelled) setFacilities(data || [])
      } catch (err) {
        if (!cancelled) setError(err.message)
        console.error('Failed to load facilities:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  return (
    <div className="map-page" style={{ position: 'relative' }}>
      <Navbar onNavigateProfile={() => navigate('/profile')} onSignOut={handleSignOut} />
      <MapArea
        facilities={tampinesFacilities}
        loading={loading}
        error={error}
        routeInfo={routeInfo}
        userLocation={userLocation}
        onClearRoute={onClearRoute}
        onNavigateTo={routeFromUserTo}
        user={user}
        savedFacilityIds={savedFacilityIds}
        onSaveToggle={onSaveToggle}
        pinMode={pinMode}
        pendingPin={pendingPin}
        onTogglePinMode={handleTogglePinMode}
        onMapClick={handleMapClick}
        selectedFacility={selectedFacility}
        onSelectFacility={setSelectedFacility}
        onShowDetails={setDetailsFacility}
      />
      <ChatSheet
        onRouteReady={onRouteReady}
        defaultNavMode={userProfile?.preferred_transport || 'pt'}
        userProfile={userProfile}
      />
      <FacilitySidePane 
        facility={detailsFacility} 
        onClose={() => setDetailsFacility(null)} 
        onNavigateTo={routeFromUserTo}
        user={user}
        isSaved={detailsFacility && savedFacilityIds.has(detailsFacility.id)}
        onSaveToggle={onSaveToggle}
      />
      {showAddForm && (
        <div className="add-spot-overlay">
          <div className="add-spot-sheet">
            <div className="add-spot-header">
              <h2 className="add-spot-title">Add New Spot</h2>
              <button className="add-spot-close" onClick={handleAddSpotCancel}>✕</button>
            </div>

            <div className="add-spot-body">
              <p className="add-spot-coords">
                📍 {pendingPin?.lat.toFixed(5)}, {pendingPin?.lng.toFixed(5)}
              </p>

              {addSpotError && (
                <p className="add-spot-error">{addSpotError}</p>
              )}

              <div className="add-spot-field">
                <label className="add-spot-label">Spot Name *</label>
                <input
                  className="add-spot-input"
                  type="text"
                  placeholder="e.g. Block 456 Basketball Court"
                  value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="add-spot-field">
                <label className="add-spot-label">Type *</label>
                <select
                  className="add-spot-input add-spot-select"
                  value={addForm.type}
                  onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
                >
                  {SPOT_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="add-spot-field">
                <label className="add-spot-label">Address (optional)</label>
                <input
                  className="add-spot-input"
                  type="text"
                  placeholder="e.g. Blk 456 Tampines St 44"
                  value={addForm.address}
                  onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))}
                />
              </div>

              <div className="add-spot-toggles">
                <button
                  className={`add-spot-toggle${addForm.isSheltered ? ' active' : ''}`}
                  onClick={() => setAddForm(f => ({ ...f, isSheltered: !f.isSheltered }))}
                >
                  ☂️ Sheltered
                </button>
                <button
                  className={`add-spot-toggle${addForm.isIndoor ? ' active' : ''}`}
                  onClick={() => setAddForm(f => ({ ...f, isIndoor: !f.isIndoor }))}
                >
                  🏠 Indoor
                </button>
              </div>
            </div>

            <div className="add-spot-actions">
              <button className="add-spot-cancel" onClick={handleAddSpotCancel}>Cancel</button>
              <button
                className="add-spot-submit"
                onClick={handleAddSpotSubmit}
                disabled={!addForm.name.trim() || addingSpot}
              >
                {addingSpot ? <span className="add-spot-spinner" /> : '📍 Add Spot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
