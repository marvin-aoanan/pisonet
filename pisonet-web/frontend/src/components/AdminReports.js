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
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

function AdminReports() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dailyRows, setDailyRows] = useState([]);
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
    const fetchDailyRevenue = async () => {
      try {
        const response = await axios.get(`${API_URL}/transactions/revenue/daily?days=365`);
        setDailyRows(response.data || []);
      } catch (err) {
        console.error('Error fetching daily revenue:', err);
      }
    };

    fetchDailyRevenue();
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

  const electricityHoursByDate = useMemo(
    () => Object.fromEntries(
      electricityRows.map((row) => [row.date, Number(row.estimated_usage_hours || 0)])
    ),
    [electricityRows]
  );

  const chartData = rows.map((row) => ({
    pc: row.name || `PC ${row.id}`,
    revenue: Number(row.revenue || 0),
    usage_hours: Number((row.usage_hours ?? electricityHoursByUnit[row.name || `PC ${row.id}`]) || 0),
  }));

  const dailySeries = useMemo(() => {
    const normalized = dailyRows
      .map((row) => ({
        date: row.date,
        revenue: Number(row.daily_revenue || 0),
        hours: Number((row.daily_hours ?? electricityHoursByDate[row.date]) || 0),
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (period === 'daily') {
      return normalized.map((row) => ({
        label: row.date,
        revenue: row.revenue,
        hours: row.hours,
      }));
    }

    const buckets = new Map();

    normalized.forEach((row) => {
      const dateObj = new Date(row.date);
      if (Number.isNaN(dateObj.getTime())) return;

      let key;
      if (period === 'weekly') {
        const monday = new Date(dateObj);
        const day = monday.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        monday.setDate(monday.getDate() + diff);
        monday.setHours(0, 0, 0, 0);
        key = monday.toISOString().slice(0, 10);
      } else {
        const month = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        key = month;
      }

      const existing = buckets.get(key) || { revenue: 0, hours: 0 };
      buckets.set(key, {
        revenue: existing.revenue + row.revenue,
        hours: existing.hours + row.hours,
      });
    });

    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, values]) => ({ label, revenue: values.revenue, hours: values.hours }));
  }, [dailyRows, electricityHoursByDate, period]);

  const electricitySeries = useMemo(() => {
    const normalized = electricityRows
      .map((row) => ({
        date: row.date,
        estimated_kwh: Number(row.estimated_kwh || 0),
        estimated_cost: Number(row.estimated_cost || 0),
      }))
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

      let key;
      if (period === 'weekly') {
        const monday = new Date(dateObj);
        const day = monday.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        monday.setDate(monday.getDate() + diff);
        monday.setHours(0, 0, 0, 0);
        key = monday.toISOString().slice(0, 10);
      } else {
        key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      }

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

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Reports
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Total Estimated Consumption
              </Typography>
              <Typography variant="h4">
                {totalEstimatedKwh.toFixed(2)} kWh
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Estimated Electricity Cost
              </Typography>
              <Typography variant="h4">
                ₱{totalEstimatedCost.toFixed(2)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Based on ₱{Number(configuredRate).toFixed(2)} per kWh
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3 }} elevation={2}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          PC vs Revenue and Hours
        </Typography>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!loading && !error && (
          <BarChart
            dataset={chartData}
            xAxis={[{ scaleType: 'band', dataKey: 'pc' }]}
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
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          PC vs Estimated Electricity Consumption
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Includes estimated cost at ₱{Number(configuredRate).toFixed(2)}/kWh from Settings.
        </Typography>
        {!electricityByUnitRows.length && <LinearProgress sx={{ mb: 2 }} />}
        {electricityByUnitChartData.length > 0 && (
          <BarChart
            dataset={electricityByUnitChartData}
            xAxis={[{ scaleType: 'band', dataKey: 'pc' }]}
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
          <Typography variant="subtitle1">
            Revenue and Hours Over Time
          </Typography>
          <ToggleButtonGroup
            size="small"
            value={period}
            exclusive
            onChange={(event, next) => {
              if (next) setPeriod(next);
            }}
            aria-label="revenue period"
          >
            <ToggleButton value="daily">Daily</ToggleButton>
            <ToggleButton value="weekly">Weekly</ToggleButton>
            <ToggleButton value="monthly">Monthly</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {!dailyRows.length && <LinearProgress sx={{ mb: 2 }} />}

        {dailySeries.length > 0 && (
          <BarChart
            dataset={dailySeries}
            xAxis={[{ scaleType: 'band', dataKey: 'label' }]}
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
                dataKey: 'hours',
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box>
            <Typography variant="subtitle1">
              Estimated Electricity Consumption
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
          </ToggleButtonGroup>
        </Box>

        {!electricityRows.length && <LinearProgress sx={{ mb: 2 }} />}

        {electricitySeries.length > 0 && (
          <BarChart
            dataset={electricitySeries}
            xAxis={[{ scaleType: 'band', dataKey: 'label' }]}
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
