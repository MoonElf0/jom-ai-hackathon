// src/pages/MapView.jsx
//
// Architecture: three isolated render trees
//   <Navbar>     — menu open/close state lives here alone
//   <MapArea>    — memoised; only re-renders when `facilities` changes
//   <ChatSheet>  — chat open/close + messages state lives here alone
//
// This means clicking the menu or chat button NEVER re-renders the map,
// which is what was causing the ~1 second interaction delay.

import { useEffect, useState, useRef, memo, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

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
// CHAT SHEET — calls Flask /api/ai/chat → Groq Llama 4 Scout
// Maintains full conversation history so the AI has context.
// ══════════════════════════════════════════════════════════════════
const INITIAL_MESSAGES = [
  {
    id: 1,
    role: 'ai',
    text: 'Hello! I can help you find facilities, check crowd levels, or update facility info. What do you need? 😊'
  }
]

const ChatSheet = memo(function ChatSheet() {
  const [isOpen, setIsOpen]     = useState(false)
  const [input, setInput]       = useState('')
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [isTyping, setIsTyping] = useState(false)
  const bodyRef                 = useRef(null)
  const inputRef                = useRef(null)

  // Swipe-down gesture refs (plain objects, not useRef — avoids re-renders)
  const touchStartY = useRef(null)
  const touchCurrY  = useRef(null)

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

  // ── Send message to Groq via Flask backend ─────────────────────
  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isTyping) return

    const userMsg = { id: Date.now(), role: 'user', text }
    // Build updated history to send (exclude the static greeting from history)
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setIsTyping(true)

    // Convert our message format to the {role, content} format the backend expects
    // Only send 'user' and 'assistant' roles (not our 'ai' label)
    const historyForAPI = updatedMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.text }))

    // If no prior assistant messages, the last item is just the user message
    // which is correct — the backend will respond as assistant
    const payload = [
      // Re-map our internal 'ai' role to 'assistant' for the API
      ...messages
        .filter(m => m.role === 'ai' || m.role === 'user')
        .filter(m => m.id !== 1) // skip the initial greeting (not real history)
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })),
      { role: 'user', content: text }
    ]

    try {
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server error ${res.status}`)
      }

      const data = await res.json()
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'ai', text: data.reply }
      ])
    } catch (err) {
      console.error('Chat error:', err)
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'ai',
          text: `Sorry, I couldn't reach the server. Make sure the Flask backend is running on ${API_BASE}. (${err.message})`
        }
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
          <span className="chat-header-sub">Powered by Llama 4 · Tampines</span>
        </div>

        {/* Messages */}
        <div className="chat-body" ref={bodyRef}>
          {messages.map(msg => (
            <div key={msg.id} className={`chat-bubble ${msg.role}`}>
              {msg.role === 'ai' && <div className="chat-bubble-sender">JOM AI</div>}
              {msg.text}
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="chat-bubble ai">
              <div className="chat-bubble-sender">JOM AI</div>
              <div className="typing-dots">
                <span /><span /><span />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <input
            ref={inputRef}
            className="chat-input"
            type="text"
            placeholder="Ask JOM AI…"
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
