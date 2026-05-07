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

import { memo, useEffect, useRef, useState } from 'react'
import {
  MapContainer, TileLayer, Marker, Popup,
  Polyline, Circle, CircleMarker, useMap, useMapEvents, Polygon,
} from 'react-leaflet'
import L from 'leaflet'
import { TAMPINES_BOUNDARY } from '../utils/tampinesBoundary'

// Fix: Vite renames asset paths — manually wire Leaflet's default icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

// ─── Constants ──────────────────────────────────────────────────
const TAMPINES_CENTER = [1.3521, 103.9439]
const DEFAULT_ZOOM = 14
const ICON_ZOOM_THRESHOLD = 15  // markers hidden below this zoom level

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
  fitness_corner: '#22d3ee',
  playground: '#4ade80',
  basketball_court: '#f97316',
  badminton_court: '#a78bfa',
  tennis_court: '#fbbf24',
  swimming_pool: '#38bdf8',
  multi_purpose_court: '#f472b6',
  gym: '#fb923c',
  jogging_track: '#86efac',
  sheltered_pavilion: '#94a3b8',
  volleyball_court: '#34d399',
  football_field: '#10b981',
  futsal_court: '#059669',
  cycling_path: '#60a5fa',
  community_hall: '#c084fc',
  park: '#4ade80',
  skate_park: '#f87171',
}

// Emoji icons for each facility type
const TYPE_ICONS = {
  basketball_court: '🏀',
  badminton_court: '🏸',
  tennis_court: '🎾',
  volleyball_court: '🏐',
  football_field: '⚽',
  futsal_court: '⚽',
  fitness_corner: '🏋️',
  gym: '💪',
  swimming_pool: '🏊',
  playground: '🛝',
  cycling_path: '🚴',
  jogging_track: '🏃',
  multi_purpose_court: '🏟️',
  sheltered_pavilion: '⛺',
  community_hall: '🏛️',
  park: '🌳',
  skate_park: '🛹',
}

// Singapore MRT/LRT line colours keyed by route code
const MRT_LINE_COLOURS = {
  NS: '#e2231a',  // North South — red
  EW: '#009645',  // East West — green
  CG: '#009645',  // Changi branch (EW) — green
  NE: '#9900aa',  // North East — purple
  CC: '#fa9e0d',  // Circle — orange
  CE: '#fa9e0d',  // Circle extension — orange
  DT: '#005ec4',  // Downtown — dark blue
  TE: '#9d5b25',  // Thomson-East Coast — brown
  BP: '#748477',  // Bukit Panjang LRT — gray
  SE: '#748477',  // Sengkang LRT
  SW: '#748477',
  PE: '#748477',  // Punggol LRT
  PW: '#748477',
}

const BUS_COLOUR = '#34a853'  // light green (Google Maps style)
const WALK_COLOUR = '#94a3b8'  // gray

function getLegColor(mode, route) {
  if (mode === 'WALK') return WALK_COLOUR
  if (mode === 'BUS') return BUS_COLOUR
  // SUBWAY / RAIL / TRAM — look up by line code
  return MRT_LINE_COLOURS[route?.toUpperCase()] || '#6366f1'
}

// ── Mock data helpers (replace with real Supabase queries later) ──────
const CROWD_LEVELS = [
  { label: 'Empty',    pct: 5,  colour: '#10b981', bg: 'rgba(16,185,129,0.15)', people: 0  },
  { label: 'Quiet',   pct: 25, colour: '#34d399', bg: 'rgba(52,211,153,0.15)', people: 2  },
  { label: 'Moderate',pct: 55, colour: '#fbbf24', bg: 'rgba(251,191,36,0.15)', people: 7  },
  { label: 'Busy',    pct: 80, colour: '#f97316', bg: 'rgba(249,115,22,0.15)', people: 14 },
  { label: 'Full',    pct: 98, colour: '#ef4444', bg: 'rgba(239,68,68,0.15)',  people: 20 },
]

