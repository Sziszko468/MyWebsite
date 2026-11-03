import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
