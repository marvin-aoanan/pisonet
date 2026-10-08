import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Computer as ComputerIcon,
} from '@mui/icons-material';
import { PieChart } from '@mui/x-charts/PieChart';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { BarChart } from '@mui/x-charts/BarChart';
import { areaElementClasses, lineElementClasses, chartsAxisHighlightClasses } from '@mui/x-charts';
import { formatNumber, formatPeso } from '../utils/currency';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

function SalesBreakdownPie({ breakdown }) {
  const pcRental = Number(breakdown?.pcRental || 0);
  const print = Number(breakdown?.print || 0);
  const store = Number(breakdown?.store || 0);
  const total = pcRental + print + store;

  return (
    <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <PieChart
        series={[
          {
            innerRadius: 26,
            outerRadius: 64,
            cx: 70,
            cy: 70,
            paddingAngle: 2,
            cornerRadius: 4,
            arcLabelMinAngle: 18,
            arcLabel: (item) => {
              if (!total) return '';
              const percent = (Number(item.value || 0) / total) * 100;
              return `${item.label} ${percent.toFixed(0)}%`;
            },
            data: [
              { id: 'pc-rental', value: pcRental, label: 'PC', color: '#2E96FF' },
              { id: 'print', value: print, label: 'Print', color: '#FBC02D' },
              { id: 'store', value: store, label: 'Store', color: '#EF6C00' },
            ],
          },
        ]}
        width={140}
        height={140}
        sx={{
          '& .MuiChartsLegend-root': { display: 'none' },
          '& .MuiPieArcLabel-root': {
            fill: '#f5f5f5',
            fontSize: 11,
            fontWeight: 700,
          },
        }}
        slotProps={{ legend: { hidden: true } }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary">
          PC Rental: {formatPeso(pcRental)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Print: {formatPeso(print)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Store: {formatPeso(store)}
        </Typography>
      </Box>
    </Box>
  );
}

function OpexBreakdownPie({ revenue, expense, profit }) {
  const revenueValue = Number(revenue || 0);
  const expenseValue = Number(expense || 0);
  const total = revenueValue + expenseValue;

  return (
    <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <PieChart
        series={[
          {
            innerRadius: 26,
            outerRadius: 64,
            cx: 70,
            cy: 70,
            paddingAngle: 2,
            cornerRadius: 4,
            arcLabelMinAngle: 18,
            arcLabel: (item) => {
              if (!total) return '';
              const percent = (Number(item.value || 0) / total) * 100;
              return `${item.label} ${percent.toFixed(0)}%`;
            },
            data: [
              { id: 'revenue', value: revenueValue, label: 'Revenue', color: '#2E96FF' },
              { id: 'expense', value: expenseValue, label: 'Expense', color: '#EF6C00' },
            ],
          },
        ]}
        width={140}
        height={140}
        sx={{
          '& .MuiChartsLegend-root': { display: 'none' },
          '& .MuiPieArcLabel-root': {
            fill: '#f5f5f5',
            fontSize: 11,
            fontWeight: 700,
          },
        }}
        slotProps={{ legend: { hidden: true } }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary">
          Revenue: {formatPeso(revenueValue)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Expense: {formatPeso(expenseValue)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Profit: {formatPeso(Number(profit || 0))}
        </Typography>
      </Box>
    </Box>
  );
}

function AdminDashboard({ units = [], adminPassword }) {
  const [dailyRevenue, setDailyRevenue] = useState([]);
  const [revenueSummary, setRevenueSummary] = useState(null);
  const [opexSummary, setOpexSummary] = useState(null);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState(null);
  const [unitRevenueRows, setUnitRevenueRows] = useState([]);
  const [weekIndex, setWeekIndex] = useState(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const compactChartWidth = isMobile ? 180 : 220;
  const sparklineContainerRef = useRef(null);
  const [sparklineWidth, setSparklineWidth] = useState(compactChartWidth);

  const activeUnits = units.filter((unit) => Number(unit.remaining_seconds || 0) > 0 || Number(unit.open_time || 0) === 1).length;
  const idleUnits = Math.max(units.length - activeUnits, 0);

  const activeUnitsInsights = useMemo(() => {
    const usageByUnitId = new Map(
      (unitRevenueRows || []).map((row) => [
        Number(row?.id || 0),
        Math.max(0, Number(row?.usage_hours || 0)),
      ])
    );

    const normalized = (units || []).map((unit) => {
      const id = Number(unit?.id || 0);
      const mode = String(unit?.status_mode || 'active').toLowerCase();
      const isMaintenance = mode === 'maintenance';
      const usageHours = usageByUnitId.get(id);
      const totalUsedHours = Number.isFinite(usageHours)
        ? usageHours
        : Math.max(0, Number(unit?.total_used_seconds || 0) / 3600);

      return {
        unit,
        id,
        isMaintenance,
        totalUsedHours,
      };
    });

    const eligibleForUsageRank = normalized
      .filter((entry) => !entry.isMaintenance)
      .sort((a, b) => a.id - b.id);

    const byUsageDesc = [...eligibleForUsageRank]
      .sort((a, b) => (b.totalUsedHours - a.totalUsedHours) || (a.id - b.id));

    const byUsageAsc = [...eligibleForUsageRank]
      .sort((a, b) => (a.totalUsedHours - b.totalUsedHours) || (a.id - b.id));

    const inactiveList = [...normalized]
      .filter((entry) => entry.isMaintenance)
      .sort((a, b) => a.id - b.id);

    const getUnitLabel = (entry) => {
      if (!entry || !Number.isFinite(entry.id) || entry.id <= 0) {
        return 'N/A';
      }
      return `PC ${entry.id}`;
    };

    const inactiveLabels = inactiveList.map((entry) => getUnitLabel(entry));
    const mostUsedEntry = byUsageDesc[0] || null;
    const lessUsedEntry = byUsageAsc.find((entry) => !mostUsedEntry || entry.id !== mostUsedEntry.id) || null;

    return {
      mostUsed: getUnitLabel(mostUsedEntry),
      lessUsed: getUnitLabel(lessUsedEntry),
      inactive: inactiveLabels.length > 0 ? inactiveLabels.join(', ') : 'N/A',
    };
  }, [unitRevenueRows, units]);

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

  useEffect(() => {
    const fetchRevenueSummary = async () => {
      try {
        const response = await axios.get(`${API_URL}/transactions/revenue/summary`);
        setRevenueSummary(response.data?.data || null);
      } catch (err) {
        console.error('Error fetching revenue summary:', err);
      }
    };

    fetchRevenueSummary();
  }, []);

  useEffect(() => {
    const fetchOpexSummary = async () => {
      if (!adminPassword) {
        setOpexSummary(null);
        return;
      }

      try {
        const response = await axios.get(`${API_URL}/opex/summary`, {
          headers: { 'x-admin-password': adminPassword },
        });
        setOpexSummary(response.data?.data || null);
      } catch (err) {
        console.error('Error fetching OPEX summary for dashboard ROI:', err);
        setOpexSummary(null);
      }
    };

    fetchOpexSummary();
  }, [adminPassword]);

  useEffect(() => {
    const fetchMonthlyBreakdown = async () => {
      try {
        const response = await axios.get(`${API_URL}/transactions/revenue/monthly-breakdown`);
        setMonthlyBreakdown(response.data?.data || null);
      } catch (err) {
        console.error('Error fetching monthly revenue breakdown:', err);
      }
    };

    fetchMonthlyBreakdown();
  }, []);

  useEffect(() => {
    const fetchRevenueByUnit = async () => {
      try {
        const response = await axios.get(`${API_URL}/transactions/revenue/by-unit`);
        setUnitRevenueRows(response.data || []);
      } catch (err) {
        console.error('Error fetching revenue by unit for dashboard insights:', err);
        setUnitRevenueRows([]);
      }
    };

    fetchRevenueByUnit();
  }, []);

  useEffect(() => {
    const updateSparklineWidth = () => {
      const nextWidth = sparklineContainerRef.current?.clientWidth;
      setSparklineWidth(nextWidth && nextWidth > 0 ? nextWidth : compactChartWidth);
    };

    updateSparklineWidth();

    if (typeof ResizeObserver !== 'undefined' && sparklineContainerRef.current) {
      const observer = new ResizeObserver(() => updateSparklineWidth());
      observer.observe(sparklineContainerRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateSparklineWidth);
    return () => window.removeEventListener('resize', updateSparklineWidth);
  }, [compactChartWidth]);

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

  const salesCards = useMemo(() => ([
    {
      periodLabel: "Yesterday's Sales",
      total: Number(
        (revenueSummary?.yesterday?.pc_rental_sales || 0)
        + (revenueSummary?.yesterday?.print_sales || 0)
        + (revenueSummary?.yesterday?.store_sales || 0)
      ),
      breakdown: {
        pcRental: Number(revenueSummary?.yesterday?.pc_rental_sales || 0),
        print: Number(revenueSummary?.yesterday?.print_sales || 0),
        store: Number(revenueSummary?.yesterday?.store_sales || 0),
      },
      iconColor: 'warning',
    },
    {
      periodLabel: "Today's Sales",
      total: Number(
        (revenueSummary?.today?.pc_rental_sales || 0)
        + (revenueSummary?.today?.print_sales || 0)
        + (revenueSummary?.today?.store_sales || 0)
      ),
      breakdown: {
        pcRental: Number(revenueSummary?.today?.pc_rental_sales || 0),
        print: Number(revenueSummary?.today?.print_sales || 0),
        store: Number(revenueSummary?.today?.store_sales || 0),
      },
      iconColor: 'primary',
    },
    {
      periodLabel: 'This Week Sales',
      total: Number(
        (revenueSummary?.week?.pc_rental_sales || 0)
        + (revenueSummary?.week?.print_sales || 0)
        + (revenueSummary?.week?.store_sales || 0)
      ),
      breakdown: {
        pcRental: Number(revenueSummary?.week?.pc_rental_sales || 0),
        print: Number(revenueSummary?.week?.print_sales || 0),
        store: Number(revenueSummary?.week?.store_sales || 0),
      },
      iconColor: 'success',
    },
  ]), [revenueSummary]);

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

  const yearlyOverviewData = useMemo(() => {
    if (monthlyBreakdown?.rows?.length) {
      return {
        year: monthlyBreakdown.year,
        rows: monthlyBreakdown.rows,
      };
    }

    return {
      year: monthlyRevenueData.year,
      rows: monthlyRevenueData.months.map((month, index) => ({
        month,
        total_sales: Number(monthlyRevenueData.revenues[index] || 0),
        pc_rental_sales: 0,
        print_sales: 0,
        store_sales: 0,
      })),
    };
  }, [monthlyBreakdown, monthlyRevenueData]);

  const roiDisplay = useMemo(() => {
    const roiPercent = opexSummary?.roi_percent;
    return {
      operatingRevenue: Number(opexSummary?.operating_revenue || 0),
      operatingExpense: Number(opexSummary?.operating_expense || 0),
      operatingProfit: Number(opexSummary?.operating_profit || 0),
      investedCapital: Number(opexSummary?.invested_capital || 0),
      roiPercent: Number.isFinite(roiPercent) ? roiPercent : null,
    };
  }, [opexSummary]);

  return (
    <Box>
      <Grid container sx={{ mb: 4, flexDirection: isMobile ? 'column' : 'row', alignItems: 'stretch', justifyContent: 'space-between' }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ overflow: 'visible' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0 }}>
                <ComputerIcon color="primary" sx={{ fontSize: 32, mr: 1.5 }} />
                <Typography color="text.secondary">Active Units</Typography>
              </Box>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isMobile ? 'column' : 'row' }}>
                <Box sx={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
                  <PieChart
                    series={[
                      {
                        innerRadius: 26,
                        outerRadius: 64,
                        cx: 70,
                        cy: 70,
                        data: [
                          { id: 0, value: activeUnits, label: 'Active', color: '#2e7d32' },
                          { id: 1, value: idleUnits, label: 'Idle', color: '#9e9e9e' },
                        ],
                      },
                    ]}
                    width={140}
                    height={140}
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
                    <Typography variant="body1">
                      {activeUnits} / {units.length}
                    </Typography>
                    {/* <Typography variant="caption" color="text.secondary">Active</Typography> */}
                  </Box>
                </Box>
                <Box sx={{ minWidth: 0, width: '100%' }}>
                  <Typography variant="body2" color="text.secondary">Most Used: {activeUnitsInsights.mostUsed}</Typography>
                  <Typography variant="body2" color="text.secondary">Less Active: {activeUnitsInsights.lessUsed}</Typography>
                  <Typography variant="body2" color="text.secondary">Inactive: {activeUnitsInsights.inactive}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2} sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2" gutterBottom>
                {salesCards[0].periodLabel}
              </Typography>
              <Typography variant="h5">Total: {formatPeso(salesCards[0].total)}</Typography>
              <SalesBreakdownPie breakdown={salesCards[0].breakdown} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2} sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2" gutterBottom>
                {salesCards[1].periodLabel}
              </Typography>
              <Typography variant="h5">Total: {formatPeso(salesCards[1].total)}</Typography>
              <SalesBreakdownPie breakdown={salesCards[1].breakdown} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2} sx={{ width: '100%', height: '100%' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, rowGap: 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography color="text.secondary" variant="body2" gutterBottom>
                  {salesCards[2].periodLabel}
                </Typography>
                <Typography variant="h5">Total: {formatPeso(salesCards[2].total)}</Typography>
                <SalesBreakdownPie breakdown={salesCards[2].breakdown} />
              </Box>
              {sparklineData.length > 0 && (
                <Box ref={sparklineContainerRef} sx={{ width: '100%' }}>
                  <SparkLineChart
                    height={40}
                    width={sparklineWidth}
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
        </Grid>

      </Grid>

      <Grid container spacing={2} sx={{ mb: 4, flexDirection: isMobile ? 'column' : 'row', alignItems: 'stretch', justifyContent: 'space-between' }}>
        <Grid size={8} >
          <Card elevation={2} sx={{height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom sx={{ mb: 0 }}>
                This Year Overview ({yearlyOverviewData.year})
              </Typography>
              {yearlyOverviewData.rows.length > 0 && (
                <BarChart
                  dataset={yearlyOverviewData.rows}
                  xAxis={[
                    {
                      scaleType: 'band',
                      dataKey: 'month',
                      tickLabelStyle: { fontSize: 12 },
                    },
                  ]}
                  series={[
                    {
                      dataKey: 'total_sales',
                      label: 'Total Sales',
                      color: 'rgb(137, 86, 255)',
                    },
                    {
                      dataKey: 'pc_rental_sales',
                      label: 'PC Rental',
                      stack: 'sales',
                      color: '#2E96FF',
                    },
                    {
                      dataKey: 'print_sales',
                      label: 'Print',
                      stack: 'sales',
                      color: '#FBC02D',
                    },
                    {
                      dataKey: 'store_sales',
                      label: 'Store',
                      stack: 'sales',
                      color: '#EF6C00',
                    },
                  ]}
                  height={180}
                  margin={{ top: 10, bottom: 0, left: 50, right: 10 }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={4} >
          <Card elevation={2} sx={{height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2" gutterBottom>
                OPEX ROI
              </Typography>
              <Typography variant="h5">
                {roiDisplay.roiPercent == null ? 'N/A' : `${formatNumber(roiDisplay.roiPercent)}%`}
              </Typography>
              <OpexBreakdownPie
                revenue={roiDisplay.operatingRevenue}
                expense={roiDisplay.operatingExpense}
                profit={roiDisplay.operatingProfit}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default AdminDashboard;
