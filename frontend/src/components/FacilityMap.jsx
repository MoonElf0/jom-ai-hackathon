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
//     itinerary: { legs: [{mode, route, legGeometry: {points}, distance,
//                          from: {lat,lon,name}, to: {lat,lon,name},
//                          intermediateStops: [{lat,lon,name}], transitLeg, ...}],
//                  duration },
//     summary: {duration, distance} }

import { memo, useEffect } from 'react'
import {
  MapContainer, TileLayer, Marker, Popup,
  Polyline, Circle, CircleMarker, useMap, Polygon,
} from 'react-leaflet'
import L from 'leaflet'
import { TAMPINES_BOUNDARY } from '../utils/tampinesBoundary'

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

// The "World" box used to create the mask
const OUTER_WORLD = [
  [-90, -180],
  [-90, 180],
  [90, 180],
  [90, -180],
]

// Create a mask that covers everything except the precise Tampines boundary
const MASK_COORDS = [
  OUTER_WORLD,
  ...TAMPINES_BOUNDARY
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

// Singapore MRT/LRT line colours keyed by route code
const MRT_LINE_COLOURS = {
  NS:  '#e2231a',  // North South — red
  EW:  '#009645',  // East West — green
  CG:  '#009645',  // Changi branch (EW) — green
  NE:  '#9900aa',  // North East — purple
  CC:  '#fa9e0d',  // Circle — orange
  CE:  '#fa9e0d',  // Circle extension — orange
  DT:  '#005ec4',  // Downtown — dark blue
  TE:  '#9d5b25',  // Thomson-East Coast — brown
  BP:  '#748477',  // Bukit Panjang LRT — gray
  SE:  '#748477',  // Sengkang LRT
  SW:  '#748477',
  PE:  '#748477',  // Punggol LRT
  PW:  '#748477',
}

const BUS_COLOUR  = '#34a853'  // light green (Google Maps style)
const WALK_COLOUR = '#94a3b8'  // gray

function getLegColor(mode, route) {
  if (mode === 'WALK') return WALK_COLOUR
  if (mode === 'BUS')  return BUS_COLOUR
  // SUBWAY / RAIL / TRAM — look up by line code
  return MRT_LINE_COLOURS[route?.toUpperCase()] || '#6366f1'
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

// ─── Transit label pill icon ─────────────────────────────────────
// Shows route codes like "NE", "963", "NE>CC", "963>234"
const transitLabelCache = {}
function getTransitLabelIcon(label, color) {
  const key = `${label}-${color}`
  if (transitLabelCache[key]) return transitLabelCache[key]
  const charW  = 7.5
  const padX   = 9
  const h      = 24
  const w      = Math.max(32, Math.ceil(label.length * charW + padX * 2))
  const rx     = h / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${rx - 1}" fill="${color}" stroke="white" stroke-width="2"/>
    <text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="system-ui,sans-serif">${label}</text>
  </svg>`
  const icon = L.divIcon({
    html:        svg,
    className:   '',
    iconSize:    [w, h],
    iconAnchor:  [w / 2, h / 2],
    popupAnchor: [0, -14],
  })
  transitLabelCache[key] = icon
  return icon
}

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

// ─── Build PT marker list ────────────────────────────────────────
// Returns two arrays:
//   stepMarkers — boarding / transfer / alighting points (numbered icons)
//   stopMarkers — intermediate stops (small colored dots)
function buildPTMarkers(routeInfo) {
  const stepMarkers = []
  const stopMarkers = []
  if (!routeInfo?.itinerary?.legs) return { stepMarkers, stopMarkers }

  const legs = routeInfo.itinerary.legs
  let stepNum = 1

  legs.forEach((leg, i) => {
    if (!leg.transitLeg) return

    const from    = leg.from
    const to      = leg.to
    const prevLeg = legs[i - 1]
    const nextLeg = legs[i + 1]

    const color     = getLegColor(leg.mode, leg.route)
    const routeCode = leg.route || leg.mode

    // Transfer = boards at same station the previous transit leg exited
    const isTransfer = prevLeg?.transitLeg && prevLeg?.to?.name === from?.name
    const prevCode   = prevLeg?.route || prevLeg?.mode || ''

    // Boarding / Transfer marker
    if (from?.lat != null && from?.lon != null) {
      // iconLabel: "NE>CC" for transfer, "NE" / "963" for first board
      const iconLabel  = isTransfer ? `${prevCode}>${routeCode}` : routeCode
      const popupLabel = isTransfer
        ? `Transfer: ${prevCode} → ${routeCode}`
        : `Board ${leg.mode === 'BUS' ? 'Bus ' + routeCode : routeCode + ' Line'}`
      stepMarkers.push({
        key:        `board-${i}`,
        lat:        from.lat,
        lon:        from.lon,
        color,
        iconLabel,
        popupLabel,
        name:       from.name,
      })
    }

    // Alighting marker — only at the last transit stop before a walk / destination
    if (to?.lat != null && to?.lon != null && !nextLeg?.transitLeg) {
      stepMarkers.push({
        key:        `alight-${i}`,
        lat:        to.lat,
        lon:        to.lon,
        color,
        iconLabel:  routeCode,
        popupLabel: `Alight here`,
        name:       to.name,
      })
    }

    // Intermediate stops as small dots
    leg.intermediateStops?.forEach((stop, j) => {
      if (stop.lat != null && stop.lon != null) {
        stopMarkers.push({
          key:   `stop-${i}-${j}`,
          lat:   stop.lat,
          lon:   stop.lon,
          color,
          name:  stop.name,
        })
      }
    })
  })

  return { stepMarkers, stopMarkers }
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
  const { stepMarkers, stopMarkers } = routeInfo?.type === 'pt'
    ? buildPTMarkers(routeInfo)
    : { stepMarkers: [], stopMarkers: [] }

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

      {/* Tampines Boundary Mask (Grey out everything else) */}
      <Polygon
        positions={MASK_COORDS}
        pathOptions={{
          fillColor: '#000',
          fillOpacity: 0.35,
          color: '#000',
          weight: 0.5,
          opacity: 0.2,
        }}
        interactive={false}
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
          <Circle
            center={userLocation}
            radius={40}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1 }}
          />
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
          pathOptions={{ color: '#16a34a', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
        />
      )}

{/* walk step markers removed — path itself is the guide */}

      {/* ── Public transport route polylines (colored by mode) ── */}
      {routeInfo?.type === 'pt' && routeInfo.itinerary?.legs?.map((leg, i) => {
        const positions = decodePolyline(leg.legGeometry?.points || '')
        if (!positions.length) return null
        return (
          <Polyline
            key={i}
            positions={positions}
            pathOptions={{
              color:    getLegColor(leg.mode, leg.route),
              weight:   6,
              opacity:  0.9,
              lineCap:  'round',
              lineJoin: 'round',
            }}
          />
        )
      })}

      {/* ── PT intermediate stop dots ── */}
      {stopMarkers.map(m => (
        <CircleMarker
          key={m.key}
          center={[m.lat, m.lon]}
          radius={5}
          pathOptions={{
            color:       'white',
            fillColor:   m.color,
            fillOpacity: 0.9,
            weight:      1.5,
          }}
        >
          <Popup><span style={{ fontSize: '12px' }}>{m.name}</span></Popup>
        </CircleMarker>
      ))}

      {/* ── PT boarding / transfer / alighting pill labels ── */}
      {stepMarkers.map(m => (
        <Marker key={m.key} position={[m.lat, m.lon]} icon={getTransitLabelIcon(m.iconLabel, m.color)}>
          <Popup>
            <strong style={{ fontSize: '13px' }}>{m.popupLabel}</strong>
            {m.name && (
              <><br /><span style={{ color: '#64748b', fontSize: '12px' }}>{m.name}</span></>
            )}
          </Popup>
        </Marker>
      ))}

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
