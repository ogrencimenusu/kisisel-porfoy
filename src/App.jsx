import { useEffect, useMemo, useState } from 'react'
import BottomNav from './components/BottomNav'
import Anasayfa from './pages/Anasayfa'
import Analtik from './pages/Analtik'
import Kartlar from './pages/Kartlar'
import Ayarlar from './pages/Ayarlar'
import Ekle from './pages/Ekle'
import Portfoy from './pages/Portfoy'
import Banka from './pages/Banka'
import Semboller from './pages/Semboller'

function App() {
  const [activeTab, setActiveTab] = useState('anasayfa')

  // Apply theme globally based on saved preference or system
  const [themePreference, setThemePreference] = useState(() => {
    try {
      return localStorage.getItem('themePreference') || 'system'
    } catch (e) {
      return 'system'
    }
  })

  const effectiveTheme = useMemo(() => {
    if (themePreference === 'system') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      return prefersDark ? 'dark' : 'light'
    }
    return themePreference
  }, [themePreference])

  useEffect(() => {
    const themeToSet = effectiveTheme === 'dark' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-bs-theme', themeToSet)
    // Keep browser status bar (theme-color) in sync with app theme
    const DARK_COLOR = '#212529' // Bootstrap dark body bg
    const LIGHT_COLOR = '#ffffff'

    // If user explicitly chooses a theme, override system meta using a dynamic tag.
    // Otherwise, remove dynamic tag to let media-query meta tags take effect.
    const ensureDynamicMeta = () => {
      let meta = document.querySelector('meta[name="theme-color"][data-dynamic="true"]')
      if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute('name', 'theme-color')
        meta.setAttribute('data-dynamic', 'true')
        document.head.appendChild(meta)
      }
      return meta
    }

    if (themePreference !== 'system') {
      const meta = ensureDynamicMeta()
      meta.setAttribute('content', themeToSet === 'dark' ? DARK_COLOR : LIGHT_COLOR)
    } else {
      const meta = document.querySelector('meta[name="theme-color"][data-dynamic="true"]')
      if (meta) document.head.removeChild(meta)
    }
  }, [effectiveTheme])

  useEffect(() => {
    const handler = () => {
      try {
        const pref = localStorage.getItem('themePreference') || 'system'
        setThemePreference(pref)
      } catch (e) {
        setThemePreference('system')
      }
    }

    // Listen to storage changes (in case settings page updates it)
    window.addEventListener('storage', handler)

    // If using system, update on system change
    let mql
    if (themePreference === 'system' && window.matchMedia) {
      mql = window.matchMedia('(prefers-color-scheme: dark)')
      try { mql.addEventListener('change', handler) } catch (_) { mql.addListener(handler) }
    }

    return () => {
      window.removeEventListener('storage', handler)
      if (mql) {
        try { mql.removeEventListener('change', handler) } catch (_) { mql.removeListener(handler) }
      }
    }
  }, [themePreference])

  const renderPage = () => {
    switch (activeTab) {
      case 'anasayfa':
        return <Anasayfa />
      case 'analtik':
        return <Analtik />
      case 'portfoy':
        return <Portfoy />
      case 'ayarlar':
        return <Ayarlar />
      case 'add':
        return <Ekle onNavigate={(dest) => setActiveTab(dest)} />
      case 'kartlar':
        return <Kartlar onBack={() => setActiveTab('add')} />
      case 'banka':
        return <Banka onBack={() => setActiveTab('add')} />
      case 'semboller':
        return <Semboller onBack={() => setActiveTab('add')} />
      default:
        return <Anasayfa />
    }
  }

  return (
    <div className="vh-100 d-flex flex-column">
      <main className="flex-grow-1 pb-5">
        {renderPage()}
      </main>
      
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  )
}

export default App
