import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Typography,
  Chip,
  Box,
  Tooltip,
  ButtonGroup,
  Card,
  CardContent,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Divider,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  PowerSettingsNew as PowerIcon,
  Block as BlockIcon,
  AttachMoney as MoneyIcon,
  Computer as ComputerIcon,
  Logout as LogoutIcon,
  RestartAlt as RestartAltIcon,
} from '@mui/icons-material';
import { PieChart } from '@mui/x-charts/PieChart';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { BarChart } from '@mui/x-charts/BarChart';
import { areaElementClasses, lineElementClasses, chartsAxisHighlightClasses } from '@mui/x-charts';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

function getFlatRateSettings(settings = {}) {
  const asPositive = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const tier1Minutes = asPositive(settings.flat_rate_tier1_minutes, 15);
  const tier1Price = asPositive(settings.flat_rate_tier1_price, 5);
  const tier2Minutes = Math.max(tier1Minutes + 1, asPositive(settings.flat_rate_tier2_minutes, 30));
  const tier2Price = asPositive(settings.flat_rate_tier2_price, 10);
  const tier3Minutes = Math.max(tier2Minutes + 1, asPositive(settings.flat_rate_tier3_minutes, 60));
  const tier3Price = asPositive(settings.flat_rate_tier3_price, 15);

  return {
    tier1Minutes,
    tier1Price,
    tier2Minutes,
    tier2Price,
    tier3Minutes,
    tier3Price,
  };
}

function calculateFlatRateAmountFromMinutes(minutes, settings = {}) {
  const pricing = getFlatRateSettings(settings);
  const absMinutes = Math.ceil(Math.max(0, Number(minutes) || 0));

  if (absMinutes <= 0) return 0;
  if (absMinutes <= pricing.tier1Minutes) return pricing.tier1Price;
  if (absMinutes <= pricing.tier2Minutes) return pricing.tier2Price;
  if (absMinutes <= pricing.tier3Minutes) return pricing.tier3Price;

  const extensionBlocks = Math.ceil((absMinutes - pricing.tier3Minutes) / Math.max(1, pricing.tier1Minutes));
  return pricing.tier3Price + (extensionBlocks * pricing.tier1Price);
}

function normalizeTransactionRevenue(tx, pricingSettings) {
  const amount = Number(tx?.amount || 0);
  const type = tx?.transaction_type;

  if (type === 'admin_add' || type === 'admin_deduct') {
    const sign = amount < 0 ? -1 : 1;
    return sign * calculateFlatRateAmountFromMinutes(Math.abs(amount), pricingSettings);
  }

  return amount;
}

