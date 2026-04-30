// src/pages/MapView.jsx
//
// Architecture: three isolated render trees
//   <Navbar>     — menu open/close state lives here alone
//   <MapArea>    — memoised; only re-renders when `facilities` changes
//   <ChatSheet>  — chat open/close + messages state lives here alone
//
// This means clicking the menu or chat button NEVER re-renders the map,
// which is what was causing the ~1 second interaction delay.

import { useEffect, useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { lazy, Suspense } from 'react'

const FacilityMap = lazy(() => import('../components/FacilityMap'))

// ══════════════════════════════════════════════════════════════════
// NAVBAR (isolated — menu state stays here, map never sees it)
// ══════════════════════════════════════════════════════════════════
const Navbar = memo(function Navbar({ onNavigateProfile }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Close on outside tap
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
      {/* Hamburger / dropdown */}
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

      {/* Logo */}
      <div className="navbar-logo">
        <span className="navbar-logo-text">JOM AI</span>
        <span className="navbar-logo-sub">Tampines</span>
      </div>

      {/* Profile */}
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
// MAP AREA (memoised — only re-renders when facilities list changes)
// ══════════════════════════════════════════════════════════════════
const MapArea = memo(function MapArea({ facilities, loading, error }) {
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
        <FacilityMap facilities={facilities} />
      </Suspense>
    </div>
  )
})

// ══════════════════════════════════════════════════════════════════
// CHAT SHEET (isolated — all chat state lives here, map never sees it)
// ══════════════════════════════════════════════════════════════════
const INITIAL_MESSAGES = [
  { id: 1, role: 'ai', text: 'Hello! I can help you find suitable facilities, check the weather, or avoid crowded areas. Where to?' }
]

const ChatSheet = memo(function ChatSheet() {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState(INITIAL_MESSAGES)

  // Swipe-down refs
  const touchStartY = { current: null }
  const touchCurrY = { current: null }

  const toggle = () => setIsOpen(v => !v)

  const sendMessage = () => {
    const text = input.trim()
    if (!text) return
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text }])
    setInput('')
    // Placeholder reply — swap with real API call
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'ai', text: `Looking for "${text}"… Feature coming soon! 🗺️` }
      ])
    }, 800)
  }

  const onTouchStart = (e) => { touchStartY.current = e.touches[0].clientY }
  const onTouchMove = (e) => { if (touchStartY.current) touchCurrY.current = e.touches[0].clientY }
  const onTouchEnd = () => {
    if (touchStartY.current && touchCurrY.current) {
      if (touchCurrY.current - touchStartY.current > 60) setIsOpen(false)
    }
    touchStartY.current = null; touchCurrY.current = null
  }

  return (
    <>
      {/* Tap-outside scrim */}
      <div
        className={`chat-scrim${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Bottom sheet */}
      <div
        className={`chat-sheet${isOpen ? ' is-open' : ''}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        role="dialog"
        aria-label="JOM AI Chat"
      >
        {/* Drag handle */}
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

        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-dot" aria-hidden="true" />
          <span className="chat-header-title">JOM AI</span>
          <span className="chat-header-sub">Online · Tampines</span>
        </div>

        {/* Messages */}
        <div className="chat-body">
          {messages.map(msg => (
            <div key={msg.id} className={`chat-bubble ${msg.role}`}>
              {msg.role === 'ai' && <div className="chat-bubble-sender">JOM AI</div>}
              {msg.text}
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <input
            className="chat-input"
            type="text"
            placeholder="Ask JOM AI…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            aria-label="Chat message input"
          />
          <button className="btn-icon secondary" aria-label="Voice input">
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
          <button className="btn-icon primary" onClick={sendMessage} aria-label="Send message">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
})

// ══════════════════════════════════════════════════════════════════
// MAP VIEW — orchestrates data fetching only; no UI state here
// ══════════════════════════════════════════════════════════════════
export default function MapView() {
  const navigate = useNavigate()

  const [facilities, setFacilities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
      <MapArea facilities={facilities} loading={loading} error={error} />
      <ChatSheet />
    </div>
  )
}
