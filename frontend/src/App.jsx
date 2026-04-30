// src/App.jsx
// Sets up React Router — each URL path maps to a page component.
// Right now we only have MapView. More pages get added here later.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MapView from './pages/MapView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default route → redirect to /map */}
        <Route path="/" element={<Navigate to="/map" replace />} />
        <Route path="/map" element={<MapView />} />
      </Routes>
    </BrowserRouter>
  )
}
