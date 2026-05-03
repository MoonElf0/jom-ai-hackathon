// src/pages/MapView.jsx
//
// Architecture: three isolated render trees
//   <Navbar>     — menu open/close state lives here alone
//   <MapArea>    — memoised; re-renders only when facilities/route/userLocation changes
//   <ChatSheet>  — chat open/close + messages state lives here alone
//
// Route state is lifted to MapView so ChatSheet can write it and MapArea can read it.
// useCallback keeps callbacks stable so memoised children don't re-render on every tick.

import { useEffect, useState, useRef, memo, lazy, Suspense, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

const FacilityMap = lazy(() => import('../components/FacilityMap'))

// ── Travel mode metadata ──────────────────────────────────────────
const MODE_ICONS  = { walk: '🚶', drive: '🚗', cycle: '🚲', pt: '🚌' }
const MODE_LABELS = { walk: 'Walking', drive: 'Driving', cycle: 'Cycling', pt: 'Transit' }

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

// ══════════════════════════════════════════════════════════════════
// ROUTE PANEL — floating card showing active route summary
// ══════════════════════════════════════════════════════════════════
const RoutePanel = memo(function RoutePanel({ routeInfo, onClear }) {
  if (!routeInfo) return null

  const { type, destinationName, summary, itinerary } = routeInfo
  const dist = summary?.distance || 0
  const distStr = dist >= 1000
    ? `${(dist / 1000).toFixed(1)} km`
    : dist > 0 ? `${Math.round(dist)} m` : ''
  const durStr = summary?.duration > 0 ? `~${summary.duration} min` : ''

  return (
    <div className="route-panel" role="region" aria-label="Active route">
      <div className="route-panel-header">
        <span className="route-panel-mode-icon" aria-hidden="true">
          {MODE_ICONS[type] || '📍'}
        </span>
        <div className="route-panel-info">
          <p className="route-panel-dest">{destinationName}</p>
          <p className="route-panel-meta">
            {MODE_LABELS[type] || type}
            {(distStr || durStr) && ' · '}
            {distStr}
            {distStr && durStr && ' · '}
            {durStr}
          </p>
        </div>
        <button className="route-panel-close" onClick={onClear} aria-label="Clear route">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* PT legs summary */}
      {type === 'pt' && itinerary?.legs?.length > 0 && (
        <div className="route-panel-legs">
          {itinerary.legs.map((leg, i) => (
            <span key={i} className={`route-leg-badge route-leg-${leg.mode?.toLowerCase()}`}>
              {leg.mode === 'WALK'
                ? '🚶 Walk'
                : leg.mode === 'BUS'
                  ? `🚌 ${leg.route || 'Bus'}`
                  : `🚇 ${leg.route || 'MRT'}`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})

// ══════════════════════════════════════════════════════════════════
// MAP AREA — memoised; only re-renders when its props change
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
        <FacilityMap
          facilities={facilities}
          routeInfo={routeInfo}
          userLocation={userLocation}
        />
      </Suspense>

      {/* Route summary card floats over map */}
      <RoutePanel routeInfo={routeInfo} onClear={onClearRoute} />
    </div>
  )
})

// ══════════════════════════════════════════════════════════════════
// CHAT SHEET — calls Flask /api/ai/chat → Groq Llama 4 Scout
// When the AI returns a "navigate" action the sheet:
//   1. Gets the user's live GPS position
//   2. Calls /api/onemap/route
//   3. Calls onRouteReady() to render the route on the map
// ══════════════════════════════════════════════════════════════════
const INITIAL_MESSAGES = [
  {
    id: 1,
    role: 'ai',
    text: 'Hello! I can help you find facilities, check crowd levels, or navigate to any location. Try: "Take me to Tampines Hub by bus" or "Find a sheltered basketball court" 😊',
  },
]

const ChatSheet = memo(function ChatSheet({ onRouteReady }) {
  const [isOpen, setIsOpen]     = useState(false)
  const [input, setInput]       = useState('')
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [isTyping, setIsTyping] = useState(false)
  const bodyRef                 = useRef(null)
  const inputRef                = useRef(null)
  const touchStartY             = useRef(null)
  const touchCurrY              = useRef(null)

  // Auto-scroll to latest message
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [messages, isTyping])

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 450)
    }
  }, [isOpen])

  const toggle = () => setIsOpen(v => !v)

  // ── Handle navigation action from AI ──────────────────────────
  const handleNavigationAction = async (action) => {
    const { destination, mode } = action
    const navMsgId = Date.now() + 10

    setMessages(prev => [
      ...prev,
      { id: navMsgId, role: 'ai', text: 'Getting your live location…' },
    ])

    try {
      // 1. Request GPS
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout:            10000,
          maximumAge:         30000,
        })
      )

      const userLat = position.coords.latitude
      const userLng = position.coords.longitude

      // 2. Build date/time for PT
      const now  = new Date()
      const date = [
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        now.getFullYear(),
      ].join('-')
      const time = [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
      ].join(':')

      // 3. Call route API
      const params = new URLSearchParams({
        start:     `${userLat},${userLng}`,
        end:       `${destination.lat},${destination.lng}`,
        routeType: mode,
        ...(mode === 'pt' ? {
          date,
          time,
          mode:             'TRANSIT',
          maxWalkDistance:  '1000',
          numItineraries:   '3',
        } : {}),
      })

      const routeRes  = await fetch(`${API_BASE}/api/onemap/route?${params}`)
      const routeData = await routeRes.json()

      if (routeData.error) throw new Error(routeData.error)

      // 4. Build routeInfo for the map
      const routeInfo = { type: mode, destinationName: destination.name, destination }

      if (mode === 'pt') {
        const itin       = routeData.plan?.itineraries?.[0]
        routeInfo.itinerary = itin
        const totalDist  = itin?.legs?.reduce((s, l) => s + (l.distance || 0), 0) || 0
        routeInfo.summary   = {
          duration: Math.round((itin?.duration || 0) / 60),
          distance: totalDist,
        }
      } else {
        routeInfo.geometry    = routeData.route_geometry
        routeInfo.summary     = {
          duration: Math.round((routeData.route_summary?.total_time || 0) / 60),
          distance: routeData.route_summary?.total_distance || 0,
        }
        routeInfo.instructions = routeData.route_instructions || []
      }

      // 5. Push to map
      onRouteReady(routeInfo, [userLat, userLng])

      // 6. Update the "Getting your location…" bubble with route summary
      const d = routeInfo.summary.distance
      const distStr = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : d > 0 ? `${Math.round(d)} m` : ''
      const durStr  = routeInfo.summary.duration > 0 ? `~${routeInfo.summary.duration} min` : ''

      setMessages(prev => prev.map(m =>
        m.id === navMsgId
          ? {
              ...m,
              text: `Route ready on map! ${MODE_ICONS[mode]} ${distStr}${distStr && durStr ? ' · ' : ''}${durStr} to ${destination.name}. Tap the map to see directions.`,
            }
          : m
      ))
    } catch (err) {
      const isDenied = err.code === 1  // GeolocationPositionError.PERMISSION_DENIED
      setMessages(prev => prev.map(m =>
        m.id === navMsgId
          ? {
              ...m,
              text: isDenied
                ? 'Location access denied. Please allow location in your browser settings and try again.'
                : `Could not get route: ${err.message}`,
            }
          : m
      ))
    }
  }

  // ── Send message to Groq via Flask backend ─────────────────────
  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isTyping) return

    const userMsg        = { id: Date.now(), role: 'user', text }
    const updatedHistory = [...messages, userMsg]
    setMessages(updatedHistory)
    setInput('')
    setIsTyping(true)

    // Build API payload: only real user/assistant turns (skip static greeting)
    const payload = [
      ...messages
        .filter(m => m.id !== 1 && (m.role === 'ai' || m.role === 'user'))
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })),
      { role: 'user', content: text },
    ]

    try {
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: payload }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Server error ${res.status}`)
      }

      const data = await res.json()

      // Show AI text reply
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'ai', text: data.reply },
      ])

      // Trigger navigation if AI called start_navigation
      if (data.action?.type === 'navigate') {
        await handleNavigationAction(data.action)
      }
    } catch (err) {
      const isNetworkErr = err instanceof TypeError
      setMessages(prev => [
        ...prev,
        {
          id:   Date.now() + 1,
          role: 'ai',
          text: isNetworkErr
            ? `Cannot reach the backend. Make sure Flask is running on ${API_BASE}.`
            : `Something went wrong: ${err.message}`,
        },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  const onTouchStart = (e) => { touchStartY.current = e.touches[0].clientY }
  const onTouchMove  = (e) => { if (touchStartY.current) touchCurrY.current = e.touches[0].clientY }
  const onTouchEnd   = () => {
    if (touchStartY.current && touchCurrY.current) {
      if (touchCurrY.current - touchStartY.current > 60) setIsOpen(false)
    }
    touchStartY.current = null
    touchCurrY.current  = null
  }

  return (
    <>
      <div
        className={`chat-scrim${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen(false)}
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
          <span className="chat-header-sub">Powered by Llama 4 · Tampines</span>
        </div>

        <div className="chat-body" ref={bodyRef}>
          {messages.map(msg => (
            <div key={msg.id} className={`chat-bubble ${msg.role}`}>
              {msg.role === 'ai' && <div className="chat-bubble-sender">JOM AI</div>}
              {msg.text}
            </div>
          ))}

          {isTyping && (
            <div className="chat-bubble ai">
              <div className="chat-bubble-sender">JOM AI</div>
              <div className="typing-dots">
                <span /><span /><span />
              </div>
            </div>
          )}
        </div>

        <div className="chat-input-area">
          <input
            ref={inputRef}
            className="chat-input"
            type="text"
            placeholder="Ask JOM AI or say 'Take me to…'"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            aria-label="Chat message input"
            disabled={isTyping}
          />
          <button
            className={`btn-icon primary${isTyping ? ' is-loading' : ''}`}
            onClick={sendMessage}
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
      </div>
    </>
  )
})

// ══════════════════════════════════════════════════════════════════
// MAP VIEW — orchestrates data fetching and route state
// ══════════════════════════════════════════════════════════════════
export default function MapView() {
  const navigate = useNavigate()

  const [facilities,    setFacilities]    = useState([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)
  const [routeInfo,     setRouteInfo]     = useState(null)
  const [userLocation,  setUserLocation]  = useState(null)

  // Stable callbacks — won't change reference across renders
  const onRouteReady = useCallback((route, userLoc) => {
    setRouteInfo(route)
    setUserLocation(userLoc)
  }, [])

  const onClearRoute = useCallback(() => {
    setRouteInfo(null)
  }, [])

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
