// src/components/SearchBar.jsx
// Theme-aware search bar — all colors via CSS variables, no hardcoded hex.

import { useState, useEffect, useRef } from 'react'

// ── Icons ──────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>
)
const StarIcon = ({ filled }) => (
  <svg width="16" height="16" viewBox="0 0 24 24"
    fill={filled ? '#fbbf24' : 'none'}
    stroke={filled ? '#fbbf24' : 'currentColor'} strokeWidth="2">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)
const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
)

// ── Storage helpers ────────────────────────────────────────────
const RECENT_KEY = 'jom_recent_searches'
const FAVE_KEY   = 'jom_favourites'
const MAX_RECENT = 8
function loadLS(key)     { try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] } }
function saveLS(key, val){ localStorage.setItem(key, JSON.stringify(val)) }

// ── Type colours ───────────────────────────────────────────────
const TYPE_COLOURS = {
  fitness_corner: '#22d3ee', playground: '#4ade80', basketball_court: '#f97316',
  badminton_court: '#a78bfa', tennis_court: '#fbbf24', swimming_pool: '#38bdf8',
  multi_purpose_court: '#f472b6', gym: '#fb923c', jogging_track: '#86efac',
  sheltered_pavilion: '#94a3b8',
}
function formatType(t) {
  return (t || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ═══════════════════════════════════════════════════════════════
// SEARCHBAR
// ═══════════════════════════════════════════════════════════════
export default function SearchBar({ facilities = [], onSelectFacility }) {
  const [query,      setQuery]      = useState('')
  const [isFocused,  setIsFocused]  = useState(false)
  const [activeTab,  setActiveTab]  = useState('search')
  const [recents,    setRecents]    = useState(() => loadLS(RECENT_KEY))
  const [favourites, setFavourites] = useState(() => loadLS(FAVE_KEY))
  const wrapperRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    function outside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsFocused(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  const trimmed     = query.trim().toLowerCase()
  const showDropdown = isFocused

  const suggestions = trimmed.length >= 1
    ? facilities.filter(f =>
        f.name.toLowerCase().includes(trimmed) ||
        formatType(f.type).toLowerCase().includes(trimmed)
      ).slice(0, 8)
    : []

  const allTypeLabels   = [...new Set(facilities.map(f => formatType(f.type)))]
  const placeholderHints = trimmed.length >= 2
    ? allTypeLabels.filter(l => l.toLowerCase().includes(trimmed)).slice(0, 3)
    : []

  const recentFacilities    = recents.map(id => facilities.find(f => f.id === id)).filter(Boolean)
  const favouriteFacilities = favourites.map(id => facilities.find(f => f.id === id)).filter(Boolean)

  function handleSelect(facility) {
    const updated = [facility.id, ...recents.filter(id => id !== facility.id)].slice(0, MAX_RECENT)
    setRecents(updated); saveLS(RECENT_KEY, updated)
    setQuery(''); setIsFocused(false)
    onSelectFacility?.(facility)
  }
  function toggleFavourite(facilityId, e) {
    e?.stopPropagation()
    const updated = favourites.includes(facilityId)
      ? favourites.filter(id => id !== facilityId)
      : [facilityId, ...favourites]
    setFavourites(updated); saveLS(FAVE_KEY, updated)
  }
  function clearRecents() { setRecents([]); saveLS(RECENT_KEY, []) }

  return (
    <div ref={wrapperRef} className="sb-wrap">

      {/* Input row */}
      <div className={`sb-input-row${showDropdown ? ' sb-open' : ''}${isFocused ? ' sb-focused' : ''}`}>
        <span className="sb-icon"><SearchIcon /></span>
        <input
          className="sb-input"
          type="text"
          placeholder="Search facilities, courts, parks…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          aria-label="Search facilities"
        />
        {query && (
          <button className="sb-clear-btn" onClick={() => setQuery('')} aria-label="Clear search">
            <XIcon />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="sb-dropdown">

          {/* Tabs */}
          <div className="sb-tabs">
            {['search', 'favourites'].map(tab => (
              <button key={tab} className={`sb-tab-btn${activeTab === tab ? ' active' : ''}`}
                onClick={() => setActiveTab(tab)}>
                {tab === 'search' ? '🔍 Search' : `⭐ Favourites (${favouriteFacilities.length})`}
              </button>
            ))}
          </div>

          {/* Search tab */}
          {activeTab === 'search' && (
            <div>
              {/* Type hints */}
              {placeholderHints.length > 0 && suggestions.length === 0 && (
                <div style={{ padding: '4px 0' }}>
                  <p className="sb-section-label">Try searching for</p>
                  {placeholderHints.map(hint => (
                    <button key={hint} className="sb-hint-btn" onClick={() => setQuery(hint)}>
                      🔎 {hint}
                    </button>
                  ))}
                </div>
              )}

              {/* Results */}
              {suggestions.length > 0 && (
                <div>
                  <p className="sb-section-label">Results ({suggestions.length})</p>
                  {suggestions.map(f => (
                    <FacilityRow key={f.id} facility={f}
                      isFavourite={favourites.includes(f.id)}
                      onSelect={() => handleSelect(f)}
                      onToggleFav={e => toggleFavourite(f.id, e)} />
                  ))}
                </div>
              )}

              {/* No results */}
              {trimmed.length >= 2 && suggestions.length === 0 && placeholderHints.length === 0 && (
                <p className="sb-empty">No facilities found for "{query}"</p>
              )}

              {/* Recent searches */}
              {trimmed.length === 0 && recentFacilities.length > 0 && (
                <div>
                  <div className="sb-recent-header">
                    <p className="sb-section-label" style={{ margin: 0 }}>Recent Searches</p>
                    <button className="sb-clear-recents" onClick={clearRecents}>Clear all</button>
                  </div>
                  {recentFacilities.map(f => (
                    <FacilityRow key={f.id} facility={f} icon={<ClockIcon />}
                      isFavourite={favourites.includes(f.id)}
                      onSelect={() => handleSelect(f)}
                      onToggleFav={e => toggleFavourite(f.id, e)} />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {trimmed.length === 0 && recentFacilities.length === 0 && (
                <p className="sb-empty">Start typing to search Tampines facilities…</p>
              )}
            </div>
          )}

          {/* Favourites tab */}
          {activeTab === 'favourites' && (
            <div>
              {favouriteFacilities.length > 0 ? (
                favouriteFacilities.map(f => (
                  <FacilityRow key={f.id} facility={f} isFavourite={true}
                    onSelect={() => handleSelect(f)}
                    onToggleFav={e => toggleFavourite(f.id, e)} />
                ))
              ) : (
                <div className="sb-fav-empty">
                  <p style={{ fontSize: '28px', marginBottom: '8px' }}>⭐</p>
                  <p className="sb-empty" style={{ padding: '0' }}>No favourites yet</p>
                  <p className="sb-empty-sub">Click the star on any facility to save it here</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Reusable row ───────────────────────────────────────────────
function FacilityRow({ facility, icon, isFavourite, onSelect, onToggleFav }) {
  const colour = TYPE_COLOURS[facility.type] || '#6366f1'
  return (
    <button className="sb-facility-row" onClick={onSelect}>
      {icon || <span className="sb-facility-dot" style={{ background: colour }} />}
      <div className="sb-facility-info">
        <p className="sb-facility-name">{facility.name}</p>
        <p className="sb-facility-type" style={{ color: colour }}>
          {formatType(facility.type)}
          {facility.address && <span className="sb-facility-addr"> · {facility.address}</span>}
        </p>
      </div>
      <button className="sb-fav-btn" onClick={onToggleFav}
        title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
        aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}>
        <StarIcon filled={isFavourite} />
      </button>
    </button>
  )
}
