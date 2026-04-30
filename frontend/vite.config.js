import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),   // Tailwind v4 — no config file needed
  ],
  server: {
    port: 5173,
    proxy: {
      // Forward /api requests to Flask backend (port 5000)
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  }
})
