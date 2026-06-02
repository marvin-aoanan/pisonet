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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  useMediaQuery,
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
  const isMobileHeader = useMediaQuery('(max-width:600px)');

  // State
  const [units, setUnits] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [showCoinDialog, setShowCoinDialog] = useState(false);
  const [insertedAmount, setInsertedAmount] = useState(0);
  const [selection, setSelection] = useState({ unit_id: null, expires_at: null, timeout_ms: 30000 });
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [wsConnected, setWsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [viewMode, setViewMode] = useState('customer'); // customer or admin
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);

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
                  setInsertedAmount((prev) => prev + (data.amount || 0));
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
      setInsertedAmount(0);
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
      await axios.post(
        `${API_URL}/units/${unitId}/control`,
        { action },
        {
          headers: {
            'x-admin-password': adminPassword
          }
        }
      );
      setStatusMessage(`⚙️ ${action.toUpperCase()} command sent to PC ${unitId}`);
      fetchUnits();
    } catch (error) {
      console.error('Error sending control command:', error);
      if (error?.response?.status === 401) {
        setStatusMessage('🔒 Admin password required. Please log in again.');
        setViewMode('customer');
        setAdminPassword('');
        setAdminAuthOpen(true);
        throw error;
      }
      setStatusMessage(`❌ Error sending ${action} command`);
      throw error;
    }
  };

  // Handle timer adjustment (admin feature)
  const handleAddTime = async (unitId, minutes) => {
    try {
      await axios.post(
        `${API_URL}/units/${unitId}/adjust-time`,
        { minutes },
        {
          headers: {
            'x-admin-password': adminPassword
          }
        }
      );
      const direction = minutes > 0 ? 'Added' : 'Removed';
      setStatusMessage(`⏱️ ${direction} ${Math.abs(minutes)}m ${minutes > 0 ? 'to' : 'from'} PC ${unitId}`);
      fetchUnits();
    } catch (error) {
      console.error('Error adjusting time:', error);
      if (error?.response?.status === 401) {
        setStatusMessage('🔒 Admin password required. Please log in again.');
        setViewMode('customer');
        setAdminPassword('');
        setAdminAuthOpen(true);
        throw error;
      }
      setStatusMessage('❌ Error adjusting time');
      throw error;
    }
  };

  // Handle start open-time session (admin feature, ₱15/hour)
  const handleOpenTime = async (unitId) => {
    try {
      await axios.post(
        `${API_URL}/units/${unitId}/open-time`,
        {},
        { headers: { 'x-admin-password': adminPassword } }
      );
      setStatusMessage(`⏱️ Open time started on PC ${unitId}`);
      fetchUnits();
    } catch (error) {
      console.error('Error starting open time:', error);
      if (error?.response?.status === 401) {
        setStatusMessage('🔒 Admin password required. Please log in again.');
        setViewMode('customer');
        setAdminPassword('');
        setAdminAuthOpen(true);
        throw error;
      }
      setStatusMessage('❌ Error starting open time');
      throw error;
    }
  };

  // Handle stop open-time session (admin feature)
  const handleStopOpenTime = async (unitId) => {
    try {
      await axios.delete(
        `${API_URL}/units/${unitId}/open-time`,
        { headers: { 'x-admin-password': adminPassword } }
      );
      setStatusMessage(`⏹️ Open time stopped on PC ${unitId}`);
      fetchUnits();
    } catch (error) {
      console.error('Error stopping open time:', error);
      if (error?.response?.status === 401) {
        setStatusMessage('🔒 Admin password required. Please log in again.');
        setViewMode('customer');
        setAdminPassword('');
        setAdminAuthOpen(true);
        throw error;
      }
      setStatusMessage('❌ Error stopping open time');
      throw error;
    }
  };

  // Handle pause regular countdown timer without ending session (admin feature)
  const handlePauseTimer = async (unitId) => {
    try {
      await axios.post(
        `${API_URL}/units/${unitId}/timer/pause`,
        {},
        { headers: { 'x-admin-password': adminPassword } }
      );
      setStatusMessage(`⏸️ Timer paused on PC ${unitId}`);
      fetchUnits();
    } catch (error) {
      console.error('Error pausing timer:', error);
      if (error?.response?.status === 401) {
        setStatusMessage('🔒 Admin password required. Please log in again.');
        setViewMode('customer');
        setAdminPassword('');
        setAdminAuthOpen(true);
        throw error;
      }
      setStatusMessage('❌ Error pausing timer');
      throw error;
    }
  };

  // Handle resume regular countdown timer (admin feature)
  const handleResumeTimer = async (unitId) => {
    try {
      await axios.post(
        `${API_URL}/units/${unitId}/timer/resume`,
        {},
        { headers: { 'x-admin-password': adminPassword } }
      );
      setStatusMessage(`▶️ Timer resumed on PC ${unitId}`);
      fetchUnits();
    } catch (error) {
      console.error('Error resuming timer:', error);
      if (error?.response?.status === 401) {
        setStatusMessage('🔒 Admin password required. Please log in again.');
        setViewMode('customer');
        setAdminPassword('');
        setAdminAuthOpen(true);
        throw error;
      }
      setStatusMessage('❌ Error resuming timer');
      throw error;
    }
  };

  const handleAdminToggle = () => {
    if (viewMode === 'admin') {
      setViewMode('customer');
      return;
    }

    setAdminAuthError('');
    setAdminPasswordInput('');
    setAdminAuthOpen(true);
  };

  const handleAdminLogin = async () => {
    if (!adminPasswordInput) {
      setAdminAuthError('Password is required.');
      return;
    }

    setAdminAuthLoading(true);
    setAdminAuthError('');

    try {
      const response = await axios.post(`${API_URL}/settings/admin/auth`, {
        password: adminPasswordInput
      });

      if (!response.data?.valid) {
        setAdminAuthError('Invalid admin password.');
        return;
      }

      setAdminPassword(adminPasswordInput);
      setAdminAuthOpen(false);
      setViewMode('admin');
      setAdminPasswordInput('');
      setStatusMessage('🔓 Admin access granted');
    } catch (error) {
      console.error('Error verifying admin password:', error);
      setAdminAuthError('Failed to verify password. Please try again.');
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const selectedUnit = units.find(u => u.id === selectedUnitId || u.id === selection.unit_id);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Header */}
        <AppBar position="static">
          <Toolbar sx={{ py: { xs: 1, sm: 0 }, px: { xs: 1.5, sm: 2 }, flexWrap: 'nowrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flexGrow: 1 }}>
              {/* Connection Status */}
              <Chip
                icon={wsConnected ? <WifiIcon /> : <WifiOffIcon />}
                label={isMobileHeader ? '' : (wsConnected ? 'Live' : 'Offline')}
                color={wsConnected ? 'success' : 'error'}
                variant="outlined"
                size="small"
                sx={{
                  mr: 1,
                  flexShrink: 0,
                  width: isMobileHeader ? 30 : 'auto',
                  height: isMobileHeader ? 30 : 'auto',
                  px: isMobileHeader ? 0 : undefined,
                  '& .MuiChip-label': {
                    px: isMobileHeader ? 0 : 1,
                    display: isMobileHeader ? 'none' : 'inline'
                  },
                  '& .MuiChip-icon': {
                    mr: isMobileHeader ? 0 : undefined,
                    ml: isMobileHeader ? 0 : undefined,
                    fontSize: isMobileHeader ? 18 : undefined
                  }
                }}
              />
              <MonitorIcon sx={{ mr: 1.25 }} />
              <Typography
                variant="h6"
                component="div"
                sx={{
                  fontSize: { xs: '1rem', sm: '1.25rem' },
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                PisoNet Manager
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {/* View Toggle */}
              <Button
                color="inherit"
                startIcon={isMobileHeader ? undefined : (viewMode === 'customer' ? <TimelineIcon /> : <MonitorIcon />)}
                onClick={handleAdminToggle}
                sx={{ whiteSpace: 'nowrap', minWidth: isMobileHeader ? 'auto' : 64, px: isMobileHeader ? 1 : 1.5 }}
                size="small"
              >
                {isMobileHeader
                  ? (viewMode === 'customer' ? 'Admin' : 'User')
                  : (viewMode === 'customer' ? 'Admin Dashboard' : 'Customer View')}
              </Button>
            </Box>
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
                  onOpenTime={handleOpenTime}
                  onStopOpenTime={handleStopOpenTime}
                  onPauseTimer={handlePauseTimer}
                  onResumeTimer={handleResumeTimer}
                  adminPassword={adminPassword}
                  onAdminPasswordChanged={setAdminPassword}
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
            insertedAmount={insertedAmount}
            onClose={handleCancelSelection}
          />
        )}

        <Dialog
          open={adminAuthOpen}
          onClose={() => {
            if (!adminAuthLoading) {
              setAdminAuthOpen(false);
            }
          }}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Admin Password Required</DialogTitle>
          <DialogContent>
            <TextField
              margin="normal"
              autoFocus
              fullWidth
              label="Admin Password"
              type="password"
              value={adminPasswordInput}
              onChange={(event) => setAdminPasswordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleAdminLogin();
                }
              }}
            />
            {adminAuthError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {adminAuthError}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAdminAuthOpen(false)} disabled={adminAuthLoading}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleAdminLogin} disabled={adminAuthLoading}>
              {adminAuthLoading ? 'Checking...' : 'Enter Admin'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}

export default App;
