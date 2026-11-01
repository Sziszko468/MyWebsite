import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin, type ViteDevServer } from 'vite'
import { defineConfig } from 'vitest/config'
import { readConfig, REASON_TEXT } from './server/ai3d/config.ts'
import { createAi3dHandler } from './server/ai3d/handler.ts'
import { nodeMiddleware } from './server/ai3d/node.ts'

/**
 * Serves the AI endpoint (/api/ai3d) next to the dev and preview servers, so `npm run dev` has the
 * whole path to try. The credentials come from the environment (.env.local: MESHY_API_KEY …); none of
 * the names starts with VITE_, so none of them reaches the browser bundle. The built site is static
 * and has no such endpoint: AI creation is then run by `server/ai3d/standalone.ts` somewhere else.
 */
function ai3dEndpoint(): Plugin {
  let env: Record<string, string | undefined> = {}
  const mount = (server: Pick<ViteDevServer, 'middlewares' | 'httpServer'>) => {
    const config = readConfig({ ...process.env, ...env })
    if (config.reason) console.info(`[ai3d] ${REASON_TEXT[config.reason]}`)
    const middleware = nodeMiddleware(createAi3dHandler(config), '/api/ai3d', config.trustProxy)
    server.middlewares.use((req, res, next) => void middleware(req, res, next))
    // The background ticker ends with the server it belongs to (a restart makes a new handler).
    server.httpServer?.once('close', middleware.stop)
  }
  return {
    name: 'ai3d-endpoint',
    configResolved(resolved) {
      env = loadEnv(resolved.mode, resolved.envDir || process.cwd(), '')
    },
    configureServer(server) {
      mount(server)
    },
    configurePreviewServer(server) {
      mount(server)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ai3dEndpoint()],
  build: {
    // The hero scene (Three.js) is its own lazily loaded chunk and is large by nature; the main
    // bundle stays well below this.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    // Tests read tokens.css as text (?raw); by default Vitest blanks every non-module CSS file.
    css: { include: [/tokens\.css/] },
  },
})
