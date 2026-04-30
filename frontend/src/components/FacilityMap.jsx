// src/components/FacilityMap.jsx
//
// Pure map component — all Leaflet concerns live here.
// This module is lazy-imported by MapView so Leaflet's large bundle
// lands in a separate JS chunk and never blocks the UI thread.
//
// Popup styles are defined in index.css (.popup-*) so there are
// no inline style objects created on every render.

import { memo } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

// Fix: Vite renames asset paths — manually wire Leaflet's default icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon   from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl:       markerIcon,
  shadowUrl:     markerShadow,
})

// ─── Constants ──────────────────────────────────────────────────
const TAMPINES_CENTER = [1.3521, 103.9439]
const DEFAULT_ZOOM    = 14

// Colour palette per facility type
const TYPE_COLOURS = {
  fitness_corner:      '#22d3ee',
  playground:          '#4ade80',
  basketball_court:    '#f97316',
  badminton_court:     '#a78bfa',
  tennis_court:        '#fbbf24',
  swimming_pool:       '#38bdf8',
  multi_purpose_court: '#f472b6',
  gym:                 '#fb923c',
  jogging_track:       '#86efac',
  sheltered_pavilion:  '#94a3b8',
}

// Cache icons so we don't recreate SVG strings every render
const iconCache = {}

function getIcon(type) {
  if (iconCache[type]) return iconCache[type]

  const colour = TYPE_COLOURS[type] || '#6366f1'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="11" fill="${colour}" stroke="white" stroke-width="2.5" opacity="0.95"/>
    <circle cx="15" cy="15" r="5" fill="white" opacity="0.5"/>
  </svg>`

  const icon = L.divIcon({
    html: svg,
    className: '',
    iconSize:    [30, 30],
    iconAnchor:  [15, 15],
    popupAnchor: [0, -18],
  })

  iconCache[type] = icon
  return icon
}

// Formats "snake_case" → "Title Case"
function formatType(type) {
  return (type || 'Facility')
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ─── Component ───────────────────────────────────────────────────
export default memo(function FacilityMap({ facilities = [] }) {
  return (
    <MapContainer
      center={TAMPINES_CENTER}
      zoom={DEFAULT_ZOOM}
      className="map-container"
      // Disable attribution prefix for cleaner look
      attributionControl={true}
      zoomControl={true}
    >
      {/* OneMap (Singapore gov) tiles with OSM fallback */}
      <TileLayer
        url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
        attribution='<a href="https://www.onemap.gov.sg/" target="_blank">OneMap</a> &copy; Singapore Land Authority'
        maxZoom={19}
        minZoom={11}
        errorTileUrl="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Facility markers */}
      {facilities.map((f) => (
        <Marker
          key={f.id}
          position={[f.lat, f.lng]}
          icon={getIcon(f.type)}
        >
          <Popup className="facility-popup">
            <p className="popup-name">{f.name}</p>
            <p
              className="popup-type"
              style={{ color: TYPE_COLOURS[f.type] || '#6366f1' }}
            >
              {formatType(f.type)}
            </p>

            {f.address && (
              <p className="popup-address">{f.address}</p>
            )}

            {(f.is_sheltered || f.is_indoor) && (
              <div className="popup-tags">
                {f.is_sheltered && (
                  <span className="popup-tag sheltered">Sheltered</span>
                )}
                {f.is_indoor && (
                  <span className="popup-tag indoor">Indoor</span>
                )}
              </div>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
})
