// src/components/FacilityMap.jsx
//
// Pure map component — all Leaflet concerns live here.
// Lazy-imported by MapView so Leaflet's large bundle lands in a separate chunk.
//
// Props:
//   facilities   — array of facility objects from Supabase
//   userLocation — [lat, lng] of user's live GPS position (null if unknown)
//   routeInfo    — route object from OneMap API (null when no active route)
//
// routeInfo shape for walk/drive/cycle:
//   { type, destinationName, destination: {lat,lng,name},
//     geometry (encoded polyline), summary: {duration, distance}, instructions }
//
// routeInfo shape for pt:
//   { type: 'pt', destinationName, destination: {lat,lng,name},
//     itinerary: { legs: [{mode, route, legGeometry: {points}, distance, ...}], duration },
//     summary: {duration, distance} }

import { memo, useEffect } from 'react'
import {
  MapContainer, TileLayer, Marker, Popup,
  Polyline, Circle, CircleMarker, useMap,
} from 'react-leaflet'
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

const SINGAPORE_BOUNDS = [
  [1.16, 103.59],
  [1.48, 104.10],
]

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

// PT leg colours
const LEG_COLOURS = {
  WALK:   '#94a3b8',
  BUS:    '#f59e0b',
  SUBWAY: '#3b82f6',
  RAIL:   '#3b82f6',
  TRAM:   '#22c55e',
}

// ─── Icon cache ──────────────────────────────────────────────────
const iconCache = {}

function getIcon(type) {
  if (iconCache[type]) return iconCache[type]
  const colour = TYPE_COLOURS[type] || '#6366f1'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="11" fill="${colour}" stroke="white" stroke-width="2.5" opacity="0.95"/>
    <circle cx="15" cy="15" r="5" fill="white" opacity="0.5"/>
  </svg>`
  const icon = L.divIcon({ html: svg, className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -18] })
  iconCache[type] = icon
  return icon
}

// Destination pin (red teardrop)
const DEST_ICON = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <path d="M16 0C7.16 0 0 7.16 0 16c0 10 16 24 16 24S32 26 32 16C32 7.16 24.84 0 16 0z" fill="#ED2939"/>
    <circle cx="16" cy="16" r="8" fill="white"/>
    <circle cx="16" cy="16" r="5" fill="#ED2939"/>
  </svg>`,
  className: '',
  iconSize:    [32, 40],
  iconAnchor:  [16, 40],
  popupAnchor: [0, -42],
})

// ─── Polyline decoder (Google / OneMap encoded format) ───────────
function decodePolyline(encoded) {
  if (!encoded) return []
  const points = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let b, shift = 0, result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    points.push([lat * 1e-5, lng * 1e-5])
  }
  return points
}

// ─── Auto-fit bounds when route changes ─────────────────────────
// Must be a child of MapContainer to use useMap()
function FitBoundsEffect({ routeInfo, userLocation }) {
  const map = useMap()

  useEffect(() => {
    if (!routeInfo) return
    const pts = []

    if (userLocation) pts.push(L.latLng(userLocation[0], userLocation[1]))

    const addGeom = (encoded) => {
      decodePolyline(encoded).forEach(([la, ln]) => pts.push(L.latLng(la, ln)))
    }

    if (routeInfo.type === 'pt') {
      routeInfo.itinerary?.legs?.forEach(leg => addGeom(leg.legGeometry?.points))
    } else {
      addGeom(routeInfo.geometry)
    }

    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 80] })
    }
  }, [routeInfo, userLocation, map])

  return null
}

// Formats "snake_case" → "Title Case"
function formatType(type) {
  return (type || 'Facility')
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ─── Component ───────────────────────────────────────────────────
export default memo(function FacilityMap({ facilities = [], userLocation = null, routeInfo = null }) {
  return (
    <MapContainer
      center={TAMPINES_CENTER}
      zoom={DEFAULT_ZOOM}
      className="map-container"
      maxBounds={SINGAPORE_BOUNDS}
      maxBoundsViscosity={1.0}
      minZoom={13}
      attributionControl={true}
      zoomControl={true}
    >
      {/* OneMap tiles with OSM fallback */}
      <TileLayer
        url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
        attribution='<a href="https://www.onemap.gov.sg/" target="_blank">OneMap</a> &copy; Singapore Land Authority'
        maxZoom={19}
        minZoom={13}
        errorTileUrl="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Facility markers */}
      {facilities.map((f) => (
        <Marker key={f.id} position={[f.lat, f.lng]} icon={getIcon(f.type)}>
          <Popup className="facility-popup">
            <p className="popup-name">{f.name}</p>
            <p className="popup-type" style={{ color: TYPE_COLOURS[f.type] || '#6366f1' }}>
              {formatType(f.type)}
            </p>
            {f.address && <p className="popup-address">{f.address}</p>}
            {(f.is_sheltered || f.is_indoor) && (
              <div className="popup-tags">
                {f.is_sheltered && <span className="popup-tag sheltered">Sheltered</span>}
                {f.is_indoor    && <span className="popup-tag indoor">Indoor</span>}
              </div>
            )}
          </Popup>
        </Marker>
      ))}

      {/* ── User location indicator ── */}
      {userLocation && (
        <>
          {/* Accuracy ring */}
          <Circle
            center={userLocation}
            radius={40}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1 }}
          />
          {/* Position dot */}
          <CircleMarker
            center={userLocation}
            radius={8}
            pathOptions={{ color: '#ffffff', fillColor: '#3b82f6', fillOpacity: 1, weight: 3 }}
          />
        </>
      )}

      {/* ── Walk / Drive / Cycle route polyline ── */}
      {routeInfo && routeInfo.type !== 'pt' && routeInfo.geometry && (
        <Polyline
          positions={decodePolyline(routeInfo.geometry)}
          pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
        />
      )}

      {/* ── Public transport route legs ── */}
      {routeInfo?.type === 'pt' && routeInfo.itinerary?.legs?.map((leg, i) => {
        const positions = decodePolyline(leg.legGeometry?.points || '')
        if (!positions.length) return null
        const isWalk = leg.mode === 'WALK'
        return (
          <Polyline
            key={i}
            positions={positions}
            pathOptions={{
              color:     LEG_COLOURS[leg.mode] || '#3b82f6',
              weight:    isWalk ? 3 : 5,
              opacity:   0.85,
              dashArray: isWalk ? '6 9' : undefined,
              lineCap:   'round',
              lineJoin:  'round',
            }}
          />
        )
      })}

      {/* ── Destination marker ── */}
      {routeInfo?.destination && (
        <Marker
          position={[routeInfo.destination.lat, routeInfo.destination.lng]}
          icon={DEST_ICON}
        >
          <Popup>{routeInfo.destinationName}</Popup>
        </Marker>
      )}

      {/* Auto-fit map to show full route */}
      {routeInfo && <FitBoundsEffect routeInfo={routeInfo} userLocation={userLocation} />}
    </MapContainer>
  )
})
