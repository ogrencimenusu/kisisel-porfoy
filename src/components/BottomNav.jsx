import React from 'react';

const BottomNav = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'anasayfa', label: 'Anasayfa', icon: 'house' },
    { id: 'analtik', label: 'Analtik', icon: 'bar-chart' },
    { id: 'add', label: '+', icon: 'plus', isAdd: true },
    { id: 'kartlar', label: 'Kartlar', icon: 'credit-card' },
    { id: 'ayarlar', label: 'Ayarlar', icon: 'gear' }
  ];

  return (
    <nav className="navbar fixed-bottom shadow-sm" style={{ height: '70px' }}>
      <div className="container-fluid px-2 h-100 pb-4 pt-3">
        <div 
          className="w-100 h-100 d-flex justify-content-around align-items-center"
          style={{ flexDirection: 'row' }}
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`btn btn-link text-decoration-none d-flex flex-column align-items-center justify-content-center ${
                activeTab === item.id ? 'text-primary' : 'text-muted'
              }`}
              onClick={() => setActiveTab(item.id)}
              style={{
                flex: '1',
                height: '100%',
                border: 'none',
                background: 'transparent',
                padding: '8px 4px'
              }}
            >
              {item.isAdd ? (
                <div 
                  className="d-flex align-items-center justify-content-center rounded-3"
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    width: '40px',
                    height: '40px',
                    boxShadow: '0 4px 15px rgba(23, 58, 215, 0.4)'
                  }}
                >
                  <i className="bi bi-plus text-white " style={{ fontSize: '2rem' }}></i>
                </div>
              ) : (
                <>
                  <i className={`bi bi-${item.icon} mb-1`} style={{ fontSize: '1.4rem' }}></i>
                  <small className="fw-medium" style={{ fontSize: '0.8rem' }}>{item.label}</small>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
