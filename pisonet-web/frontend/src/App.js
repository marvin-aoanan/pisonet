import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';
import CustomerView from './components/CustomerView';
import AdminView from './components/AdminView';
import CoinDialog from './components/CoinDialog';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5000';
const REFRESH_INTERVAL = 5000; // Refresh every 5 seconds
const RECONNECT_INTERVAL = 3000; // Try to reconnect every 3 seconds

function App() {
  // State
  const [units, setUnits] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [showCoinDialog, setShowCoinDialog] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [wsConnected, setWsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [viewMode, setViewMode] = useState('customer'); // customer or admin
  const [ws, setWs] = useState(null);

  // Fetch units
  const fetchUnits = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/units`);
      setUnits(response.data);
      setError(null);
    } catch (error) {
      console.error('Error fetching units:', error);
      setError('Failed to load units');
      setStatusMessage('❌ Error loading units');
    }
  }, []);

  // Fetch total revenue
  const fetchTotalRevenue = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/transactions/revenue/total`);
      setTotalRevenue(response.data.total_revenue);
    } catch (error) {
      console.error('Error fetching revenue:', error);
    }
  }, []);

  // Fetch system stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      await Promise.all([fetchUnits(), fetchTotalRevenue(), fetchStats()]);
      setIsLoading(false);
      setStatusMessage('✅ System Ready');
    };

    loadInitialData();
  }, [fetchUnits, fetchTotalRevenue, fetchStats]);

  // WebSocket connection with auto-reconnect
  useEffect(() => {
    let reconnectTimeout;
    let wsInstance = ws;

    const connectWebSocket = () => {
      try {
        const websocket = new WebSocket(WS_URL);

        websocket.onopen = () => {
          console.log('✅ WebSocket connected');
          setWsConnected(true);
          setStatusMessage('🔗 Connected - Real-time updates active');
          setError(null);
        };

        websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
              case 'CONNECTION':
                console.log(`Connected to server (ID: ${data.client_id})`);
                break;

              case 'UNIT_UPDATE':
                setUnits((prevUnits) =>
                  prevUnits.map((u) =>
                    u.id === data.unit.id
                      ? { ...u, ...data.unit }
                      : u
                  )
                );
                break;

              case 'COIN_INSERTED':
                setUnits((prevUnits) =>
                  prevUnits.map((u) =>
                    u.id === data.unit.id
                      ? { ...u, ...data.unit }
                      : u
                  )
                );
                fetchTotalRevenue();
                setStatusMessage(`💵 Coin inserted to ${data.unit.id}`);
                break;

              case 'HARDWARE_CONTROL':
                console.log(`Hardware control: ${data.action} on unit ${data.unit_id}`);
                setStatusMessage(`⚙️ Control command sent: ${data.action}`);
                break;

              case 'PONG':
                // Keep-alive response
                break;

              default:
                console.log('Unknown message type:', data.type);
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
          }
        };

        websocket.onclose = () => {
          console.log('🔴 WebSocket disconnected');
          setWsConnected(false);
          setStatusMessage('🔄 Reconnecting...');
          
          // Attempt reconnect
          reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_INTERVAL);
        };

        websocket.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          setError('WebSocket connection failed');
        };

        wsInstance = websocket;
        setWs(websocket);

        // Keep-alive ping
        const pingInterval = setInterval(() => {
          if (websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: 'PING' }));
          }
        }, 30000);

        return () => clearInterval(pingInterval);
      } catch (err) {
        console.error('WebSocket error:', err);
        reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_INTERVAL);
      }
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsInstance) {
        wsInstance.close();
      }
    };
  }, []);

  // Periodic refresh of data
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      fetchUnits();
      fetchTotalRevenue();
      fetchStats();
    }, REFRESH_INTERVAL);

    return () => clearInterval(refreshInterval);
  }, [fetchUnits, fetchTotalRevenue, fetchStats]);

  // Handle select unit
  const handleSelectUnit = (unitId) => {
    setSelectedUnitId(unitId);
    setShowCoinDialog(true);
  };

  // Handle insert coin
  const handleInsertCoin = async (amount) => {
    try {
      const response = await axios.post(
        `${API_URL}/units/${selectedUnitId}/add-time`,
        { amount, denomination: amount }
      );
      setStatusMessage(`✅ ₱${amount} inserted to PC ${selectedUnitId}`);
      setShowCoinDialog(false);
      setSelectedUnitId(null);
      fetchUnits();
      fetchTotalRevenue();
      return response.data;
    } catch (error) {
      console.error('Error inserting coin:', error);
      throw new Error(error.response?.data?.error || 'Failed to insert coin');
    }
  };

  // Handle hardware control
  const handleControl = async (unitId, action) => {
    try {
      await axios.post(`${API_URL}/units/${unitId}/control`, { action });
      setStatusMessage(`⚙️ ${action.toUpperCase()} command sent to PC ${unitId}`);
      fetchUnits();
    } catch (error) {
      console.error('Error sending control command:', error);
      setStatusMessage(`❌ Error sending ${action} command`);
      throw error;
    }
  };

  // Handle add time (admin feature)
  const handleAddTime = async (unitId, amount) => {
    try {
      await axios.post(
        `${API_URL}/units/${unitId}/add-time`,
        { amount, denomination: amount }
      );
      setStatusMessage(`✅ Added ₱${amount} to PC ${unitId}`);
      fetchUnits();
      fetchTotalRevenue();
    } catch (error) {
      console.error('Error adding time:', error);
      setStatusMessage('❌ Error adding time');
      throw error;
    }
  };

  const selectedUnit = units.find(u => u.id === selectedUnitId);

  return (
    <div className="App">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <h1>🖥️ PisoNet Manager</h1>
        </div>
        <div className="header-center">
          <div className={`connection-status ${wsConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            {wsConnected ? 'Live Updates' : 'Offline Mode'}
          </div>
        </div>
        <div className="header-right">
          <div className="total-revenue">
            💵 ₱{totalRevenue.toFixed(2)}
          </div>
          <div className="view-toggle">
            <button 
              className={`toggle-btn ${viewMode === 'customer' ? 'active' : ''}`}
              onClick={() => setViewMode('customer')}
            >
              Customer View
            </button>
            <button 
              className={`toggle-btn ${viewMode === 'admin' ? 'active' : ''}`}
              onClick={() => setViewMode('admin')}
            >
              Admin Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-content">
        {isLoading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading system...</p>
          </div>
        ) : error && viewMode === 'customer' ? (
          <div className="error-container">
            <p>❌ {error}</p>
            <button onClick={fetchUnits}>Retry</button>
          </div>
        ) : (
          <>
            {viewMode === 'customer' ? (
              <CustomerView 
                units={units} 
                selectedUnitId={selectedUnitId}
                onSelectUnit={handleSelectUnit}
              />
            ) : (
              <AdminView 
                units={units}
                totalRevenue={totalRevenue}
                onControl={handleControl}
                onAddTime={handleAddTime}
              />
            )}
          </>
        )}
      </main>

      {/* Status Bar */}
      <footer className="status-bar">
        <span className="status-message">{statusMessage}</span>
        {stats && (
          <span className="status-stats">
            🖥️ {stats.total_units} PCs · ⏳ {stats.active_units} Active · 📊 {stats.total_transactions} Transactions
          </span>
        )}
      </footer>

      {/* Coin Dialog Modal */}
      {showCoinDialog && selectedUnit && (
        <CoinDialog
          unit={selectedUnit}
          onInsertCoin={handleInsertCoin}
          onClose={() => {
            setShowCoinDialog(false);
            setSelectedUnitId(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
