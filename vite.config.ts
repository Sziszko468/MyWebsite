import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * The administration is a second page of the same build (`admin.html`, its own bundle) served by the backend at `/admin` and
 * below. While developing, Vite must hand it every address under `/admin` (the application routes them itself) instead of the
 * website's page, in the dev server and in `vite preview`.
 */
function adminEntry(): Plugin {
  const rewrite = (url: string | undefined): string | undefined => (url && /^\/admin(\/|\?|$)/.test(url) ? '/admin.html' : url)
  return {
    name: 'admin-entry',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        request.url = rewrite(request.url)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        request.url = rewrite(request.url)
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), adminEntry()],
  server: {
    // The administration calls the backend on its own origin (a session cookie that never leaves it); in development the
    // dev server stands in for that origin and passes `/api` on to the backend (`npm run server:start`).
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8787' } },
  },
  build: {
    // The hero scene (Three.js) is its own lazily loaded chunk and is large by nature; the main
    // bundle stays well below this.
    chunkSizeWarningLimit: 1000,
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), admin: resolve(import.meta.dirname, 'admin.html') } },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'worker/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Tests read tokens.css as text (?raw); by default Vitest blanks every non-module CSS file.
    css: { include: [/tokens\.css/] },
  },
})
