import { createServer } from 'node:http'
import { readConfig, REASON_TEXT } from './config.ts'
import { createAi3dHandler } from './handler.ts'
import { nodeMiddleware } from './node.ts'

/**
 * The AI endpoint as a small server of its own, for a deployment where the site is static:
 *
 *   MESHY_API_KEY=… AI3D_ALLOWED_ORIGINS=https://your.site node server/ai3d/standalone.ts
 *
 * and build the site with VITE_AI3D_ENDPOINT=https://that-server/api/ai3d. It listens on PORT (8787)
 * and answers only under /api/ai3d. Put it behind HTTPS.
 */
const config = readConfig(process.env)
const middleware = nodeMiddleware(createAi3dHandler(config), '/api/ai3d', config.trustProxy)
const port = Number(process.env.PORT ?? 8787)
createServer((req, res) => void middleware(req, res)).listen(port, () => {
  const engine = config.provider ? `engine ${config.provider.name}${config.provider.simulated ? ' (a stand-in, not an AI model)' : ''}` : `not configured (${config.reason ? REASON_TEXT[config.reason] : 'unknown'})`
  console.log(`AI endpoint on :${port}/api/ai3d — ${engine}; prompt writer ${config.writer ? config.writer.name : 'off'}; storage ${config.storageDir ?? 'memory'}`)
})
