import React, { useEffect, useMemo, useState } from 'react';
import LoadingStocks from '../components/LoadingStocks'
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const Ayarlar = () => {
  const [themePreference, setThemePreference] = useState(() => {
    try {
      return localStorage.getItem('themePreference') || 'system'; // 'light' | 'dark' | 'system'
    } catch (e) {
      return 'system';
    }
  });

  // Compute effective theme based on preference and system
  const effectiveTheme = useMemo(() => {
    if (themePreference === 'system') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    }
    return themePreference;
  }, [themePreference]);

  useEffect(() => {
    const themeToSet = effectiveTheme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', themeToSet);
    try {
      localStorage.setItem('themePreference', themePreference);
    } catch (e) {
      // ignore
    }
  }, [effectiveTheme, themePreference]);

  // Listen to system theme changes if using system preference
  useEffect(() => {
    if (themePreference !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const themeToSet = mql.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-bs-theme', themeToSet);
    };
    try { mql.addEventListener('change', handler); } catch (_) { mql.addListener(handler); }
    return () => {
      try { mql.removeEventListener('change', handler); } catch (_) { mql.removeListener(handler); }
    };
  }, [themePreference]);

  const handleThemeSelect = (value) => {
    setThemePreference(value);
  };

  // Global Google Sheet URL
  const [sheetUrl, setSheetUrl] = useState(() => {
    try {
      return localStorage.getItem('globalSheetUrl') || '';
    } catch (e) {
      return '';
    }
  });

  // Load from Firestore on mount (fallback to localStorage)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ref = doc(db, 'config', 'global');
        const snap = await getDoc(ref);
        if (!cancelled && snap.exists()) {
          const data = snap.data() || {};
          const url = (data.globalSheetUrl || '').toString();
          const savedTheme = (data.themePreference || '').toString();
          if (url) {
            setSheetUrl(url);
            try { localStorage.setItem('globalSheetUrl', url); } catch (_) {}
          }
          if (savedTheme) {
            setThemePreference(savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system' ? savedTheme : 'system');
            try { localStorage.setItem('themePreference', savedTheme); } catch (_) {}
          }
        }
      } catch (e) {
        // ignore; stay with localStorage value
      }
    })();
    return () => { cancelled = true };
  }, []);

  // Helper to persist any settings to Firestore and mirror to localStorage
  const saveConfig = async (partial) => {
    try {
      const ref = doc(db, 'config', 'global');
      await setDoc(ref, { ...partial, updatedAt: new Date() }, { merge: true });
    } catch (e) {
      // best-effort; UI can alert where appropriate
    }
    // Mirror to localStorage as fallback
    try {
      Object.entries(partial).forEach(([k, v]) => {
        if (k === 'globalSheetUrl') localStorage.setItem('globalSheetUrl', (v || '').toString());
        if (k === 'themePreference') localStorage.setItem('themePreference', (v || '').toString());
      });
    } catch (_) {}
  };

  const saveSheetUrl = async () => {
    const url = sheetUrl.trim();
    try { localStorage.setItem('globalSheetUrl', url); } catch (e) {}
    try {
      await saveConfig({ globalSheetUrl: url });
      try { window.alert('Sheet URL kaydedildi.'); } catch {}
    } catch (e) {
      try { window.alert('Sheet URL kaydedilirken bir hata oluştu. İnternet bağlantınızı kontrol edin.'); } catch {}
    }
  };

  // Persist themePreference whenever it changes
  useEffect(() => {
    (async () => {
      await saveConfig({ themePreference });
    })();
  }, [themePreference]);

  const clearCacheAndReload = async () => {
    // Attempt to clear service worker caches, caches API, localStorage and sessionStorage
    try {
      // Preserve globalSheetUrl
      let preservedSheetUrl = '';
      try { preservedSheetUrl = localStorage.getItem('globalSheetUrl') || ''; } catch (_) {}
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      try {
        localStorage.clear();
        if (preservedSheetUrl) {
          localStorage.setItem('globalSheetUrl', preservedSheetUrl);
        }
      } catch (e) { /* ignore */ }
      try { sessionStorage.clear(); } catch (e) { /* ignore */ }

      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (err) {
      console.error('Önbellek temizlenirken hata:', err);
    }

    // Reload the page to ensure a fresh state
    window.location.reload();
  };

  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false)

  return (
    <div className="container-fluid h-100 d-flex align-items-center justify-content-center">
      <div className="text-center" style={{ width: '100%', maxWidth: 900 }}>
        <h1 className="display-4 mb-3">
          <i className="bi bi-gear me-3"></i>Ayarlar
        </h1>
        <p className="lead text-muted">Uygulama ayarları</p>

        <div className="card mt-4 p-3" style={{ margin: '0 auto' }}>
          <div className="mb-3">
            <h6 className="mb-2">Tema</h6>
            <div className="segmented-control">
              <button
                type="button"
                className={effectiveTheme === 'light' ? 'active' : ''}
                onClick={() => handleThemeSelect('light')}
                disabled={themePreference === 'system'}
              >
                Beyaz
              </button>
              <button
                type="button"
                className={effectiveTheme === 'dark' ? 'active' : ''}
                onClick={() => handleThemeSelect('dark')}
                disabled={themePreference === 'system'}
              >
                Siyah
              </button>
            </div>
            {themePreference === 'system' && (
              <div className="mt-2"><small className="text-muted">Sistem teması etkin: {effectiveTheme === 'dark' ? 'Siyah' : 'Beyaz'}</small></div>
            )}
          </div>

          <div className="mb-3">
            <div className="d-flex align-items-center justify-content-between">
              <label className="mb-0" htmlFor="systemTheme">Cihazın varsayılan temasını kullan</label>
              <input
                className="ios-switch"
                type="checkbox"
                id="systemTheme"
                checked={themePreference === 'system'}
                onChange={(e) => handleThemeSelect(e.target.checked ? 'system' : 'light')}
              />
            </div>
            <small className="text-muted">Etkinleştirildiğinde sistem temasına (Ayarlar → Ekran ve Parlaklık) uyum sağlar.</small>
          </div>

          <hr />

          <div className="mb-3">
            <h6 className="mb-2">Google Sheet Veri Kaynağı</h6>
            <label className="form-label">Sheet URL</label>
            <input
              type="url"
              className="form-control"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/ID/export?format=csv"
            />
            <div className="form-text">
              A sütununda sembol adı, B sütununda fiyat olacak şekilde düzenleyin. Link CSV paylaşımı olabilir ya da normal paylaşım; otomatik CSV'ye çevirmeye çalışırız.
            </div>
            <div className="d-grid mt-2 gap-2">
              <button className="btn btn-primary" onClick={saveSheetUrl}>Kaydet</button>
              <button
                type="button"
                className="btn btn-success d-flex align-items-center justify-content-center gap-2"
                onClick={() => setShowLoadingOverlay(true)}
              >
                <i className="bi bi-arrow-clockwise"></i>
                Fiyatı Güncelle
              </button>
            </div>
          </div>

          <div className="d-grid">
            <button className="btn btn-outline-danger" onClick={clearCacheAndReload}>
              Önbelleği Temizle ve Yenile
            </button>
          </div>
        </div>
      </div>
      {showLoadingOverlay && (
        <LoadingStocks onComplete={() => setShowLoadingOverlay(false)} />
      )}
    </div>
  );
};

export default Ayarlar;