// Seeded by facility id so the same court always shows the same demo level
function seedLevel(id) {
  let h = 0
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return CROWD_LEVELS[h % CROWD_LEVELS.length]
}

function seedWeather(id) {
  let h = 0
  for (const c of String(id)) h = (h * 17 + c.charCodeAt(0)) & 0xffff
  const chance = h % 100
  let colour = '#38bdf8' // light blue
  if (chance > 50) colour = '#3b82f6' // blue
  if (chance > 80) colour = '#1d4ed8' // dark blue
  return { chance, colour }
}

// ─── Icon cache ──────────────────────────────────────────────────
const iconCache = {}

function getIcon(facility, showWeather, showCongestion) {
  const cacheKey = `${facility.id}-${showWeather}-${showCongestion}`
  if (iconCache[cacheKey]) return iconCache[cacheKey]
  const type = facility.type
  const colour = TYPE_COLOURS[type] || '#6366f1'
  const emoji = TYPE_ICONS[type] || '📍'
  
  const crowd = seedLevel(facility.id)
  const weather = seedWeather(facility.id)

  let size = 28
  let border = '2.5px solid white'
  let badge = ''

  if (showCongestion) {
    if (crowd.label === 'Busy') {
      size = 34
      border = '3px solid #f97316'
      badge = `<span style="position:absolute; top:-4px; right:-4px; background:#f97316; color:white; border-radius:50%; width:14px; height:14px; font-size:10px; font-weight:bold; display:flex; align-items:center; justify-content:center; border:1.5px solid white; z-index: 10;">!</span>`
    } else if (crowd.label === 'Full') {
      size = 38
      border = '3px solid #ef4444'
      badge = `<span style="position:absolute; top:-4px; right:-4px; background:#ef4444; color:white; border-radius:50%; width:16px; height:16px; font-size:11px; font-weight:bold; display:flex; align-items:center; justify-content:center; border:1.5px solid white; z-index: 10;">!</span>`
    }
  }

  const barWidth = 6 // 4px bar + 2px gap
  const wrapperWidth = size + (showWeather ? barWidth : 0)
  const iconAnchorX = (size / 2) + (showWeather ? barWidth : 0)
  const iconAnchorY = size / 2

  const html = `
    <div style="display: flex; align-items: flex-end; gap: 4px; position: relative;" title="Congestion: ${crowd.label} | Rain Chance: ${weather.chance}%">
      <!-- Bars -->
      ${showWeather ? `
      <div style="display: flex; gap: 2px; height: 26px; align-items: flex-end; margin-bottom: 2px;">
        <!-- Rain Chance Bar -->
        <div style="width: 4px; height: 100%; background: transparent; display: flex; align-items: flex-end;">
          <div style="width: 100%; height: ${Math.max(10, weather.chance)}%; background: #0ea5e9; border-radius: 2px;"></div>
        </div>
      </div>
      ` : ''}
      <!-- Original Icon -->
      <div style="position: relative;">
        <div class="facility-marker" style="
          width: ${size}px; height: ${size}px;
          background: ${colour};
          border: ${border};
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 3px 8px rgba(0,0,0,0.35);
          font-size: ${Math.max(14, size/2.2)}px;
          line-height: 1;
          transition: all 0.3s ease;
        ">${emoji}</div>
        ${badge}
      </div>
    </div>`
  
  const icon = L.divIcon({ html, className: '', iconSize: [wrapperWidth, size], iconAnchor: [iconAnchorX, iconAnchorY], popupAnchor: [- (showWeather ? barWidth : 0)/2, -size/2 - 2] })
  iconCache[cacheKey] = icon
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
  iconSize: [32, 40],
  iconAnchor: [16, 40],
  popupAnchor: [0, -42],
})

