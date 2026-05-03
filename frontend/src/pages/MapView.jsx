// src/pages/MapView.jsx

import { useEffect, useState, useRef, memo, lazy, Suspense, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

const FacilityMap = lazy(() => import('../components/FacilityMap'))

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

// Matches navigation intent in typed text
const NAV_REGEX = /\b(go to|take me|get me|navigate|direction|how (do|to) (i |get to|reach)|get to|route to|way to|bring me|head to)\b/i

// Extracts destination from "go to X" / "take me to X" / "get me to X" style phrases
const NAV_WITH_DEST = /^(?:go|take me|get me|navigate|bring me|head|get)\s+(?:to|towards?|me to)\s+(.+)/i

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
const Navbar = memo(function Navbar({ onNavigateProfile }) {
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
          <button className="dropdown-item danger" onClick={() => setIsMenuOpen(false)} role="menuitem">
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

  const { type, destinationName, summary, itinerary, instructions } = routeInfo || {}
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
const MapArea = memo(function MapArea({ facilities, loading, error, routeInfo, userLocation, onClearRoute }) {
  return (
    <div className="map-area">
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
      <Suspense fallback={null}>
        <FacilityMap facilities={facilities} routeInfo={routeInfo} userLocation={userLocation} />
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
const ChatSheet = memo(function ChatSheet({ onRouteReady }) {
  const [isOpen,    setIsOpen]    = useState(false)
  const [messages,  setMessages]  = useState(() => [mkGreeting()])
  const [flowState, setFlowState] = useState('idle')
  const [navDest,   setNavDest]   = useState(null)
  const [navMode,   setNavMode]   = useState('pt')
  const [input,     setInput]     = useState('')
  const [isTyping,  setIsTyping]  = useState(false)
  const bodyRef      = useRef(null)
  const inputRef     = useRef(null)
  const touchStartY  = useRef(null)
  const touchCurrY   = useRef(null)
  // Live location — useRef so location ticks don't cause re-renders
  const userLatLngRef = useRef(null)

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
    const noInput = flowState === 'nav_mode' || flowState === 'nav_confirm' || flowState === 'routing'
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

  // ── Search with fallbacks + proximity sort ───────────────────────
  async function searchDest(rawQuery) {
    const base = stripNavPrefix(rawQuery)
    if (!base) return []

    // Try searches in order, stop at first non-empty batch
    const attempts = [
      base,
      `${base} Singapore`,
      !base.match(/\b(mrt|lrt|station|bus)\b/i) ? `${base} MRT` : null,
      !base.match(/\b(park|garden)\b/i) ? `${base} PARK` : null,
    ]

    for (const q of attempts) {
      if (!q) continue
      const results = await oneMapSearch(q)
      if (results.length) {
        const loc = userLatLngRef.current
        if (loc) {
          results.sort((a, b) =>
            distKm(loc[0], loc[1], a.lat, a.lng) - distKm(loc[0], loc[1], b.lat, b.lng)
          )
        }
        return results.slice(0, 5)
      }
    }
    return []
  }

  // ── Search + always pick the closest result → transport mode buttons ──
  async function runDestSearch(destQuery) {
    setIsTyping(true)
    try {
      const results = await searchDest(destQuery)
      if (!results.length) {
        addMsg({
          role: 'ai',
          text: `Couldn't find "${destQuery.slice(0, 40)}". Try a landmark name, add "MRT", or rephrase.`,
        })
        setFlowState('nav_dest')
      } else {
        // Always take the top result (already sorted by proximity).
        // No disambiguation — keeps the flow button-driven.
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
      const userLat = position.coords.latitude
      const userLng = position.coords.longitude
      userLatLngRef.current = [userLat, userLng]

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
        if (!itin?.legs?.length) throw new Error('No PT route found.')
        routeInfo.itinerary = itin
        const totalDist = itin.legs.reduce((s, l) => s + (l.distance || 0), 0)
        routeInfo.summary = { duration: Math.round((itin.duration || 0) / 60), distance: totalDist }
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
    if (value === '__change_mode__') {
      setFlowState('nav_mode')
      addMsg({
        role:    'ai',
        text:    'Choose a different transport mode:',
        buttons: TRANSPORT_MODES.map(m => ({ label: m.label, value: `__mode__${m.value}` })),
      })
      return
    }
    if (value === '__confirm__') {
      setFlowState('routing')
      const dest   = navDest
      const mode   = navMode
      const loadId = nextId()
      setMessages(prev => [...prev, { id: loadId, role: 'ai', text: 'Getting your location…' }])
      await doRoute(dest, mode, loadId)
      // Close sheet so the user can see the route on the map
      setIsOpen(false)
      inputRef.current?.blur()
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
      setFlowState('nav_confirm')
      addMsg({
        role:    'ai',
        text:    `Go to ${navDest?.name} by ${modeLabel.replace(/^[\S]+\s/, '')}?`,
        buttons: [
          { label: '✅ Yes, go!',    value: '__confirm__'    },
          { label: '🔄 Change mode', value: '__change_mode__' },
          { label: '✕ Cancel',       value: '__cancel__'     },
        ],
      })
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
    if (flowState === 'nav_mode' || flowState === 'nav_confirm' || flowState === 'routing') return

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
          setFlowState('nav_dest')
          await runDestSearch(destMatch[1].trim())
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
          location: loc ? { lat: loc[0], lng: loc[1] } : null,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Server error ${res.status}`)
      }
      const data    = await res.json()
      const aiMsg   = { role: 'ai', text: formatReply(data.reply) }

      // If AI found a specific facility, attach a Navigate button
      // so the user never has to type the destination twice
      if (data.primary_facility) {
        const fac  = data.primary_facility
        const dest = { lat: fac.lat, lng: fac.lng, name: fac.name }
        aiMsg.buttons = [{
          label: `🗺️ Navigate to ${fac.name}`,
          value: `__nav_to_fac__${JSON.stringify(dest)}`,
        }]
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

  const showInput = flowState !== 'nav_mode' && flowState !== 'nav_confirm' && flowState !== 'routing'

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
  const navigate = useNavigate()

  const [facilities,   setFacilities]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [routeInfo,    setRouteInfo]    = useState(null)
  const [userLocation, setUserLocation] = useState(null)

  const onRouteReady = useCallback((route, userLoc) => {
    setRouteInfo(null)
    setTimeout(() => {
      setRouteInfo(route)
      setUserLocation(userLoc)
    }, 0)
  }, [])

  const onClearRoute = useCallback(() => setRouteInfo(null), [])

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

  return (
    <div className="map-page">
      <Navbar onNavigateProfile={() => navigate('/profile')} />
      <MapArea
        facilities={facilities}
        loading={loading}
        error={error}
        routeInfo={routeInfo}
        userLocation={userLocation}
        onClearRoute={onClearRoute}
      />
      <ChatSheet onRouteReady={onRouteReady} />
    </div>
  )
}
