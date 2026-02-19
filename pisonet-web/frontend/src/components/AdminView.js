import React, { useState, useEffect } from 'react';
import './AdminView.css';

function AdminView({ units, totalRevenue, onControl, onAddTime }) {
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [sortBy, setSortBy] = useState('id');
  const [statsView, setStatsView] = useState('overview');
  const [customAddTime, setCustomAddTime] = useState('');

  const formatTime = (seconds) => {
    if (seconds <= 0) return '0:00:00';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getSortedUnits = () => {
    const sorted = [...units];
    switch (sortBy) {
      case 'time':
        return sorted.sort((a, b) => b.remaining_seconds - a.remaining_seconds);
      case 'revenue':
        return sorted.sort((a, b) => b.total_revenue - a.total_revenue);
      case 'status':
        return sorted.sort((a, b) => a.status.localeCompare(b.status));
      default:
        return sorted.sort((a, b) => a.id - b.id);
    }
  };

  const getUnitStats = () => {
    const total = units.length;
    const active = units.filter(u => u.status === 'Active').length;
    const idle = units.filter(u => u.status === 'Idle').length;
    const totalTime = units.reduce((sum, u) => sum + u.remaining_seconds, 0);
    const avgRevenue = units.length > 0 ? totalRevenue / total : 0;

    return { total, active, idle, totalTime, avgRevenue };
  };

  const handleAddTime = async (unit, amount) => {
    if (amount > 0 && onAddTime) {
      await onAddTime(unit.id, amount);
      setSelectedUnit(null);
      setCustomAddTime('');
    }
  };

  const stats = getUnitStats();
  const sortedUnits = getSortedUnits();

  return (
    <div className="admin-view">
      <div className="admin-header">
        <h1>📊 Admin Dashboard</h1>
        <p className="timestamp">{new Date().toLocaleString()}</p>
      </div>

      {/* Stats Overview */}
      <div className="stats-container">
        <div className="stat-card stat-total">
          <div className="stat-icon">🖥️</div>
          <div className="stat-content">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total PCs</div>
          </div>
        </div>
        <div className="stat-card stat-active">
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <div className="stat-value">{stats.active}</div>
            <div className="stat-label">Active Now</div>
          </div>
        </div>
        <div className="stat-card stat-idle">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-value">{stats.idle}</div>
            <div className="stat-label">Available</div>
          </div>
        </div>
        <div className="stat-card stat-revenue">
          <div className="stat-icon">💵</div>
          <div className="stat-content">
            <div className="stat-value">₱{totalRevenue.toFixed(2)}</div>
            <div className="stat-label">Total Revenue</div>
          </div>
        </div>
        <div className="stat-card stat-time">
          <div className="stat-icon">⏱️</div>
          <div className="stat-content">
            <div className="stat-value">{formatTime(stats.totalTime)}</div>
            <div className="stat-label">Total Time</div>
          </div>
        </div>
        <div className="stat-card stat-avg">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <div className="stat-value">₱{stats.avgRevenue.toFixed(2)}</div>
            <div className="stat-label">Avg/PC</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="admin-controls">
        <div className="control-group">
          <label>Sort By:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="id">PC Number</option>
            <option value="time">Remaining Time</option>
            <option value="revenue">Revenue</option>
            <option value="status">Status</option>
          </select>
        </div>

        <div className="control-group">
          <label>View:</label>
          <select value={statsView} onChange={(e) => setStatsView(e.target.value)}>
            <option value="overview">Overview</option>
            <option value="detailed">Detailed Report</option>
          </select>
        </div>
      </div>

      {/* Units Grid */}
      <div className="units-grid">
        {sortedUnits.map((unit) => (
          <div 
            key={unit.id} 
            className={`unit-card ${unit.status.toLowerCase()} ${selectedUnit?.id === unit.id ? 'selected' : ''}`}
            onClick={() => setSelectedUnit(selectedUnit?.id === unit.id ? null : unit)}
          >
            <div className="unit-header">
              <h3>{unit.name}</h3>
              <span className={`status-badge status-${unit.status.toLowerCase()}`}>
                {unit.status === 'Idle' ? '✅' : unit.status === 'Active' ? '⏳' : '🔴'} {unit.status}
              </span>
            </div>
            
            <div className="unit-timer">
              <div className="timer-display">
                {formatTime(unit.remaining_seconds)}
              </div>
              <div className="timer-subtext">
                {unit.remaining_seconds > 0 ? 'Time remaining' : 'No active session'}
              </div>
            </div>

            <div className="unit-info">
              <div className="revenue-badge">
                💵 ₱{unit.total_revenue.toFixed(2)}
              </div>
              {unit.active_sessions > 0 && (
                <div className="sessions-badge">
                  {unit.active_sessions} active session(s)
                </div>
              )}
            </div>

            {selectedUnit?.id === unit.id && (
              <div className="unit-expanded-controls">
                <div className="control-buttons">
                  <button 
                    className="btn-control btn-on"
                    onClick={(e) => {
                      e.stopPropagation();
                      onControl(unit.id, 'on');
                    }}
                    title="Power On"
                  >
                    ⏻️ Power On
                  </button>
                  <button 
                    className="btn-control btn-off"
                    onClick={(e) => {
                      e.stopPropagation();
                      onControl(unit.id, 'off');
                    }}
                    title="Power Off"
                  >
                    ⏼️ Power Off
                  </button>
                  <button 
                    className="btn-control btn-restart"
                    onClick={(e) => {
                      e.stopPropagation();
                      onControl(unit.id, 'restart');
                    }}
                    title="Restart"
                  >
                    🔄 Restart
                  </button>
                  <button 
                    className="btn-control btn-shutdown"
                    onClick={(e) => {
                      e.stopPropagation();
                      onControl(unit.id, 'shutdown');
                    }}
                    title="Shutdown"
                  >
                    🛑 Shutdown
                  </button>
                  <button 
                    className="btn-control btn-lock"
                    onClick={(e) => {
                      e.stopPropagation();
                      onControl(unit.id, 'lock');
                    }}
                    title="Lock Screen"
                  >
                    🔒 Lock
                  </button>
                </div>

                <div className="add-time-section">
                  <h4>Add Time:</h4>
                  <div className="quick-add-buttons">
                    <button 
                      className="quick-add-btn"
                      onClick={() => handleAddTime(unit, 5)}
                    >
                      +₱5
                    </button>
                    <button 
                      className="quick-add-btn"
                      onClick={() => handleAddTime(unit, 10)}
                    >
                      +₱10
                    </button>
                    <button 
                      className="quick-add-btn"
                      onClick={() => handleAddTime(unit, 20)}
                    >
                      +₱20
                    </button>
                  </div>
                  <div className="custom-add-time">
                    <input 
                      type="number" 
                      min="1"
                      placeholder="₱"
                      value={customAddTime}
                      onChange={(e) => setCustomAddTime(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button 
                      className="btn-custom-add"
                      onClick={() => handleAddTime(unit, parseFloat(customAddTime))}
                      disabled={!customAddTime}
                    >
                      Add ₱
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdminView;
