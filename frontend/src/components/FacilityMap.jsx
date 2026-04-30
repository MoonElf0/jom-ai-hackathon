// src/components/FacilityMap.jsx
//
// Problem: Leaflet.js has a known bug with Vite — the default marker
//          icons (the blue pins) are broken because Vite changes the
//          file paths during build. We have to manually fix the icon paths.
// Solution: Import the icon images directly and tell Leaflet where they are.
//
// Problem: We need the map centred on Tampines with OneMap tiles as
//          the background, and a pin for every facility from Supabase.
// Solution: MapContainer from react-leaflet handles the map shell.
//           TileLayer points to OneMap's free tile server.
//           Each facility gets a Marker with a Popup.

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'

// Fix: Import Leaflet's default marker images directly so Vite can find them
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Patch the default icon so Leaflet finds the images
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

// Tampines Hub coordinates — map centres here on load
const TAMPINES_CENTER = [1.3521, 103.9439]
const DEFAULT_ZOOM    = 14

// Colour-coded icon for each facility type
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

function createColourIcon(type) {
  const colour = TYPE_COLOURS[type] || '#6366f1'
  // Build a tiny SVG circle as the map marker
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="10" fill="${colour}" stroke="white" stroke-width="2.5" opacity="0.95"/>
    </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

// Formats snake_case type to "Title Case" for display
function formatType(type) {
  return (type || 'Facility')
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function FacilityMap({ facilities = [] }) {
  return (
    <MapContainer
      center={TAMPINES_CENTER}
      zoom={DEFAULT_ZOOM}
      className="map-container"
      style={{ height: '100%', width: '100%' }}
    >
      {/* OneMap tile layer — Singapore government map, free to use */}
      <TileLayer
        url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
        attribution='<a href="https://www.onemap.gov.sg/" target="_blank">OneMap</a> &copy; Singapore Land Authority'
        maxZoom={19}
        minZoom={11}
        // Fallback to OpenStreetMap if OneMap is slow
        errorTileUrl="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Drop a pin for each facility */}
      {facilities.map((facility) => (
        <Marker
          key={facility.id}
          position={[facility.lat, facility.lng]}
          icon={createColourIcon(facility.type)}
        >
          <Popup className="facility-popup">
            <div style={{ minWidth: '180px' }}>
              <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>
                {facility.name}
              </p>
              <p style={{ color: TYPE_COLOURS[facility.type] || '#6366f1', fontSize: '12px', marginBottom: '6px' }}>
                {formatType(facility.type)}
              </p>
              {facility.address && (
                <p style={{ fontSize: '11px', color: '#64748b' }}>{facility.address}</p>
              )}
              <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {facility.is_sheltered && (
                  <span style={{ background: '#1e293b', color: '#22d3ee', padding: '2px 8px', borderRadius: '99px', fontSize: '10px' }}>
                    Sheltered
                  </span>
                )}
                {facility.is_indoor && (
                  <span style={{ background: '#1e293b', color: '#a78bfa', padding: '2px 8px', borderRadius: '99px', fontSize: '10px' }}>
                    Indoor
                  </span>
                )}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
