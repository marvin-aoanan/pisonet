import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Container, 
  Box, 
  Button, 
  Chip, 
  CircularProgress,
  Alert,
  Snackbar,
  Grid,
  Paper,
  IconButton,
  createTheme,
  ThemeProvider,
  CssBaseline
} from '@mui/material';
import {
  Monitor as MonitorIcon,
  Timeline as TimelineIcon,
  Refresh as RefreshIcon,
  Wifi as WifiIcon,
  WifiOff as WifiOffIcon
} from '@mui/icons-material';
import CustomerView from './components/CustomerView';
import AdminView from './components/AdminView';
import CoinDialog from './components/CoinDialog';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#007ACC',
    },
    secondary: {
      main: '#FFCC00',
    },
    background: {
      default: '#121212',
      paper: '#1E1E1E',
    },
  },
});

const resolveApiUrl = () => {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  const protocol = window.location.protocol;
  const host = window.location.hostname || 'localhost';
  return `${protocol}//${host}:5001/api`;
};

const API_URL = resolveApiUrl();

const resolveWsUrl = () => {
  if (process.env.REACT_APP_WS_URL) {
    return process.env.REACT_APP_WS_URL;
  }

  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL
      .replace(/\/api\/?$/, '')
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:');
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:5001`;
};

const WS_URL = resolveWsUrl();
const REFRESH_INTERVAL = 1001; // Refresh every 1 second
const RECONNECT_INTERVAL = 5000; // Try to reconnect every 5 seconds

function App() {
  // State
  const [units, setUnits] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [showCoinDialog, setShowCoinDialog] = useState(false);
  const [selection, setSelection] = useState({ unit_id: null, expires_at: null, timeout_ms: 30000 });
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [wsConnected, setWsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [viewMode, setViewMode] = useState('customer'); // customer or admin

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

  // Fetch kiosk selection
  const fetchSelection = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/kiosk/selection`);
      setSelection(response.data);
    } catch (error) {
      console.error('Error fetching selection:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      await Promise.all([fetchUnits(), fetchTotalRevenue(), fetchStats()]);
      await fetchSelection();
      setIsLoading(false);
      setStatusMessage('✅ System Ready');
    };

    loadInitialData();
  }, [fetchUnits, fetchTotalRevenue, fetchStats, fetchSelection]);

  // WebSocket connection with auto-reconnect
  useEffect(() => {
    let reconnectTimeout;
    let wsInstance;

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
                if (showCoinDialog && selection.unit_id === data.unit.id) {
                  setShowCoinDialog(false);
                  setSelectedUnitId(null);
                }
                break;

              case 'SELECTION_UPDATED':
                setSelection((prev) => ({
                  ...prev,
                  ...data.selection,
                  timeout_ms: prev.timeout_ms
                }));
                if (!data.selection?.unit_id) {
                  setShowCoinDialog(false);
                  setSelectedUnitId(null);
                }
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
  }, [fetchTotalRevenue, selection.unit_id, showCoinDialog]);

  // Periodic refresh of data
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      fetchUnits();
      fetchTotalRevenue();
      fetchStats();
      fetchSelection();
    }, REFRESH_INTERVAL);

    return () => clearInterval(refreshInterval);
  }, [fetchUnits, fetchTotalRevenue, fetchStats, fetchSelection]);

  // Handle select unit
  const handleSelectUnit = async (unitId) => {
    try {
      const response = await axios.post(`${API_URL}/kiosk/selection`, { unitId });
      setSelection(response.data);
      setSelectedUnitId(unitId);
      setShowCoinDialog(true);
      setStatusMessage(`🪙 Waiting for coin on PC ${unitId}`);
    } catch (error) {
      console.error('Error selecting unit:', error);
      setStatusMessage(error.response?.data?.error || '❌ Failed to select unit');
    }
  };

  const handleCancelSelection = async () => {
    try {
      await axios.delete(`${API_URL}/kiosk/selection`);
      setSelection({ unit_id: null, expires_at: null, timeout_ms: selection.timeout_ms });
      setShowCoinDialog(false);
      setSelectedUnitId(null);
      setStatusMessage('Selection cancelled');
    } catch (error) {
      console.error('Error cancelling selection:', error);
      setStatusMessage('❌ Failed to cancel selection');
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

  // Handle timer adjustment (admin feature)
  const handleAddTime = async (unitId, minutes) => {
    try {
      await axios.post(
        `${API_URL}/units/${unitId}/adjust-time`,
        { minutes }
      );
      const direction = minutes > 0 ? 'Added' : 'Removed';
      setStatusMessage(`⏱️ ${direction} ${Math.abs(minutes)}m ${minutes > 0 ? 'to' : 'from'} PC ${unitId}`);
      fetchUnits();
    } catch (error) {
      console.error('Error adjusting time:', error);
      setStatusMessage('❌ Error adjusting time');
      throw error;
    }
  };

  const selectedUnit = units.find(u => u.id === selectedUnitId || u.id === selection.unit_id);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Header */}
        <AppBar position="static">
          <Toolbar>
            <MonitorIcon sx={{ mr: 2 }} />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              PisoNet Manager
            </Typography>
            
            {/* Connection Status */}
            <Chip 
              icon={wsConnected ? <WifiIcon /> : <WifiOffIcon />}
              label={wsConnected ? 'Live Updates' : 'Offline'}
              color={wsConnected ? 'success' : 'error'}
              variant="outlined"
              sx={{ mr: 2 }}
            />

            {/* Revenue Display */}
            <Typography variant="h6" sx={{ mr: 2, color: 'secondary.main', fontWeight: 'bold' }}>
              ₱{totalRevenue.toFixed(2)}
            </Typography>

            {/* View Toggle */}
            <Button 
              color="inherit" 
              onClick={() => setViewMode(viewMode === 'customer' ? 'admin' : 'customer')}
              startIcon={viewMode === 'customer' ? <TimelineIcon /> : <MonitorIcon />}
            >
              {viewMode === 'customer' ? 'Admin Dashboard' : 'Customer View'}
            </Button>
          </Toolbar>
        </AppBar>

        {/* Main Content */}
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4, flexGrow: 1 }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
              <CircularProgress size={60} />
            </Box>
          ) : error && viewMode === 'customer' ? (
            <Alert severity="error" action={
              <Button color="inherit" size="small" onClick={fetchUnits}>
                Retry
              </Button>
            }>
              {error}
            </Alert>
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
        </Container>

        {/* Status Bar */}
        <Paper component="footer" square sx={{ py: 1, px: 3, mt: 'auto', backgroundColor: 'background.paper' }}>
          <Grid container alignItems="center" spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="caption" color="text.secondary">
                {statusMessage}
              </Typography>
            </Grid>
            {stats && (
              <Grid item xs={12} md={6} sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                <Typography variant="caption" color="text.secondary">
                  🖥️ {stats.total_units} PCs · ⏳ {stats.active_units} Active · 📊 {stats.total_transactions} Transactions
                </Typography>
              </Grid>
            )}
          </Grid>
        </Paper>

        {/* Coin Dialog Modal */}
        {showCoinDialog && selectedUnit && (
          <CoinDialog
            unit={selectedUnit}
            selection={selection}
            onClose={handleCancelSelection}
          />
        )}
      </Box>
    </ThemeProvider>
  );
}

export default App;
