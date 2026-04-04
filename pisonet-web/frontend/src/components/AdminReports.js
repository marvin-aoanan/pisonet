import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Box,
  Paper,
  Typography,
  Alert,
  LinearProgress,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { ChartsTooltipContainer, useAxesTooltip } from '@mui/x-charts/ChartsTooltip';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

function PcTooltipContent() {
  const tooltipData = useAxesTooltip();
  if (!tooltipData) return null;
  const visibleItems = tooltipData.flatMap(({ seriesItems }) =>
    seriesItems.filter((item) => item.formattedValue != null)
  );
  if (!visibleItems.length) return null;

  const totals = visibleItems.reduce(
    (acc, item) => {
      const text = String(item.formattedValue || '');
      const revenueMatch = text.match(/Revenue:\s*₱([\d.,-]+)/i);
      const hoursMatch = text.match(/Hours:\s*([\d.]+)h/i);

      const revenue = revenueMatch ? Number(revenueMatch[1].replace(/,/g, '')) : 0;
      const hours = hoursMatch ? Number(hoursMatch[1]) : 0;

      return {
        revenue: acc.revenue + (Number.isFinite(revenue) ? revenue : 0),
        hours: acc.hours + (Number.isFinite(hours) ? hours : 0),
      };
    },
    { revenue: 0, hours: 0 }
  );

  return (
    <Paper sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
      {visibleItems.map((item) => (
        <Box key={item.seriesId} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: item.color, flexShrink: 0 }} />
          <Typography variant="body2" color="text.secondary">
            {item.formattedValue}
          </Typography>
        </Box>
      ))}
      <Box sx={{ borderTop: 1, borderColor: 'divider', px: 1.5, py: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Total Revenue: ₱{totals.revenue.toFixed(2)}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Total Hours: {formatHoursWithPadding(totals.hours)}
        </Typography>
      </Box>
    </Paper>
  );
}

function PcTooltip(props) {
  return (
    <ChartsTooltipContainer {...props}>
      <PcTooltipContent />
    </ChartsTooltipContainer>
  );
}

const PC_CHART_COLORS = [
  '#1565c0',
  '#2e7d32',
  '#ef6c00',
  '#6a1b9a',
  '#c62828',
  '#00838f',
  '#5d4037',
  '#283593',
  '#ad1457',
  '#558b2f',
  '#0277bd',
  '#ff8f00',
];

function startOfWeek(date) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value;
}

function isWithinSelectedWindow(dateValue, period) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();

  if (period === 'daily') {
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return date >= weekStart && date < weekEnd;
  }

  if (period === 'weekly') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  if (period === 'monthly' || period === 'quarterly') {
    return date.getFullYear() === now.getFullYear();
  }

  return true;
}

function getActiveWindowLabel(period) {
  if (period === 'daily') return 'This Week';
  if (period === 'weekly') return 'This Month';
  if (period === 'monthly' || period === 'quarterly') return 'This Year';
  return 'All Time';
}