const PENDING_PIN_ICON = L.divIcon({
  html: `<div class="pending-pin-dot"></div>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -16],
})

// Community-submitted facility: same emoji but with a gold star badge
function getUserIcon(facility, showWeather, showCongestion) {
  const type = facility.type
  const colour = TYPE_COLOURS[type] || '#f59e0b'
  const emoji = TYPE_ICONS[type] || '📍'
  
  const crowd = seedLevel(facility.id)
  const weather = seedWeather(facility.id)

  let size = 28
  let border = '2.5px solid #fbbf24'
  let badge = `<span style="position:absolute; top:-4px; right:-4px; background:#fbbf24; color:#fff; border-radius:50%; width:12px; height:12px; font-size:8px; font-weight:700; display:flex; align-items:center; justify-content:center; border:1.5px solid white;">★</span>`

  if (showCongestion) {
    if (crowd.label === 'Busy') {
      size = 34
      border = '3px solid #f97316'
      badge = `<span style="position:absolute; top:-4px; right:-4px; background:#f97316; color:white; border-radius:50%; width:14px; height:14px; font-size:10px; font-weight:bold; display:flex; align-items:center; justify-content:center; border:1.5px solid white; z-index: 10;">!</span>`
    } else if (crowd.label === 'Full') {
      size = 38
      border = '3px solid #ef4444'
      badge = `<span style="position:absolute; top:-4px; right:-4px; background:#ef4444; color:white; border-radius:50%; width:16px; height:16px; font-size:11px; font-weight:bold; display:flex; align-items:center; justify-content:center; border:1.5px solid white; z-index: 10;">!</span>`
    }
  }

  const barWidth = 6 // 4px bar + 2px gap
  const wrapperWidth = size + (showWeather ? barWidth : 0)
  const iconAnchorX = (size / 2) + (showWeather ? barWidth : 0)
  const iconAnchorY = size / 2

  const html = `
    <div style="display: flex; align-items: flex-end; gap: 4px; position: relative;" title="Congestion: ${crowd.label} | Rain Chance: ${weather.chance}%">
      <!-- Bars -->
      ${showWeather ? `
      <div style="display: flex; gap: 2px; height: 26px; align-items: flex-end; margin-bottom: 2px;">
        <!-- Rain Chance Bar -->
        <div style="width: 4px; height: 100%; background: transparent; display: flex; align-items: flex-end;">
          <div style="width: 100%; height: ${Math.max(10, weather.chance)}%; background: #0ea5e9; border-radius: 2px;"></div>
        </div>
      </div>
      ` : ''}
      <!-- Original Icon -->
      <div style="position:relative; width:${size}px; height:${size}px;">
        <div style="
          width: ${size}px; height: ${size}px;
          background: ${colour};
          border: ${border};
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 3px 8px rgba(0,0,0,0.35);
          font-size: ${Math.max(14, size/2.2)}px;
          line-height: 1;
          transition: all 0.3s ease;
        ">${emoji}</div>
        ${badge}
      </div>
    </div>`
  return L.divIcon({ html, className: '', iconSize: [wrapperWidth, size], iconAnchor: [iconAnchorX, iconAnchorY], popupAnchor: [- (showWeather ? barWidth : 0)/2, -size/2 - 2] })
}

// ─── Transit label pill icon ─────────────────────────────────────
// Shows route codes like "NE", "963", "NE>CC", "963>234"
const transitLabelCache = {}
function getTransitLabelIcon(label, color) {
  const key = `${label}-${color}`
  if (transitLabelCache[key]) return transitLabelCache[key]
  const charW = 7.5
  const padX = 9
  const h = 24
  const w = Math.max(32, Math.ceil(label.length * charW + padX * 2))
  const rx = h / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${rx - 1}" fill="${color}" stroke="white" stroke-width="2"/>
    <text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="system-ui,sans-serif">${label}</text>
  </svg>`
  const icon = L.divIcon({
    html: svg,
    className: '',
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
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

    const from = leg.from
    const to = leg.to
    const prevLeg = legs[i - 1]
    const nextLeg = legs[i + 1]

    const color = getLegColor(leg.mode, leg.route)
    const routeCode = leg.route || leg.mode

    // Transfer = boards at same station the previous transit leg exited
    const isTransfer = prevLeg?.transitLeg && prevLeg?.to?.name === from?.name
    const prevCode = prevLeg?.route || prevLeg?.mode || ''

    // Boarding / Transfer marker
    if (from?.lat != null && from?.lon != null) {
      // iconLabel: "NE>CC" for transfer, "NE" / "963" for first board
      const iconLabel = isTransfer ? `${prevCode}>${routeCode}` : routeCode
      const popupLabel = isTransfer
        ? `Transfer: ${prevCode} → ${routeCode}`
        : `Board ${leg.mode === 'BUS' ? 'Bus ' + routeCode : routeCode + ' Line'}`
      stepMarkers.push({
        key: `board-${i}`,
        lat: from.lat,
        lon: from.lon,
        color,
        iconLabel,
        popupLabel,
        name: from.name,
      })
    }

    // Alighting marker — only at the last transit stop before a walk / destination
    if (to?.lat != null && to?.lon != null && !nextLeg?.transitLeg) {
      stepMarkers.push({
        key: `alight-${i}`,
        lat: to.lat,
        lon: to.lon,
        color,
        iconLabel: routeCode,
        popupLabel: `Alight here`,
        name: to.name,
      })
    }

    // Intermediate stops as small dots
    leg.intermediateStops?.forEach((stop, j) => {
      if (stop.lat != null && stop.lon != null) {
        stopMarkers.push({
          key: `stop-${i}-${j}`,
          lat: stop.lat,
          lon: stop.lon,
          color,
          name: stop.name,
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

// ── Helper: Fly to a selected facility ──────────────────────
function FlyToSelected({ selectedFacility, markerRefs }) {
  const map = useMap()

  useEffect(() => {
    if (!selectedFacility) return

    map.flyTo([selectedFacility.lat, selectedFacility.lng], 17, { duration: 1.2 })

    setTimeout(() => {
      const markerRef = markerRefs.current?.[selectedFacility.id]
      if (markerRef) markerRef.openPopup()
    }, 1300)
  }, [selectedFacility, map, markerRefs])

  return null
}



function PopupCrowdStatus({ facilityId }) {
  const level = seedLevel(facilityId)
  return (
    <div style={{
      margin: '8px 0 4px',
      padding: '8px 10px',
      borderRadius: '8px',
      background: level.bg,
      border: `1px solid ${level.colour}55`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: level.colour, letterSpacing: '0.04em' }}>
          {level.label.toUpperCase()}
        </span>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          👤 {level.people} nearby
        </span>
      </div>
      <div style={{ height: '5px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${level.pct}%`, borderRadius: '99px', background: level.colour }} />
      </div>
    </div>
  )
}

function FacilityPopupContent({ f, onNavigateTo, user, savedFacilityIds, onSaveToggle, onShowDetails }) {
  const isSaved = savedFacilityIds?.has(f.id)

  return (
    <div className="popup-content" style={{ minWidth: '190px' }}>
      <p className="popup-name">{f.name}</p>
      <p className="popup-type" style={{ color: TYPE_COLOURS[f.type] || '#6366f1' }}>
        {formatType(f.type)}
      </p>

      {/* Ratings - mock data */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: '4px 0 8px 0' }}>
        <span style={{ fontSize: '12px', color: '#fbbf24' }}>★★★★☆</span>
        <span style={{ fontSize: '11px', color: '#64748b' }}>4.2 (18)</span>
      </div>

      {/* Community spot tag */}
      {f.is_verified === false && (
        <p style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700, marginBottom: 4 }}>★ Community spot</p>
      )}

      {/* Short details */}
      {f.address && (
        <p className="popup-address" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {f.address}
        </p>
      )}

      {/* ── Crowd Status ── */}
      <PopupCrowdStatus facilityId={f.id} />

      {/* Action Buttons */}
      <div className="popup-actions" style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {onNavigateTo && (
          <button className="popup-nav-btn" onClick={() => onNavigateTo(f)} style={{ flex: 1, minWidth: '70px', padding: '6px', margin: 0 }}>
            🚌 Route
          </button>
        )}
        <button
          onClick={() => onShowDetails?.(f)}
          style={{ background: '#334155', border: 'none', color: '#f8fafc', padding: '6px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', flex: 1, minWidth: '70px', fontWeight: 600, fontFamily: 'inherit' }}
        >
          More Details
        </button>
        {user && onSaveToggle && (
          <button
            className={`popup-save-btn${isSaved ? ' saved' : ''}`}
            onClick={() => onSaveToggle(f)}
            title={isSaved ? 'Remove from saved' : 'Save place'}
            style={{ width: '32px', padding: '6px 0', margin: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {isSaved ? '❤️' : '🤍'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Zoom tracker — syncs Leaflet zoom to React state ───────────
function ZoomTracker({ onZoomChange }) {
  const map = useMap()
  useMapEvents({
    zoomend() { onZoomChange(map.getZoom()) },
  })
  // Sync initial zoom on mount
  useEffect(() => { onZoomChange(map.getZoom()) }, [map, onZoomChange])
  return null
}

// ─── Component ───────────────────────────────────────────────────
export default memo(function FacilityMap({ facilities = [], showWeatherBar = true, showCongestionVisuals = false, userLocation = null, routeInfo = null, onNavigateTo = null, user = null, savedFacilityIds = null, onSaveToggle = null, pinMode = false, pendingPin = null, onMapClick = null, selectedFacility = null, onShowDetails = null }) {
  const markerRefs = useRef({})
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM)
  const showMarkers = zoomLevel >= ICON_ZOOM_THRESHOLD

  function MapClickHandler({ pinMode, onMapClick }) {
    const map = useMap()
    useMapEvents({
      click(e) {
        if (pinMode && onMapClick) {
          onMapClick(e.latlng.lat, e.latlng.lng)
        }
      }
    })
    useEffect(() => {
      const container = map.getContainer()
      container.style.cursor = pinMode ? 'crosshair' : ''
      return () => { container.style.cursor = '' }
    }, [pinMode, map])
    return null
  }
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

      {/* Track zoom level to gate marker visibility */}
      <ZoomTracker onZoomChange={setZoomLevel} />

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

      {/* Fly to selected facility */}
      <FlyToSelected selectedFacility={selectedFacility} markerRefs={markerRefs} />

      {/* Facility markers — only shown when zoomed in enough */}
      {showMarkers && facilities.map((f) => (
        <Marker
          key={f.id}
          position={[f.lat, f.lng]}
          icon={f.is_verified === false ? getUserIcon(f, showWeatherBar, showCongestionVisuals) : getIcon(f, showWeatherBar, showCongestionVisuals)}
          ref={el => { if (el) markerRefs.current[f.id] = el }}
        >
          <Popup className="facility-popup">
            <FacilityPopupContent
              f={f}
              onNavigateTo={onNavigateTo}
              user={user}
              savedFacilityIds={savedFacilityIds}
              onSaveToggle={onSaveToggle}
              onShowDetails={onShowDetails}
            />
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
              color: getLegColor(leg.mode, leg.route),
              weight: 6,
              opacity: 0.9,
              lineCap: 'round',
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
            color: 'white',
            fillColor: m.color,
            fillOpacity: 0.9,
            weight: 1.5,
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

      <MapClickHandler pinMode={pinMode} onMapClick={onMapClick} />

      {pendingPin && (
        <Marker position={[pendingPin.lat, pendingPin.lng]} icon={PENDING_PIN_ICON}>
          <Popup><span style={{ fontSize: '13px', fontWeight: 700 }}>📍 New spot here</span></Popup>
        </Marker>
      )}
    </MapContainer>
  )
})
