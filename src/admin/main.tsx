import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/wdth.css'
import '../styles/tokens.css'
import '../styles/motion.css'
import '../styles/global.scss'
import './styles/admin.css'
import { applyTheme, readStoredTheme, resolveTheme, systemPrefersLight } from '../theme/theme'
import { AdminApp } from './AdminApp'

// The theme is set before anything is drawn, so a light-theme administrator never sees a dark flash (the page has no inline script to do it).
applyTheme(resolveTheme(readStoredTheme(), systemPrefersLight()))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
)