function AdminDashboard({ units, totalRevenue, onControl, onAddTime, onOpenTime, onStopOpenTime, onPauseTimer, onResumeTimer, adminPassword }) {
  const [loading, setLoading] = useState(null);
  const [dailyRevenue, setDailyRevenue] = useState([]);
  const [weekIndex, setWeekIndex] = useState(null);
  const [timeDialogOpen, setTimeDialogOpen] = useState(false);
  const [timeDialogType, setTimeDialogType] = useState(null);
  const [timeDialogUnitId, setTimeDialogUnitId] = useState(null);
  const [timeDialogAmount, setTimeDialogAmount] = useState('');
  const [sessionRevenueByUnit, setSessionRevenueByUnit] = useState({});

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const compactChartWidth = isMobile ? 180 : 220;
  const compactChartHeight = isMobile ? 180 : 200;

  const handleAction = async (unitId, action, callback) => {
    setLoading(unitId);
    try {
      if (callback) await callback();
    } finally {
      setLoading(null);
    }
  };

  const openTimeDialog = (unitId, type) => {
    setTimeDialogUnitId(unitId);
    setTimeDialogType(type);
    setTimeDialogAmount('');
    setTimeDialogOpen(true);
  };

  const closeTimeDialog = () => {
    setTimeDialogOpen(false);
    setTimeDialogUnitId(null);
    setTimeDialogType(null);
    setTimeDialogAmount('');
  };

  const handleTimeDialogConfirm = async () => {
    const minutes = parseInt(timeDialogAmount, 10);
    if (Number.isNaN(minutes) || minutes === 0) {
      return;
    }

    setLoading(timeDialogUnitId);
    try {
      const finalAmount = timeDialogType === 'deduct' ? -minutes : minutes;
      await onAddTime(timeDialogUnitId, finalAmount);
    } finally {
      setLoading(null);
    }

    closeTimeDialog();
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const isUnitActive = (unit) => {
    return unit.open_time === 1 || Number(unit.remaining_seconds || 0) > 0 || String(unit.status || '').toLowerCase() === 'active';
  };

  const getSessionRevenueDisplay = (unit) => {
    const unitId = Number(unit.id);
    const activeCountdownRevenue = sessionRevenueByUnit[unitId];

    if (Number(unit.open_time || 0) !== 1 && Number(unit.remaining_seconds || 0) > 0 && Number.isFinite(activeCountdownRevenue)) {
      return activeCountdownRevenue;
    }

    const baseRevenue = Number(unit.total_revenue || 0);
    if (unit.open_time === 1) {
      return baseRevenue + Number(unit.open_time_amount || 0);
    }
    return baseRevenue;
  };

  const activeUnits = units.filter(u => u.remaining_seconds > 0 || u.open_time === 1).length;
  const idleUnits = Math.max(units.length - activeUnits, 0);

  useEffect(() => {
    const fetchSessionRevenueByUnit = async () => {
      try {
        const activeCountdownUnits = (units || []).filter((unit) => Number(unit.open_time || 0) !== 1 && Number(unit.remaining_seconds || 0) > 0);
        if (!activeCountdownUnits.length) {
          setSessionRevenueByUnit({});
          return;
        }

        let currentPricingSettings = {};
        if (adminPassword) {
          try {
            const settingsResponse = await axios.get(`${API_URL}/settings`, {
              headers: { 'x-admin-password': adminPassword }
            });
            currentPricingSettings = settingsResponse?.data || {};
          } catch (settingsErr) {
            console.error('Error fetching flat-rate settings for session revenue:', settingsErr);
          }
        }

        const txResponse = await axios.get(`${API_URL}/transactions?limit=5000`);
        const transactions = txResponse.data || [];

        const nextMap = {};
        activeCountdownUnits.forEach((unit) => {
          const unitId = Number(unit.id);
          const startTime = new Date(unit.last_status_update || 0).getTime();
          const hasValidStart = Number.isFinite(startTime) && startTime > 0;

          const revenue = transactions.reduce((sum, tx) => {
            if (Number(tx?.unit_id) !== unitId) return sum;
            const txTime = new Date(tx?.timestamp || 0).getTime();
            if (hasValidStart && (!Number.isFinite(txTime) || txTime < startTime)) return sum;
            return sum + normalizeTransactionRevenue(tx, currentPricingSettings);
          }, 0);

          nextMap[unitId] = revenue;
        });

        setSessionRevenueByUnit(nextMap);
      } catch (err) {
        console.error('Error computing session revenue by unit:', err);
      }
    };

    fetchSessionRevenueByUnit();
  }, [units, adminPassword]);

  useEffect(() => {
    const fetchDailyRevenue = async () => {
      try {
        const response = await axios.get(`${API_URL}/transactions/revenue/daily?days=30`);
        setDailyRevenue(response.data || []);
      } catch (err) {
        console.error('Error fetching daily revenue:', err);
      }
    };

    fetchDailyRevenue();
  }, []);

  const sparklineData = useMemo(() => {
    return (dailyRevenue || [])
      .map((row) => Number(row.daily_revenue || 0))
      .reverse();
  }, [dailyRevenue]);

  const sparklineDates = useMemo(() => {
    return (dailyRevenue || [])
      .map((row) => row.date)
      .reverse();
  }, [dailyRevenue]);

  const todayKeyLocal = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const todayKeyUtc = useMemo(() => {
    return new Date().toISOString().slice(0, 10);
  }, []);

  const monthlyRevenue = useMemo(() => {
    if (!dailyRevenue || dailyRevenue.length === 0) return 0;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const monthKey = `${currentYear}-${currentMonth}`;

    return dailyRevenue.reduce((sum, row) => {
      if (!row?.date) return sum;
      const rowDate = String(row.date).slice(0, 10);
      if (rowDate.startsWith(monthKey)) {
        return sum + Number(row.daily_revenue || 0);
      }
      return sum;
    }, 0);
  }, [dailyRevenue]);

  const todaysRevenue = useMemo(() => {
    if (!dailyRevenue || dailyRevenue.length === 0) return 0;
    const todayRow = dailyRevenue.find((row) => {
      if (!row?.date) return false;
      const rowDate = String(row.date).slice(0, 10);
      if (rowDate === todayKeyLocal || rowDate === todayKeyUtc) return true;
      const localDate = new Date(`${rowDate}T00:00:00`);
      const yyyy = localDate.getFullYear();
      const mm = String(localDate.getMonth() + 1).padStart(2, '0');
      const dd = String(localDate.getDate()).padStart(2, '0');
      const rowLocalKey = `${yyyy}-${mm}-${dd}`;
      return rowLocalKey === todayKeyLocal;
    });
    return Number(todayRow?.daily_revenue || 0);
  }, [dailyRevenue, todayKeyLocal, todayKeyUtc]);

  const yesterdaysRevenue = useMemo(() => {
    if (!dailyRevenue || dailyRevenue.length === 0) return 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
    const dd = String(yesterday.getDate()).padStart(2, '0');
    const yesterdayKey = `${yyyy}-${mm}-${dd}`;
    
    const yesterdayRow = dailyRevenue.find((row) => {
      if (!row?.date) return false;
      const rowDate = String(row.date).slice(0, 10);
      return rowDate === yesterdayKey;
    });
    return Number(yesterdayRow?.daily_revenue || 0);
  }, [dailyRevenue]);

  const currentMonthLabel = useMemo(() => {
    const now = new Date();
    const monthName = now.toLocaleDateString('en-US', { month: 'short' });
    const year = now.getFullYear();
    return `${monthName} ${year}`;
  }, []);

  const monthlyRevenueData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Initialize map for all 12 months of current year
    const monthMap = {};
    for (let month = 1; month <= 12; month++) {
      const monthKey = `${currentYear}-${String(month).padStart(2, '0')}`;
      monthMap[monthKey] = 0;
    }
    
    // Add actual revenue data
    if (dailyRevenue && dailyRevenue.length > 0) {
      dailyRevenue.forEach((row) => {
        if (!row?.date) return;
        const rowDate = String(row.date).slice(0, 7); // Get YYYY-MM
        if (rowDate.startsWith(String(currentYear))) {
          monthMap[rowDate] = (monthMap[rowDate] || 0) + Number(row.daily_revenue || 0);
        }
      });
    }
    
    // Generate all 12 months
    const months = [];
    const revenues = [];
    for (let month = 1; month <= 12; month++) {
      const monthKey = `${currentYear}-${String(month).padStart(2, '0')}`;
      const date = new Date(currentYear, month - 1);
      months.push(date.toLocaleDateString('en-US', { month: 'short' }));
      revenues.push(monthMap[monthKey]);
    }
    
    return { months, revenues, year: currentYear };
  }, [dailyRevenue]);

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 4, flexDirection: isMobile ? 'column' : 'row' }}>
        <Grid item xs={12} sm={12} md={3}>
          <Card>
            <CardContent sx={{ overflow: 'visible' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0 }}>
                <ComputerIcon color="primary" sx={{ fontSize: 32, mr: 1.5 }} />
                <Typography color="text.secondary">
                  Active Units
                </Typography>
              </Box>
              <Box sx={{ position: 'relative', width: '100%', maxWidth: compactChartWidth, height: compactChartHeight, mx: 'auto' }}>
                <PieChart
                  series={[
                    {
                      innerRadius: 70,
                      outerRadius: 90,
                      data: [
                        { id: 0, value: activeUnits, label: 'Active', color: '#2e7d32' },
                        { id: 1, value: idleUnits, label: 'Idle', color: '#9e9e9e' },
                      ],
                    },
                  ]}
                  width={compactChartWidth}
                  height={compactChartHeight}
                  sx={{ '& .MuiChartsLegend-root': { display: 'none' } }}
                  slotProps={{ legend: { hidden: true } }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    pointerEvents: 'none',
                  }}
                >
                  <Typography variant="h5" fontWeight="bold">
                    {activeUnits} / {units.length}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Active
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={12} md={3}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Grid container spacing={2} sx={{ flexDirection: isMobile ? 'column' : 'row' }}>
              <Grid item xs={12} sm={12} md={6}>
                <Card elevation={2}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
                    <MoneyIcon color="warning" sx={{ fontSize: 32, mr: 1.5 }} />
                    <Box>
                      <Typography color="text.secondary" variant="body2" gutterBottom>
                        Yesterday's Income
                      </Typography>
                      <Typography variant="h5">
                        ₱{yesterdaysRevenue.toFixed(2)}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={12} md={6}>
                <Card elevation={2}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
                    <MoneyIcon color="primary" sx={{ fontSize: 32, mr: 1.5 }} />
                    <Box>
                      <Typography color="text.secondary" variant="body2" gutterBottom>
                        Today's Revenue
                      </Typography>
                      <Typography variant="h5">
                        ₱{todaysRevenue.toFixed(2)}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            <Card elevation={2} sx={{ width: '100%' }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', minWidth: 0, flexWrap: 'wrap', rowGap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <MoneyIcon color="success" sx={{ fontSize: 40, mr: 2 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography color="text.secondary" gutterBottom sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                      This Month Total Revenue ({currentMonthLabel})
                    </Typography>
                    <Typography variant="h4">
                      ₱{monthlyRevenue.toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
                {sparklineData.length > 0 && (
                  <Box sx={{ }}>
                    <SparkLineChart
                      height={40}
                      width={compactChartWidth}
                      area
                      showHighlight
                      showTooltip
                      color="rgb(137, 86, 255)"
                      baseline="min"
                      margin={{ bottom: 0, top: 5, left: 4, right: 0 }}
                      onHighlightedAxisChange={(axisItems) => {
                        setWeekIndex(axisItems[0]?.dataIndex ?? null);
                      }}
                      highlightedAxis={
                        weekIndex === null
                          ? []
                          : [{ axisId: 'day-axis', dataIndex: weekIndex }]
                      }
                      data={sparklineData}
                      xAxis={{
                        id: 'day-axis',
                        scaleType: 'band',
                        data: sparklineDates,
                        valueFormatter: (value) => {
                          if (!value) return '';
                          const date = new Date(value);
                          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        }
                      }}
                      yAxis={{
                        domainLimit: (_, maxValue) => ({
                          min: -maxValue / 6,
                          max: maxValue,
                        }),
                      }}
                      sx={{
                        [`& .${areaElementClasses.root}`]: { opacity: 0.2 },
                        [`& .${lineElementClasses.root}`]: { strokeWidth: 3 },
                        [`& .${chartsAxisHighlightClasses.root}`]: {
                          stroke: 'rgb(137, 86, 255)',
                          strokeDasharray: 'none',
                          strokeWidth: 2,
                        },
                      }}
                      slotProps={{
                        lineHighlight: { r: 4 },
                      }}
                      clipAreaOffset={{ top: 2, bottom: 2 }}
                      axisHighlight={{ x: 'line' }}
                    />
                  </Box>
                )}
              </CardContent>
            </Card>
            
          </Box>
        </Grid>
        <Grid item xs={12} sm={12} md={6} sx={{flex: 'auto'}}>
          <Card elevation={3}>
              <CardContent>
                <Typography color="text.secondary" gutterBottom sx={{ mb: 0 }}>
                  Yearly Overview ({monthlyRevenueData.year})
                </Typography>
                {monthlyRevenueData.months.length > 0 && (
                  <BarChart
                    xAxis={[{ 
                      scaleType: 'band', 
                      data: monthlyRevenueData.months,
                      tickLabelStyle: { fontSize: 12 }
                    }]}
                    series={[{
                      data: monthlyRevenueData.revenues,
                      label: 'Revenue',
                      color: 'rgb(137, 86, 255)'
                    }]}
                    height={180}
                    margin={{ top: 10, bottom: 0, left: 50, right: 10 }}
                  />
                )}
              </CardContent>
            </Card>
        </Grid>
      </Grid>

      {isMobile ? (
        /* ── Mobile: one card per unit ── */
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {units.map((unit) => (
            <Paper key={unit.id} elevation={2} sx={{ p: 2 }}>
              {/* Header row: name + status */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold">{unit.name}</Typography>
                  {unit.ip_address ? (
                    <Typography variant="caption" color="success.main" display="block">● {unit.ip_address}</Typography>
                  ) : (
                    <Typography variant="caption" color="text.disabled" display="block">○ offline</Typography>
                  )}
                </Box>
                <Chip
                  label={unit.remaining_seconds > 0 ? 'ACTIVE' : 'IDLE'}
                  color={unit.remaining_seconds > 0 ? 'success' : 'default'}
                  size="small"
                />
              </Box>

              {/* Time + Revenue row */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">Time Remaining</Typography>
                  <Typography variant="h6" color={unit.open_time === 1 ? 'warning.main' : 'text.primary'}>
                    {unit.open_time === 1 ? formatTime(unit.open_time_elapsed || 0) : formatTime(unit.remaining_seconds)}
                  </Typography>
                  {unit.open_time === 1 && (
                    <Typography variant="caption" color="warning.main" display="block">
                      ₱{(unit.open_time_amount || 0).toFixed(2)} owed
                    </Typography>
                  )}
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary" display="block">Revenue</Typography>
                  <Typography color="secondary.main" fontWeight="bold" variant="h6">
                    ₱{getSessionRevenueDisplay(unit).toFixed(2)}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ mb: 1.5 }} />

              {/* Power Control */}
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Power Control</Typography>
              <ButtonGroup variant="outlined" size="small" fullWidth sx={{ mb: 1.5 }}>
                <Tooltip title="Logout – Clear remaining time">
                  <Button color="warning" onClick={() => handleAction(unit.id, 'logout', () => onControl(unit.id, 'logout'))} disabled={loading === unit.id}>
                    <LogoutIcon fontSize="small" />
                  </Button>
                </Tooltip>
                <Tooltip title="Restart PC">
                  <Button color="info" onClick={() => handleAction(unit.id, 'restart', () => onControl(unit.id, 'restart'))} disabled={loading === unit.id}>
                    <RestartAltIcon fontSize="small" />
                  </Button>
                </Tooltip>
                <Tooltip title="Shutdown PC">
                  <Button color="error" onClick={() => handleAction(unit.id, 'shutdown', () => onControl(unit.id, 'shutdown'))} disabled={loading === unit.id}>
                    <PowerIcon fontSize="small" />
                  </Button>
                </Tooltip>
              </ButtonGroup>

              {/* Timer Control */}
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Timer Control</Typography>
              <ButtonGroup variant="contained" size="small" fullWidth sx={{ mb: 1 }}>
                <Button color="warning" onClick={() => openTimeDialog(unit.id, 'deduct')} disabled={loading === unit.id || unit.open_time === 1} sx={{ flex: 1 }}>
                  - Time
                </Button>
                <Button onClick={() => openTimeDialog(unit.id, 'add')} disabled={loading === unit.id || unit.open_time === 1} sx={{ flex: 1 }}>
                  + Time
                </Button>
              </ButtonGroup>
              <ButtonGroup variant="contained" size="small" fullWidth>
                <Button
                  color="warning"
                  onClick={() => handleAction(unit.id, unit.timer_paused === 1 ? 'resume_timer' : 'pause_timer', () => {
                    if (unit.timer_paused === 1) {
                      return onResumeTimer(unit.id);
                    }
                    return onPauseTimer(unit.id);
                  })}
                  disabled={loading === unit.id || unit.open_time === 1 || unit.remaining_seconds <= 0}
                  sx={{ flex: 1 }}
                >
                  {unit.timer_paused === 1 ? 'Resume Time' : 'Pause Time'}
                </Button>
                {unit.open_time === 1 ? (
                  <Button
                    color="error"
                    onClick={() => handleAction(unit.id, 'stop_open_time', () => onStopOpenTime(unit.id))}
                    disabled={loading === unit.id}
                    sx={{ flex: 1 }}
                  >
                    Stop Open Time
                  </Button>
                ) : (
                  <Button
                    color="success"
                    onClick={() => handleAction(unit.id, 'open_time', () => onOpenTime(unit.id))}
                    disabled={loading === unit.id || isUnitActive(unit)}
                    sx={{ flex: 1 }}
                  >
                    Open Time
                  </Button>
                )}
              </ButtonGroup>
            </Paper>
          ))}
        </Box>
      ) : (
        /* ── Desktop: scrollable table ── */
        <TableContainer component={Paper} elevation={3} sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 650 }} aria-label="admin table">
            <TableHead>
              <TableRow>
                <TableCell>Unit Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Time Remaining</TableCell>
                <TableCell align="right">Session Revenue</TableCell>
                <TableCell align="center">Power Control</TableCell>
                <TableCell align="center">Timer Control</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {units.map((unit) => (
                <TableRow
                  key={unit.id}
                  sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                >
                  <TableCell component="th" scope="row">
                    <Typography variant="subtitle1" fontWeight="bold">
                      {unit.name}
                    </Typography>
                    {unit.ip_address ? (
                      <Typography variant="caption" color="success.main" display="block">● {unit.ip_address}</Typography>
                    ) : (
                      <Typography variant="caption" color="text.disabled" display="block">○ offline</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={unit.remaining_seconds > 0 ? 'ACTIVE' : 'IDLE'}
                      color={unit.remaining_seconds > 0 ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="h6" color={unit.open_time === 1 ? 'warning.main' : 'text.primary'}>
                      {unit.open_time === 1 ? formatTime(unit.open_time_elapsed || 0) : formatTime(unit.remaining_seconds)}
                    </Typography>
                    {unit.open_time === 1 && (
                      <Typography variant="caption" color="warning.main" display="block">
                        ₱{(unit.open_time_amount || 0).toFixed(2)} owed
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography color="secondary.main" fontWeight="bold">
                      ₱{getSessionRevenueDisplay(unit).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <ButtonGroup variant="outlined" size="small">
                      <Tooltip title="Logout – Clear remaining time">
                        <Button
                          color="warning"
                          onClick={() => handleAction(unit.id, 'logout', () => onControl(unit.id, 'logout'))}
                          disabled={loading === unit.id}
                        >
                          <LogoutIcon fontSize="small" />
                        </Button>
                      </Tooltip>
                      <Tooltip title="Restart PC">
                        <Button
                          color="info"
                          onClick={() => handleAction(unit.id, 'restart', () => onControl(unit.id, 'restart'))}
                          disabled={loading === unit.id}
                        >
                          <RestartAltIcon fontSize="small" />
                        </Button>
                      </Tooltip>
                      <Tooltip title="Shutdown PC">
                        <Button
                          color="error"
                          onClick={() => handleAction(unit.id, 'shutdown', () => onControl(unit.id, 'shutdown'))}
                          disabled={loading === unit.id}
                        >
                          <PowerIcon fontSize="small" />
                        </Button>
                      </Tooltip>
                    </ButtonGroup>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'center', width: 180, mx: 'auto' }}>
                      <ButtonGroup variant="contained" size="small" sx={{ mb: 1, width: '100%' }}>
                        <Button
                          color="warning"
                          onClick={() => openTimeDialog(unit.id, 'deduct')}
                          disabled={loading === unit.id || unit.open_time === 1}
                          sx={{ flex: 1 }}
                        >
                          - Time
                        </Button>
                        <Button
                          onClick={() => openTimeDialog(unit.id, 'add')}
                          disabled={loading === unit.id || unit.open_time === 1}
                          sx={{ flex: 1 }}
                        >
                          + Time
                        </Button>
                      </ButtonGroup>
                      <ButtonGroup variant="contained" size="small" sx={{ width: '100%' }}>
                        <Button
                          color="warning"
                          onClick={() => handleAction(unit.id, unit.timer_paused === 1 ? 'resume_timer' : 'pause_timer', () => {
                            if (unit.timer_paused === 1) {
                              return onResumeTimer(unit.id);
                            }
                            return onPauseTimer(unit.id);
                          })}
                          disabled={loading === unit.id || unit.open_time === 1 || unit.remaining_seconds <= 0}
                          sx={{ flex: 1 }}
                        >
                          {unit.timer_paused === 1 ? 'Resume Time' : 'Pause Time'}
                        </Button>
                        {unit.open_time === 1 ? (
                          <Button
                            color="error"
                            onClick={() => handleAction(unit.id, 'stop_open_time', () => onStopOpenTime(unit.id))}
                            disabled={loading === unit.id}
                            sx={{ flex: 1 }}
                          >
                            Stop Open Time
                          </Button>
                        ) : (
                          <Button
                            color="success"
                            onClick={() => handleAction(unit.id, 'open_time', () => onOpenTime(unit.id))}
                            disabled={loading === unit.id || isUnitActive(unit)}
                            sx={{ flex: 1 }}
                          >
                            Open Time
                          </Button>
                        )}
                      </ButtonGroup>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={timeDialogOpen} onClose={closeTimeDialog} maxWidth="xs" fullWidth>
        <DialogTitle>
          {timeDialogType === 'add' ? 'Add Time' : 'Deduct Time'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            autoFocus
            fullWidth
            type="number"
            label="Minutes"
            value={timeDialogAmount}
            onChange={(e) => setTimeDialogAmount(e.target.value)}
            inputProps={{ min: '1', step: '1' }}
            placeholder="Enter number of minutes"
          />
          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Quick Select:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button 
                size="small" 
                variant={timeDialogAmount === '15' ? 'contained' : 'outlined'}
                onClick={() => setTimeDialogAmount('15')}
              >
                15m
              </Button>
              <Button 
                size="small" 
                variant={timeDialogAmount === '30' ? 'contained' : 'outlined'}
                onClick={() => setTimeDialogAmount('30')}
              >
                30m
              </Button>
              <Button 
                size="small" 
                variant={timeDialogAmount === '60' ? 'contained' : 'outlined'}
                onClick={() => setTimeDialogAmount('60')}
              >
                1hr
              </Button>
              <Button 
                size="small" 
                variant={timeDialogAmount === '120' ? 'contained' : 'outlined'}
                onClick={() => setTimeDialogAmount('120')}
              >
                2hr
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeTimeDialog} color="inherit">
            Cancel
          </Button>
          <Button 
            onClick={handleTimeDialogConfirm} 
            variant="contained"
            color={timeDialogType === 'add' ? 'primary' : 'warning'}
            disabled={!timeDialogAmount || parseInt(timeDialogAmount, 10) === 0}
          >
            {timeDialogType === 'add' ? 'Add' : 'Deduct'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

export default AdminDashboard;