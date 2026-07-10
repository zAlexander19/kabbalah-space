import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import LegalPage from './legal/LegalPage.tsx'
import { AuthProvider, LoginModal } from './auth'

// Ruteo mínimo por pathname (el sitio es una SPA con catchall a index.html).
// Las páginas legales van standalone: son públicas y no necesitan auth ni el
// shell de la app (Google las lee para la verificación OAuth).
const path = window.location.pathname.replace(/\/+$/, '') || '/'
const root = createRoot(document.getElementById('root')!)

if (path === '/privacidad') {
  root.render(<StrictMode><LegalPage doc="privacy" /></StrictMode>)
} else if (path === '/terminos') {
  root.render(<StrictMode><LegalPage doc="terms" /></StrictMode>)
} else {
  root.render(
    <StrictMode>
      <AuthProvider>
        <App />
        <LoginModal />
      </AuthProvider>
    </StrictMode>,
  )
}
