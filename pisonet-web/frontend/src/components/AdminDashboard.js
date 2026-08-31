import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  AttachMoney as MoneyIcon,
  Computer as ComputerIcon,
} from '@mui/icons-material';
import { PieChart } from '@mui/x-charts/PieChart';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { BarChart } from '@mui/x-charts/BarChart';
import { areaElementClasses, lineElementClasses, chartsAxisHighlightClasses } from '@mui/x-charts';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

function AdminDashboard({ units = [] }) {
  const [dailyRevenue, setDailyRevenue] = useState([]);
  const [weekIndex, setWeekIndex] = useState(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const compactChartWidth = isMobile ? 180 : 220;
  const compactChartHeight = isMobile ? 180 : 200;

  const activeUnits = units.filter((unit) => Number(unit.remaining_seconds || 0) > 0 || Number(unit.open_time || 0) === 1).length;
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
    return (dailyRevenue || []).map((row) => Number(row.daily_revenue || 0)).reverse();
  }, [dailyRevenue]);

  const sparklineDates = useMemo(() => {
    return (dailyRevenue || []).map((row) => row.date).reverse();
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

    const monthMap = {};
    for (let month = 1; month <= 12; month += 1) {
      const monthKey = `${currentYear}-${String(month).padStart(2, '0')}`;
      monthMap[monthKey] = 0;
    }

    if (dailyRevenue && dailyRevenue.length > 0) {
      dailyRevenue.forEach((row) => {
        if (!row?.date) return;
        const rowDate = String(row.date).slice(0, 7);
        if (rowDate.startsWith(String(currentYear))) {
          monthMap[rowDate] = (monthMap[rowDate] || 0) + Number(row.daily_revenue || 0);
        }
      });
    }

    const months = [];
    const revenues = [];
    for (let month = 1; month <= 12; month += 1) {
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
                <Typography color="text.secondary">Active Units</Typography>
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
                  <Typography variant="caption" color="text.secondary">Active</Typography>
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
                        Yesterday's Sales
                      </Typography>
                      <Typography variant="h5">₱{yesterdaysRevenue.toFixed(2)}</Typography>
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
                        Today's Sales
                      </Typography>
                      <Typography variant="h5">₱{todaysRevenue.toFixed(2)}</Typography>
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
                      This Month Total Sales ({currentMonthLabel})
                    </Typography>
                    <Typography variant="h4">₱{monthlyRevenue.toFixed(2)}</Typography>
                  </Box>
                </Box>
                {sparklineData.length > 0 && (
                  <Box>
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
                        },
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
                      slotProps={{ lineHighlight: { r: 4 } }}
                      clipAreaOffset={{ top: 2, bottom: 2 }}
                      axisHighlight={{ x: 'line' }}
                    />
                  </Box>
                )}
              </CardContent>
            </Card>
          </Box>
        </Grid>

        <Grid item xs={12} sm={12} md={4} sx={{ flex: 1 }}>
          <Card elevation={3}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom sx={{ mb: 0 }}>
                Yearly Overview ({monthlyRevenueData.year})
              </Typography>
              {monthlyRevenueData.months.length > 0 && (
                <BarChart
                  xAxis={[
                    {
                      scaleType: 'band',
                      data: monthlyRevenueData.months,
                      tickLabelStyle: { fontSize: 12 },
                    },
                  ]}
                  series={[
                    {
                      data: monthlyRevenueData.revenues,
                      label: 'Sales',
                      color: 'rgb(137, 86, 255)',
                    },
                  ]}
                  height={180}
                  margin={{ top: 10, bottom: 0, left: 50, right: 10 }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default AdminDashboard;
