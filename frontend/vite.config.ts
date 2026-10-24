import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const backend = loadEnv(mode, '.', 'BLUFF_').BLUFF_BACKEND_URL || 'http://127.0.0.1:8080'
  return {
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Tailscale Serve terminates HTTPS on the tailnet and proxies to this
    // loopback-only server. Keep the allowlist explicit to avoid DNS rebinding.
    allowedHosts: ['.ts.net'],
    proxy: {
      '/api': {
        target: backend,
        headers: { 'X-Bluff-Proxied': 'true' },
      },
      '/ws': { target: backend.replace(/^http/, 'ws'), ws: true },
    },
  },
  }
})
