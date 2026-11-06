import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/wdth.css'
import './styles/tokens.css'
import './styles/motion.css'
import './styles/global.scss'
import App from './App'
import { setupAnalytics } from './analytics/setup'
import { startLiveCatalog } from './content/liveCatalog'

// Measurement is off unless the owner configured a destination (VITE_ANALYTICS_ENDPOINT); see src/analytics/.
setupAnalytics()
// What the owner edited in the administration (prices, texts, the FAQ) is read from the backend at once, without a new build.
void startLiveCatalog()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
