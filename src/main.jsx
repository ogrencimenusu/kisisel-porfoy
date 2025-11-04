import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './index.css'
import App from './App.jsx'
import appLogo from './assets/logo.png'

// Ensure favicon and apple-touch-icon use bundled logo (works in dev and build)
const ensureIcon = (rel, sizes) => {
  let link = document.querySelector(`link[rel="${rel}"]${sizes ? `[sizes="${sizes}"]` : ''}`)
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', rel)
    if (sizes) link.setAttribute('sizes', sizes)
    document.head.appendChild(link)
  }
  link.setAttribute('href', appLogo)
}

ensureIcon('icon')
ensureIcon('apple-touch-icon', '180x180')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
