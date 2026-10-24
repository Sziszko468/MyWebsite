import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Tests read tokens.css as text (?raw); by default Vitest blanks every non-module CSS file.
    css: { include: [/tokens\.css/] },
  },
})
