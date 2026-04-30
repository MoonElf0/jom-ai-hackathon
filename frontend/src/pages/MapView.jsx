// src/pages/MapView.jsx
//
// Problem: The map page needs to load facility data from Supabase
//          and show it on the map. We don't want to show a blank map
//          while data is loading — that looks broken.
// Solution: Fetch facilities on mount, show a loading state,
//           then render the map once data arrives.

import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import FacilityMap from '../components/FacilityMap'
import { supabase } from '../utils/supabaseClient'

export default function MapView() {
  const navigate = useNavigate()
  const [facilities, setFacilities]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [count, setCount]             = useState(0)

  // Mobile UI states
  const [isMenuOpen, setIsMenuOpen]   = useState(false)
  const [isChatOpen, setIsChatOpen]   = useState(false)

  // Touch swipe states for closing the AI chatbox
  const touchStartY = useRef(null)
  const touchCurrentY = useRef(null)

  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY
  }
  const handleTouchMove = (e) => {
    if (touchStartY.current) {
      touchCurrentY.current = e.touches[0].clientY
    }
  }
  const handleTouchEnd = () => {
    if (touchStartY.current && touchCurrentY.current) {
      const diff = touchCurrentY.current - touchStartY.current
      if (diff > 50) setIsChatOpen(false) // Swiped down
    }
    touchStartY.current = null; touchCurrentY.current = null
  }

  // Fetch all facilities from Supabase on page load
  useEffect(() => {
    async function loadFacilities() {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('facilities')
          .select('id, name, type, lat, lng, address, is_sheltered, is_indoor')
          .order('name')

        if (error) throw error
        setFacilities(data || [])
        setCount(data?.length || 0)
      } catch (err) {
        console.error('Failed to load facilities:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadFacilities()
  }, [])

  return (
    <div style={{ height: '100dvh', width: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden', position: 'relative' }}>

      {/* ── Top Navigation Bar ─────────────────────────────────────── */}
      <div style={{
        padding: '16px 20px',
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
        zIndex: 1000,
        borderBottomLeftRadius: '24px',
        borderBottomRightRadius: '24px',
        position: 'relative'
      }}>
        {/* Left: Nav Button Dropdown (3 bars) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{ background: '#f8fafc', border: 'none', width: '44px', height: '44px', borderRadius: '999px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '5px', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
          >
            <div style={{ width: '20px', height: '2.5px', background: '#ED2939', borderRadius: '999px' }} />
            <div style={{ width: '20px', height: '2.5px', background: '#ED2939', borderRadius: '999px' }} />
            <div style={{ width: '20px', height: '2.5px', background: '#ED2939', borderRadius: '999px' }} />
          </button>
          
          {isMenuOpen && (
            <div style={{ position: 'absolute', top: '54px', left: 0, background: '#ffffff', padding: '8px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '160px', zIndex: 1001, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <button onClick={() => setIsMenuOpen(false)} style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', textAlign: 'left', borderRadius: '12px', fontWeight: 600, color: '#0f172a' }}>Map Home</button>
              <button onClick={() => setIsMenuOpen(false)} style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', textAlign: 'left', borderRadius: '12px', fontWeight: 600, color: '#0f172a' }}>Saved Areas</button>
              <button onClick={() => setIsMenuOpen(false)} style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', textAlign: 'left', borderRadius: '12px', fontWeight: 600, color: '#ED2939' }}>Log Out</button>
            </div>
          )}
        </div>

        {/* Center: Main Logo Text */}
        <h1 style={{ color: '#ED2939', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>
          JOM AI
        </h1>

        {/* Right: Profile Logo (Navigates to /profile) */}
        <button
          onClick={() => navigate('/profile')}
          style={{ background: '#ED2939', border: 'none', width: '44px', height: '44px', borderRadius: '999px', color: '#ffffff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(237, 41, 57, 0.3)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        </button>
      </div>

      {/* ── Main Map Area ─────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.85)', flexDirection: 'column', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', border: '4px solid #f1f5f9', borderTopColor: '#ED2939', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ color: '#0f172a', fontSize: '14px', fontWeight: 600 }}>Loading Tampines...</p>
          </div>
        )}

        {error && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.9)' }}>
            <div style={{ background: '#ffffff', border: '1px solid #ef4444', borderRadius: '24px', padding: '24px', maxWidth: '300px', textAlign: 'center', boxShadow: '0 10px 25px rgba(239, 68, 68, 0.15)' }}>
              <p style={{ color: '#ef4444', fontWeight: 700, marginBottom: '8px' }}>Failed to load map</p>
              <p style={{ color: '#64748b', fontSize: '13px' }}>{error}</p>
            </div>
          </div>
        )}

        <FacilityMap facilities={facilities} />
      </div>

      {/* ── AI Chat Bottom Sheet ──────────────────────────────── */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          background: '#ffffff',
          borderTopLeftRadius: '32px',
          borderTopRightRadius: '32px',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.1)',
          zIndex: 2000,
          transform: isChatOpen ? 'translateY(0)' : 'translateY(calc(100% - 50px))',
          transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
          height: '80dvh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Handle (The flat dome top) */}
        <div
          onClick={() => setIsChatOpen(!isChatOpen)}
          style={{
            height: '50px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            background: '#ffffff',
            borderTopLeftRadius: '32px',
            borderTopRightRadius: '32px',
          }}
        >
          <div style={{ width: '48px', height: '6px', background: '#cbd5e1', borderRadius: '999px' }} />
        </div>

        {/* Chat History Container */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '16px' }}>
           <div style={{ background: '#ffffff', padding: '16px', borderRadius: '20px', borderTopLeftRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', display: 'inline-block', maxWidth: '85%', alignSelf: 'flex-start' }}>
             <p style={{ fontSize: '14px', color: '#0f172a', margin: 0, lineHeight: 1.5 }}>
               <span style={{ fontWeight: 'bold', color: '#ED2939' }}>JOM AI</span><br/>
               Hello! I can help you find suitable facilities, check the weather, or avoid crowded areas. Where to?
             </p>
           </div>
        </div>

        {/* Input Text Box Area */}
        <div style={{ padding: '16px 20px', background: '#ffffff', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '12px', alignItems: 'center', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <input
            type="text"
            placeholder="Ask JOM AI..."
            style={{ flex: 1, padding: '16px 24px', borderRadius: '999px', border: '1px solid #e2e8f0', background: '#f8fafc', outline: 'none', fontSize: '15px', color: '#0f172a' }}
          />
          {/* Voice Input Button */}
          <button style={{ width: '48px', height: '48px', borderRadius: '999px', background: '#f1f5f9', color: '#ED2939', border: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
          </button>
          {/* Send Button */}
          <button style={{ width: '48px', height: '48px', borderRadius: '999px', background: '#ED2939', color: '#ffffff', border: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: '0 4px 12px rgba(237, 41, 57, 0.3)' }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {/* Spinning animation keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
