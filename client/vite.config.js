import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward /auth/* and /status to the Express server
      '/auth':   { target: 'http://localhost:3000', changeOrigin: true },
      '/billing': { target: 'http://localhost:3000', changeOrigin: true },
      '/status': { target: 'http://localhost:3000', changeOrigin: true },
      // Tunnel replay: forward arbitrary subdomain requests
      '/tunnel-replay': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