function getPeriodBucketKey(dateObj, period) {
  if (period === 'weekly') {
    const monday = new Date(dateObj);
    const day = monday.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    monday.setDate(monday.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().slice(0, 10);
  }

  if (period === 'monthly') {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
  }

  if (period === 'quarterly') {
    const quarter = Math.floor(dateObj.getMonth() / 3) + 1;
    return `${dateObj.getFullYear()}-Q${quarter}`;
  }

  return `${dateObj.getFullYear()}`;
}

function formatHoursWithPadding(hoursValue) {
  const fixed = Number(hoursValue || 0).toFixed(2);
  const [whole, decimal] = fixed.split('.');
  return `${String(whole).padStart(2, '0')}.${decimal}h`;
}

function AdminReports() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dailyByUnitRows, setDailyByUnitRows] = useState([]);
  const [electricityRows, setElectricityRows] = useState([]);
  const [electricityByUnitRows, setElectricityByUnitRows] = useState([]);
  const [period, setPeriod] = useState('daily');

  useEffect(() => {
    const fetchRevenueByUnit = async () => {
      try {
        const response = await axios.get(`${API_URL}/transactions/revenue/by-unit`);
        setRows(response.data || []);
      } catch (err) {
        console.error('Error fetching revenue by unit:', err);
        setError('Failed to load revenue data.');
      } finally {
        setLoading(false);
      }
    };

    fetchRevenueByUnit();
  }, []);

  useEffect(() => {
    const fetchDailyRevenueByUnit = async () => {
      try {
        const response = await axios.get(`${API_URL}/transactions/revenue/daily-by-unit?days=365`);
        setDailyByUnitRows(response.data || []);
      } catch (err) {
        console.error('Error fetching daily revenue by unit (endpoint may not exist yet):', err);
        setDailyByUnitRows([]);
      }
    };

    fetchDailyRevenueByUnit();
  }, []);

  useEffect(() => {
    const fetchElectricity = async () => {
      try {
        const [dailyResponse, byUnitResponse] = await Promise.all([
          axios.get(`${API_URL}/transactions/electricity/daily?days=365`),
          axios.get(`${API_URL}/transactions/electricity/by-unit`),
        ]);
        setElectricityRows(dailyResponse.data || []);
        setElectricityByUnitRows(byUnitResponse.data || []);
      } catch (err) {
        console.error('Error fetching electricity usage:', err);
      }
    };

    fetchElectricity();
  }, []);

  const electricityHoursByUnit = useMemo(
    () => Object.fromEntries(
      electricityByUnitRows.map((row) => [row.name || `PC ${row.id}`, Number(row.estimated_usage_hours || 0)])
    ),
    [electricityByUnitRows]
  );

  const chartData = rows.map((row) => ({
    pc: row.name || `PC ${row.id}`,
    revenue: Number(row.revenue || 0),
    usage_hours: Number((row.usage_hours ?? electricityHoursByUnit[row.name || `PC ${row.id}`]) || 0),
  }));

  const totalChartRevenue = useMemo(
    () => chartData.reduce((sum, row) => sum + Number(row.revenue || 0), 0),
    [chartData]
  );

  const totalChartHours = useMemo(
    () => chartData.reduce((sum, row) => sum + Number(row.usage_hours || 0), 0),
    [chartData]
  );

  const electricitySeries = useMemo(() => {
    const normalized = electricityRows
      .map((row) => ({
        date: row.date,
        estimated_kwh: Number(row.estimated_kwh || 0),
        estimated_cost: Number(row.estimated_cost || 0),
      }))
      .filter((row) => isWithinSelectedWindow(row.date, period))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (period === 'daily') {
      return normalized.map((row) => ({
        label: row.date,
        estimated_kwh: row.estimated_kwh,
        estimated_cost: row.estimated_cost,
      }));
    }

    const buckets = new Map();

    normalized.forEach((row) => {
      const dateObj = new Date(row.date);
      if (Number.isNaN(dateObj.getTime())) return;

      const key = getPeriodBucketKey(dateObj, period);

      const existing = buckets.get(key) || { estimated_kwh: 0, estimated_cost: 0 };
      buckets.set(key, {
        estimated_kwh: existing.estimated_kwh + row.estimated_kwh,
        estimated_cost: existing.estimated_cost + row.estimated_cost,
      });
    });

    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, values]) => ({
        label,
        estimated_kwh: values.estimated_kwh,
        estimated_cost: values.estimated_cost,
      }));
  }, [electricityRows, period]);

  const configuredWattage = electricityRows[0]?.estimated_pc_wattage || electricityByUnitRows[0]?.estimated_pc_wattage || 200;
  const configuredRate = electricityRows[0]?.estimated_kwh_rate || electricityByUnitRows[0]?.estimated_kwh_rate || 12;

  const totalEstimatedKwh = useMemo(
    () => electricityByUnitRows.reduce((sum, row) => sum + Number(row.estimated_kwh || 0), 0),
    [electricityByUnitRows]
  );

  const totalEstimatedCost = useMemo(
    () => electricityByUnitRows.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0),
    [electricityByUnitRows]
  );

  const electricityByUnitChartData = useMemo(
    () => electricityByUnitRows.map((row) => ({
      pc: row.name || `PC ${row.id}`,
      estimated_kwh: Number(row.estimated_kwh || 0),
      estimated_cost: Number(row.estimated_cost || 0),
    })),
    [electricityByUnitRows]
  );

  const dailyByUnitChartData = useMemo(() => {
    if (dailyByUnitRows.length === 0) return [];

    const normalized = dailyByUnitRows
      .map((row) => ({
        date: row.date,
        pc: row.name || `PC ${row.id}`,
        revenue: Number(row.daily_revenue || 0),
        hours: Number(row.daily_hours || 0),
      }))
      .filter((row) => isWithinSelectedWindow(row.date, period))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (period === 'daily') {
      const buckets = new Map();
      normalized.forEach((row) => {
        if (!buckets.has(row.date)) {
          buckets.set(row.date, { label: row.date });
        }
        const data = buckets.get(row.date);
        data[`${row.pc} Revenue`] = row.revenue;
        data[`${row.pc} Hours`] = row.hours;
      });
      return Array.from(buckets.values());
    }

    const buckets = new Map();
    normalized.forEach((row) => {
      const dateObj = new Date(row.date);
      if (Number.isNaN(dateObj.getTime())) return;

      const key = getPeriodBucketKey(dateObj, period);

      if (!buckets.has(key)) {
        buckets.set(key, { label: key });
      }
      const data = buckets.get(key);
      const revenueKey = `${row.pc} Revenue`;
      const hoursKey = `${row.pc} Hours`;
      data[revenueKey] = (data[revenueKey] || 0) + row.revenue;
      data[hoursKey] = (data[hoursKey] || 0) + row.hours;
    });

    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, values]) => values);
  }, [dailyByUnitRows, period]);

  const uniquePCs = useMemo(() => {
    const pcs = new Set();
    dailyByUnitChartData.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (key.endsWith(' Revenue')) {
          pcs.add(key.replace(' Revenue', ''));
        }
      });
    });
    return Array.from(pcs).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10);
      const numB = parseInt(b.replace(/\D/g, ''), 10);
      return (isNaN(numA) ? 0 : numA) - (isNaN(numB) ? 0 : numB);
    });
  }, [dailyByUnitChartData]);

  const pcColorMap = useMemo(
    () => Object.fromEntries(uniquePCs.map((pc, index) => [pc, PC_CHART_COLORS[index % PC_CHART_COLORS.length]])),
    [uniquePCs]
  );

  const dailyByUnitSeries = useMemo(() => {
    const series = [];
    uniquePCs.forEach((pc) => {
      series.push({
        dataKey: `${pc} Revenue`,
        label: '',
        color: pcColorMap[pc],
        yAxisId: 'revenueAxis',
        valueFormatter: (value, context) => {
          const index = context?.dataIndex;
          const point = typeof index === 'number' ? dailyByUnitChartData[index] : null;
          const revenue = Number(value || 0).toFixed(2);
          const hours = formatHoursWithPadding(point?.[`${pc} Hours`] || 0);
          return `${pc} - Revenue: ₱${revenue} | Hours: ${hours}`;
        },
      });
      series.push({
        dataKey: `${pc} Hours`,
        label: `${pc} Hours`,
        color: pcColorMap[pc],
        yAxisId: 'hoursAxis',
        valueFormatter: () => null,
      });
    });
    return series;
  }, [dailyByUnitChartData, pcColorMap, uniquePCs]);

  const activeWindowLabel = useMemo(() => getActiveWindowLabel(period), [period]);

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Reports
      </Typography>

      <Paper sx={{ p: 3 }} elevation={2}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="subtitle1">
            PC Revenue and Hours Over Time ({activeWindowLabel})
          </Typography>
          <ToggleButtonGroup
            size="small"
            value={period}
            exclusive
            onChange={(event, next) => {
              if (next) setPeriod(next);
            }}
            aria-label="pc revenue period"
          >
            <ToggleButton value="daily">Daily</ToggleButton>
            <ToggleButton value="weekly">Weekly</ToggleButton>
            <ToggleButton value="monthly">Monthly</ToggleButton>
            <ToggleButton value="quarterly">Quarterly</ToggleButton>
            <ToggleButton value="yearly">Yearly</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {dailyByUnitChartData.length === 0 && (
          <Alert severity="info">
            Daily revenue by unit data is not available yet. Please ensure the `/transactions/revenue/daily-by-unit` endpoint is available on the backend.
          </Alert>
        )}

        {dailyByUnitChartData.length > 0 && dailyByUnitSeries.length > 0 && (
          <BarChart
            hideLegend
            slots={{ tooltip: PcTooltip }}
            dataset={dailyByUnitChartData}
            xAxis={[{ scaleType: 'band', dataKey: 'label' }]}
            slotProps={{
              legend: {
                position: { vertical: 'bottom', horizontal: 'middle' },
              },
            }}
            yAxis={[
              { id: 'revenueAxis', label: 'Revenue (₱)' },
              { id: 'hoursAxis', label: 'Hours', position: 'right' },
            ]}
            series={dailyByUnitSeries}
            height={480}
            margin={{ bottom: 36 }}
          />
        )}

        {dailyByUnitSeries.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1.5, mt: 0.25 }}>
            {uniquePCs.map((pc) => (
              <Box key={pc} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '3px',
                    backgroundColor: pcColorMap[pc],
                    flexShrink: 0,
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  {pc}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 3 }} elevation={2}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="subtitle1">
            PC vs Revenue and Hours
          </Typography>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="body2" color="text.secondary">
              Total Hours: {totalChartHours.toFixed(2)} h
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Estimated Revenue: ₱{totalChartRevenue.toFixed(2)}
            </Typography>
          </Box>
        </Box>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!loading && !error && (
          <BarChart
            dataset={chartData}
            xAxis={[{ scaleType: 'band', dataKey: 'pc' }]}
            slotProps={{
              legend: {
                position: { vertical: 'bottom', horizontal: 'middle' },
              },
            }}
            yAxis={[
              { id: 'revenueAxis', label: 'Revenue (₱)' },
              { id: 'hoursAxis', label: 'Hours', position: 'right' },
            ]}
            series={[
              {
                dataKey: 'revenue',
                label: 'Revenue (₱)',
                yAxisId: 'revenueAxis',
                valueFormatter: (value) => `₱${Number(value || 0).toFixed(2)}`,
              },
              {
                dataKey: 'usage_hours',
                label: 'Hours',
                yAxisId: 'hoursAxis',
                valueFormatter: (value) => `${Number(value || 0).toFixed(2)} h`,
              }
            ]}
            height={320}
          />
        )}
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }} elevation={2}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="subtitle1">
            PC vs Estimated Electricity Consumption
          </Typography>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="body2" color="text.secondary">
              Total Estimated Consumption: {totalEstimatedKwh.toFixed(2)} kWh
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Estimated Cost: ₱{totalEstimatedCost.toFixed(2)}
            </Typography>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Includes estimated cost at ₱{Number(configuredRate).toFixed(2)}/kWh from Settings.
        </Typography>
        {!electricityByUnitRows.length && <LinearProgress sx={{ mb: 2 }} />}
        {electricityByUnitChartData.length > 0 && (
          <BarChart
            dataset={electricityByUnitChartData}
            xAxis={[{ scaleType: 'band', dataKey: 'pc' }]}
            slotProps={{
              legend: {
                position: { vertical: 'bottom', horizontal: 'middle' },
              },
            }}
            series={[
              {
                dataKey: 'estimated_kwh',
                label: 'Estimated Consumption (kWh)',
                valueFormatter: (value) => {
                  const kwh = Number(value || 0);
                  return `${kwh.toFixed(2)} kWh`;
                }
              },
              {
                dataKey: 'estimated_cost',
                label: `Estimated Cost (₱ @ ${Number(configuredRate).toFixed(2)}/kWh)`,
                valueFormatter: (value) => {
                  const cost = Number(value || 0);
                  return `₱${cost.toFixed(2)}`;
                }
              }
            ]}
            height={320}
          />
        )}
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }} elevation={2}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box>
            <Typography variant="subtitle1">
              Estimated Electricity Consumption ({activeWindowLabel})
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Based on purchased/used PC time and configured wattage of {configuredWattage}W per PC at ₱{Number(configuredRate).toFixed(2)}/kWh from Settings.
            </Typography>
          </Box>
          <ToggleButtonGroup
            size="small"
            value={period}
            exclusive
            onChange={(event, next) => {
              if (next) setPeriod(next);
            }}
            aria-label="electricity period"
          >
            <ToggleButton value="daily">Daily</ToggleButton>
            <ToggleButton value="weekly">Weekly</ToggleButton>
            <ToggleButton value="monthly">Monthly</ToggleButton>
            <ToggleButton value="quarterly">Quarterly</ToggleButton>
            <ToggleButton value="yearly">Yearly</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {!electricityRows.length && <LinearProgress sx={{ mb: 2 }} />}

        {electricitySeries.length > 0 && (
          <BarChart
            dataset={electricitySeries}
            xAxis={[{ scaleType: 'band', dataKey: 'label' }]}
            slotProps={{
              legend: {
                position: { vertical: 'bottom', horizontal: 'middle' },
              },
            }}
            series={[{
              dataKey: 'estimated_kwh',
              label: 'Estimated Consumption (kWh)',
              valueFormatter: (value) => {
                const kwh = Number(value || 0);
                return `${kwh.toFixed(2)} kWh`;
              }
            }, {
              dataKey: 'estimated_cost',
              label: `Estimated Cost (₱ @ ${Number(configuredRate).toFixed(2)}/kWh)`,
              valueFormatter: (value) => {
                const cost = Number(value || 0);
                return `₱${cost.toFixed(2)}`;
              }
            }]}
            height={320}
          />
        )}
      </Paper>

    </Box>
  );
}

export default AdminReports;
