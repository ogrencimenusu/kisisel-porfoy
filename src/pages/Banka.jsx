import React from 'react'

const Banka = ({ onBack }) => {
  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center">
          <button className="btn btn-link p-0 me-3" onClick={onBack} aria-label="Geri dön">
            <i className="bi bi-chevron-left" style={{ fontSize: '1.5rem' }}></i>
          </button>
          <h4 className="display-6 mb-0">
            <i className="bi bi-bank me-3"></i>Banka Hesap Hareketi
          </h4>
        </div>
      </div>
    </div>
  )
}

export default Banka


