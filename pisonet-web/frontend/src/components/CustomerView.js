import React, { useState, useEffect } from 'react';
import './CustomerView.css';

function CustomerView({ units, selectedUnitId, onSelectUnit }) {
  const [filteredUnits, setFilteredUnits] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    if (filterStatus === 'all') {
      setFilteredUnits(units);
    } else if (filterStatus === 'available') {
      setFilteredUnits(units.filter(u => u.status === 'Idle'));
    } else if (filterStatus === 'active') {
      setFilteredUnits(units.filter(u => u.status === 'Active'));
    }
  }, [units, filterStatus]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Idle':
        return '✅';
      case 'Active':
        return '⏳';
      case 'Offline':
        return '🔴';
      default:
        return '❓';
    }
  };

  const formatTime = (seconds) => {
    if (seconds <= 0) return 'No time';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    } else if (mins > 0) {
      return `${mins}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  return (
    <div className="customer-view">
      <div className="customer-header">
        <h1>🖥️ PC Selection</h1>
        <p className="subtitle">Select an available PC to start surfing</p>
      </div>

      <div className="filter-section">
        <button 
          className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
          onClick={() => setFilterStatus('all')}
        >
          All PCs ({units.length})
        </button>
        <button 
          className={`filter-btn ${filterStatus === 'available' ? 'active' : ''}`}
          onClick={() => setFilterStatus('available')}
        >
          Available ({units.filter(u => u.status === 'Idle').length})
        </button>
        <button 
          className={`filter-btn ${filterStatus === 'active' ? 'active' : ''}`}
          onClick={() => setFilterStatus('active')}
        >
          In Use ({units.filter(u => u.status === 'Active').length})
        </button>
      </div>

      <div className="pc-selection-grid">
        {filteredUnits.length > 0 ? (
          filteredUnits.map((unit) => (
            <div
              key={unit.id}
              className={`pc-card ${selectedUnitId === unit.id ? 'selected' : ''} ${unit.status.toLowerCase()}`}
              onClick={() => onSelectUnit(unit.id)}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => e.key === 'Enter' && onSelectUnit(unit.id)}
            >
              <div className="pc-status-indicator">{getStatusIcon(unit.status)}</div>
              <div className="pc-name">{unit.name}</div>
              <div className="pc-details">
                <span className="pc-status-text">{unit.status}</span>
              </div>
              {unit.remaining_seconds > 0 && (
                <div className="pc-time-remaining">
                  Time: <strong>{formatTime(unit.remaining_seconds)}</strong>
                </div>
              )}
              {selectedUnitId === unit.id && (
                <div className="pc-selected-badge">Selected ✓</div>
              )}
            </div>
          ))
        ) : (
          <div className="no-units">
            <p>No {filterStatus === 'available' ? 'available' : filterStatus === 'active' ? 'active' : ''} PCs found</p>
          </div>
        )}
      </div>

      <div className="legend">
        <p><strong>Legend:</strong> ✅ Available · ⏳ In Use · 🔴 Offline</p>
      </div>
    </div>
  );
}

export default CustomerView;
