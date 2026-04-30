// src/pages/MapView.jsx
//
// Problem: The map page needs to load facility data from Supabase
//          and show it on the map. We don't want to show a blank map
//          while data is loading — that looks broken.
// Solution: Fetch facilities on mount, show a loading state,
//           then render the map once data arrives.

import { useEffect, useState } from 'react'
import FacilityMap from '../components/FacilityMap'
import { supabase } from '../utils/supabaseClient'

// Facility type → emoji for the legend
const LEGEND = [
  { type: 'fitness_corner',      label: 'Fitness Corner',       colour: '#22d3ee' },
  { type: 'playground',          label: 'Playground',           colour: '#4ade80' },
  { type: 'basketball_court',    label: 'Basketball Court',     colour: '#f97316' },
  { type: 'badminton_court',     label: 'Badminton Court',      colour: '#a78bfa' },
  { type: 'tennis_court',        label: 'Tennis Court',         colour: '#fbbf24' },
  { type: 'swimming_pool',       label: 'Swimming Pool',        colour: '#38bdf8' },
  { type: 'multi_purpose_court', label: 'Multi-Purpose Court',  colour: '#f472b6' },
  { type: 'gym',                 label: 'Gym',                  colour: '#fb923c' },
  { type: 'jogging_track',       label: 'Jogging Track',        colour: '#86efac' },
  { type: 'sheltered_pavilion',  label: 'Sheltered Pavilion',   colour: '#94a3b8' },
]

export default function MapView() {
  const [facilities, setFacilities]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [count, setCount]             = useState(0)

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

  // Filter facilities by type
  const displayed = activeFilter === 'all'
    ? facilities
    : facilities.filter(f => f.type === activeFilter)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f1117' }}>

      {/* ── Top Bar ─────────────────────────────────────── */}
      <div style={{
        padding: '12px 20px',
        background: '#1a1d27',
        borderBottom: '1px solid #2a2d3a',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#e2e8f0' }}>
            JOM AI — Tampines Facilities
          </h1>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            {loading ? 'Loading...' : `${displayed.length} of ${count} facilities shown`}
          </p>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
          <button
            onClick={() => setActiveFilter('all')}
            style={{
              padding: '4px 14px', borderRadius: '99px', fontSize: '12px', cursor: 'pointer',
              background: activeFilter === 'all' ? '#6366f1' : '#2a2d3a',
              color: '#e2e8f0', border: 'none',
            }}
          >
            All
          </button>
          {LEGEND.map(({ type, label, colour }) => (
            <button
              key={type}
              onClick={() => setActiveFilter(activeFilter === type ? 'all' : type)}
              style={{
                padding: '4px 14px', borderRadius: '99px', fontSize: '12px', cursor: 'pointer',
                background: activeFilter === type ? colour : '#2a2d3a',
                color: activeFilter === type ? '#0f1117' : '#e2e8f0',
                border: `1px solid ${activeFilter === type ? colour : 'transparent'}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Map Area ─────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15,17,23,0.8)', flexDirection: 'column', gap: '12px',
          }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              border: '3px solid #2a2d3a', borderTopColor: '#6366f1',
              animation: 'spin 0.8s linear infinite',
            }} />
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>Loading Tampines facilities...</p>
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15,17,23,0.9)',
          }}>
            <div style={{
              background: '#1a1d27', border: '1px solid #ef4444',
              borderRadius: '12px', padding: '24px', maxWidth: '400px', textAlign: 'center',
            }}>
              <p style={{ color: '#ef4444', fontWeight: 600, marginBottom: '8px' }}>
                Failed to load facilities
              </p>
              <p style={{ color: '#64748b', fontSize: '13px' }}>{error}</p>
              <p style={{ color: '#64748b', fontSize: '12px', marginTop: '8px' }}>
                Check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env
              </p>
            </div>
          </div>
        )}

        <FacilityMap facilities={displayed} />
      </div>

      {/* Spinning animation keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
