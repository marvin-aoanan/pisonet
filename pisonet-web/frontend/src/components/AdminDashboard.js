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
  Grid
} from '@mui/material';
import {
  PowerSettingsNew as PowerIcon,
  Block as BlockIcon,
  Delete as ResetIcon,
  AttachMoney as MoneyIcon,
  Computer as ComputerIcon
} from '@mui/icons-material';
import { PieChart } from '@mui/x-charts/PieChart';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

function AdminDashboard({ units, totalRevenue, onControl, onAddTime }) {
  const [loading, setLoading] = useState(null);
  const [dailyRevenue, setDailyRevenue] = useState([]);
  const [weekIndex, setWeekIndex] = useState(null);

  const handleAction = async (unitId, action, callback) => {
    setLoading(unitId);
    try {
      if (callback) await callback();
    } finally {
      setLoading(null);
    }
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const activeUnits = units.filter(u => u.remaining_seconds > 0).length;
  const idleUnits = Math.max(units.length - activeUnits, 0);

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

  const sparklineSettings = useMemo(() => {
    return {
      data: sparklineData,
      xAxis: [{ id: 'day-axis', scaleType: 'band' }],
    };
  }, [sparklineData]);

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

  return (
    <Box>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card elevation={3}>
            <CardContent sx={{ overflow: 'visible' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <ComputerIcon color="primary" sx={{ fontSize: 32, mr: 1.5 }} />
                <Typography color="text.secondary">
                  Active Units
                </Typography>
              </Box>
              <Box sx={{ position: 'relative', width: 220, height: 220, mx: 'auto' }}>
                <PieChart
                  series={[
                    {
                      innerRadius: 70,
                      outerRadius: 90,
                      paddingAngle: 2,
                      data: [
                        { id: 0, value: activeUnits, label: 'Active', color: '#2e7d32' },
                        { id: 1, value: idleUnits, label: 'Idle', color: '#9e9e9e' },
                      ],
                    },
                  ]}
                  width={220}
                  height={220}
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
        <Grid item xs={12} md={6}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Card elevation={3}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <MoneyIcon color="success" sx={{ fontSize: 40, mr: 2 }} />
                  <Box>
                    <Typography color="text.secondary" gutterBottom>
                      Monthly Revenue
                    </Typography>
                    <Typography variant="h4">
                      ₱{monthlyRevenue.toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
                {sparklineData.length > 0 && (
                  <Box sx={{ width: 195, height: 40 }}>
                    <SparkLineChart
                      height={40}
                      width={195}
                      area
                      showHighlight
                      showTooltip
                      color="rgb(137, 86, 255)"
                      onHighlightedAxisChange={(axisItems) => {
                        setWeekIndex(axisItems[0]?.dataIndex ?? null);
                      }}
                      highlightedAxis={
                        weekIndex === null
                          ? []
                          : [{ axisId: 'day-axis', dataIndex: weekIndex }]
                      }
                      {...sparklineSettings}
                    />
                  </Box>
                )}
              </CardContent>
            </Card>
            <Card elevation={3}>
              <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
                <MoneyIcon color="primary" sx={{ fontSize: 40, mr: 2 }} />
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Today's Revenue
                  </Typography>
                  <Typography variant="h4">
                    ₱{todaysRevenue.toFixed(2)}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Grid>
      </Grid>

      <TableContainer component={Paper} elevation={3}>
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
                </TableCell>
                <TableCell>
                  <Chip 
                    label={unit.remaining_seconds > 0 ? 'ACTIVE' : 'IDLE'} 
                    color={unit.remaining_seconds > 0 ? 'success' : 'default'} 
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="h6" color="text.primary">
                    {formatTime(unit.remaining_seconds)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography color="secondary.main" fontWeight="bold">
                    ₱{(unit.total_revenue || 0).toFixed(2)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <ButtonGroup variant="outlined" size="small">
                    <Tooltip title="Power ON">
                      <Button 
                        color="success"
                        onClick={() => handleAction(unit.id, 'on', () => onControl(unit.id, 'on'))}
                        disabled={loading === unit.id}
                      >
                        <PowerIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    <Tooltip title="Graceful Shutdown">
                      <Button 
                        color="warning"
                        onClick={() => handleAction(unit.id, 'shutdown', () => onControl(unit.id, 'shutdown'))}
                        disabled={loading === unit.id}
                      >
                        <BlockIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    <Tooltip title="Force OFF (Relay)">
                      <Button 
                        color="error"
                        onClick={() => handleAction(unit.id, 'off', () => onControl(unit.id, 'off'))}
                        disabled={loading === unit.id}
                      >
                        <PowerIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                  </ButtonGroup>
                </TableCell>
                <TableCell align="center">
                  <ButtonGroup variant="contained" size="small">
                    <Button 
                      onClick={() => onAddTime(unit.id, 5)}
                      disabled={loading === unit.id}
                    >
                      +5m
                    </Button>
                    <Button 
                      onClick={() => onAddTime(unit.id, 15)}
                      disabled={loading === unit.id}
                    >
                      +15m
                    </Button>
                    <Button 
                      color="error"
                      onClick={() => onControl(unit.id, 'reset_timer')}
                      disabled={loading === unit.id}
                    >
                      <ResetIcon fontSize="small" />
                    </Button>
                  </ButtonGroup>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default AdminDashboard;