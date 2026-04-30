// StrictMode removed — it double-invokes every render/effect in dev,
// which makes interactions feel ~1s slow. Add it back for production audits only.
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)
