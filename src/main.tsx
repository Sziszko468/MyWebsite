import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/wdth.css'
import './styles/tokens.css'
import './styles/motion.css'
import './styles/global.scss'
import App from './App'
import { setupAnalytics } from './analytics/setup'

// Measurement is off unless the owner configured a destination (VITE_ANALYTICS_ENDPOINT); see src/analytics/.
setupAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
