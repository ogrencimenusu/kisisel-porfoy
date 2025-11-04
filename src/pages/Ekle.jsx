import React from 'react'

const Ekle = ({ onNavigate }) => {
  const items = [
    { id: 'portfoy', title: 'Portföy', icon: 'graph-up' },
    { id: 'kartlar', title: 'Kartlar', icon: 'credit-card' },
    { id: 'banka', title: 'Banka hesap hareketi', icon: 'bank' },
    { id: 'semboller', title: 'Semboller', icon: 'tag' },
    { id: 'hisseHesapHareketleri', title: 'Hisse hesap hareketleri', icon: 'list-check' }
  ]

  const renderStatus = () => (
    <span className="badge rounded-pill border border-success-subtle text-success-emphasis bg-success-subtle px-3 py-2 d-flex align-items-center gap-2">
      <i className="bi bi-arrow-right"></i>
      Ekle
    </span>
  )

  return (
    <div className="container  py-4">
      <div className="d-flex flex-column gap-3 ">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate && onNavigate(item.id)}
            className="w-100 text-start border-0 bg-transparent"
          >
            <div className="card shadow-sm border-0">
              <div className="card-body d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center gap-3">
                  <div className="rounded-3 d-flex align-items-center justify-content-center" style={{ width: '48px', height: '48px', background: 'var(--bs-tertiary-bg)' }}>
                    <i className={`bi bi-${item.icon}`} style={{ fontSize: '1.5rem' }}></i>
                  </div>
                  <div className="d-flex flex-column">
                    <span className="fw-semibold">{item.title}</span>
                    <small className="text-body-secondary">—</small>
                  </div>
                </div>
                {renderStatus()}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default Ekle


