// src/components/SearchBar.jsx
//
// Problem: Users can't quickly find a specific facility on the map.
// Solution: A search bar that filters facilities as you type, shows
//           recent searches from localStorage, autocomplete suggestions,
//           and a favourites tab.

import { useState, useEffect, useRef } from 'react'

// ── Icons as inline SVGs (no extra dependencies) ─────────────
const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>
)
const StarIcon = ({ filled }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? '#fbbf24' : 'none'}
    stroke={filled ? '#fbbf24' : 'currentColor'} strokeWidth="2">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)
const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
)

// ── Helpers ──────────────────────────────────────────────────
const RECENT_KEY   = 'jom_recent_searches'
const FAVE_KEY     = 'jom_favourites'
const MAX_RECENT   = 8

function loadFromStorage(key) {
  try { return JSON.parse(localStorage.getItem(key)) || [] }
  catch { return [] }
}
function saveToStorage(key, val) {
  localStorage.setItem(key, JSON.stringify(val))
}

// Formats "fitness_corner" → "Fitness Corner"
function formatType(t) {
  return (t || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Type → colour dot
const TYPE_COLOURS = {
  fitness_corner: '#22d3ee', playground: '#4ade80', basketball_court: '#f97316',
  badminton_court: '#a78bfa', tennis_court: '#fbbf24', swimming_pool: '#38bdf8',
  multi_purpose_court: '#f472b6', gym: '#fb923c', jogging_track: '#86efac',
  sheltered_pavilion: '#94a3b8',
}

// ═════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════
export default function SearchBar({ facilities = [], onSelectFacility }) {
  const [query, setQuery]           = useState('')
  const [isFocused, setIsFocused]   = useState(false)
  const [activeTab, setActiveTab]   = useState('search')   // 'search' | 'favourites'
  const [recents, setRecents]       = useState(() => loadFromStorage(RECENT_KEY))
  const [favourites, setFavourites] = useState(() => loadFromStorage(FAVE_KEY))
  const wrapperRef = useRef(null)

  // Close dropdown when clicking outside the search bar
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Search logic ──────────────────────────────────────────
  const trimmed = query.trim().toLowerCase()

  // Autocomplete suggestions: match facility name OR type
  const suggestions = trimmed.length >= 1
    ? facilities.filter(f =>
        f.name.toLowerCase().includes(trimmed) ||
        formatType(f.type).toLowerCase().includes(trimmed)
      ).slice(0, 8)
    : []

  // Placeholder completions (show what the user could finish typing)
  // e.g. if user types "bas" → show "basketball court" as a hint
  const allTypeLabels = [...new Set(facilities.map(f => formatType(f.type)))]
  const placeholderHints = trimmed.length >= 2
    ? allTypeLabels.filter(l => l.toLowerCase().includes(trimmed)).slice(0, 3)
    : []

  // ── Actions ───────────────────────────────────────────────
  function handleSelect(facility) {
    // Add to recent searches (most recent first, no duplicates)
    const updated = [
      facility.id,
      ...recents.filter(id => id !== facility.id)
    ].slice(0, MAX_RECENT)
    setRecents(updated)
    saveToStorage(RECENT_KEY, updated)

    setQuery('')
    setIsFocused(false)
    onSelectFacility?.(facility)
  }

  function toggleFavourite(facilityId, e) {
    e?.stopPropagation()
    let updated
    if (favourites.includes(facilityId)) {
      updated = favourites.filter(id => id !== facilityId)
    } else {
      updated = [facilityId, ...favourites]
    }
    setFavourites(updated)
    saveToStorage(FAVE_KEY, updated)
  }

  function clearRecents() {
    setRecents([])
    saveToStorage(RECENT_KEY, [])
  }

  // Resolve IDs back to facility objects
  const recentFacilities = recents
    .map(id => facilities.find(f => f.id === id))
    .filter(Boolean)

  const favouriteFacilities = favourites
    .map(id => facilities.find(f => f.id === id))
    .filter(Boolean)

  const showDropdown = isFocused

  // ── Render ────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', maxWidth: '520px' }}>

      {/* ── Search Input ─────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        background: '#1e2130', border: '1px solid #2a2d3a',
        borderRadius: showDropdown ? '12px 12px 0 0' : '12px',
        padding: '8px 14px',
        transition: 'border-color 0.2s',
        borderColor: isFocused ? '#6366f1' : '#2a2d3a',
      }}>
        <SearchIcon />
        <input
          type="text"
          placeholder="Search facilities, courts, parks..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: '#e2e8f0', fontSize: '14px', fontFamily: 'Inter, sans-serif',
          }}
        />
        {query && (
          <button onClick={() => setQuery('')} style={{
            background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
            display: 'flex', alignItems: 'center',
          }}>
            <XIcon />
          </button>
        )}
      </div>

      {/* ── Dropdown Panel ───────────────────────────────── */}
      {showDropdown && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 2000,
          background: '#1e2130', border: '1px solid #2a2d3a', borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          maxHeight: '380px', overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}>

          {/* ── Tab Switcher ─────────────────────────────── */}
          <div style={{
            display: 'flex', borderBottom: '1px solid #2a2d3a',
          }}>
            {['search', 'favourites'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
                  background: 'transparent', fontSize: '12px', fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  color: activeTab === tab ? '#6366f1' : '#64748b',
                  borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
                  transition: 'all 0.2s',
                }}
              >
                {tab === 'search' ? '🔍 Search' : `⭐ Favourites (${favouriteFacilities.length})`}
              </button>
            ))}
          </div>

          {/* ── SEARCH TAB ───────────────────────────────── */}
          {activeTab === 'search' && (
            <div style={{ padding: '8px 0' }}>

              {/* Placeholder hints (type completions) */}
              {placeholderHints.length > 0 && suggestions.length === 0 && (
                <div style={{ padding: '4px 16px' }}>
                  <p style={{ fontSize: '10px', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Try searching for
                  </p>
                  {placeholderHints.map(hint => (
                    <button
                      key={hint}
                      onClick={() => setQuery(hint)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '6px 8px', background: 'transparent', border: 'none',
                        color: '#94a3b8', fontSize: '13px', cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif',
                        borderRadius: '6px',
                      }}
                      onMouseEnter={e => e.target.style.background = '#252839'}
                      onMouseLeave={e => e.target.style.background = 'transparent'}
                    >
                      🔎 {hint}
                    </button>
                  ))}
                </div>
              )}

              {/* Search results */}
              {suggestions.length > 0 && (
                <div>
                  <p style={{ fontSize: '10px', color: '#64748b', padding: '4px 16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Results ({suggestions.length})
                  </p>
                  {suggestions.map(f => (
                    <FacilityRow
                      key={f.id}
                      facility={f}
                      isFavourite={favourites.includes(f.id)}
                      onSelect={() => handleSelect(f)}
                      onToggleFav={e => toggleFavourite(f.id, e)}
                    />
                  ))}
                </div>
              )}

              {/* No results message */}
              {trimmed.length >= 2 && suggestions.length === 0 && placeholderHints.length === 0 && (
                <p style={{ padding: '20px 16px', color: '#64748b', fontSize: '13px', textAlign: 'center' }}>
                  No facilities found for "{query}"
                </p>
              )}

              {/* Recent searches (only when search box is empty) */}
              {trimmed.length === 0 && recentFacilities.length > 0 && (
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '4px 16px',
                  }}>
                    <p style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Recent Searches
                    </p>
                    <button onClick={clearRecents} style={{
                      background: 'none', border: 'none', color: '#64748b',
                      fontSize: '10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    }}>
                      Clear all
                    </button>
                  </div>
                  {recentFacilities.map(f => (
                    <FacilityRow
                      key={f.id}
                      facility={f}
                      icon={<ClockIcon />}
                      isFavourite={favourites.includes(f.id)}
                      onSelect={() => handleSelect(f)}
                      onToggleFav={e => toggleFavourite(f.id, e)}
                    />
                  ))}
                </div>
              )}

              {/* Empty state: nothing typed and no recents */}
              {trimmed.length === 0 && recentFacilities.length === 0 && (
                <p style={{ padding: '24px 16px', color: '#475569', fontSize: '13px', textAlign: 'center' }}>
                  Start typing to search Tampines facilities...
                </p>
              )}
            </div>
          )}

          {/* ── FAVOURITES TAB ───────────────────────────── */}
          {activeTab === 'favourites' && (
            <div style={{ padding: '8px 0' }}>
              {favouriteFacilities.length > 0 ? (
                favouriteFacilities.map(f => (
                  <FacilityRow
                    key={f.id}
                    facility={f}
                    isFavourite={true}
                    onSelect={() => handleSelect(f)}
                    onToggleFav={e => toggleFavourite(f.id, e)}
                  />
                ))
              ) : (
                <div style={{ padding: '30px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '28px', marginBottom: '8px' }}>⭐</p>
                  <p style={{ color: '#64748b', fontSize: '13px' }}>No favourites yet</p>
                  <p style={{ color: '#475569', fontSize: '11px', marginTop: '4px' }}>
                    Click the star icon on any facility to save it here
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ── Reusable row component for facility items ────────────────
function FacilityRow({ facility, icon, isFavourite, onSelect, onToggleFav }) {
  const colour = TYPE_COLOURS[facility.type] || '#6366f1'

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
        padding: '10px 16px', background: 'transparent', border: 'none',
        cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
        fontFamily: 'Inter, sans-serif',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#252839'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Colour dot or icon */}
      {icon || (
        <span style={{
          width: '10px', height: '10px', borderRadius: '50%',
          background: colour, flexShrink: 0,
        }} />
      )}

      {/* Name + type */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          color: '#e2e8f0', fontSize: '13px', fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {facility.name}
        </p>
        <p style={{ color: colour, fontSize: '11px', marginTop: '1px' }}>
          {formatType(facility.type)}
          {facility.address && (
            <span style={{ color: '#475569', marginLeft: '6px' }}>· {facility.address}</span>
          )}
        </p>
      </div>

      {/* Favourite star */}
      <button
        onClick={onToggleFav}
        title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#64748b', display: 'flex', alignItems: 'center',
          padding: '4px', borderRadius: '6px',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#2a2d3a'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <StarIcon filled={isFavourite} />
      </button>
    </button>
  )
}
