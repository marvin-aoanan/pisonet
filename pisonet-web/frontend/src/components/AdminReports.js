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

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

function AdminReports() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dailyRows, setDailyRows] = useState([]);
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

  const chartData = rows.map((row) => ({
    pc: row.name || `PC ${row.id}`,
    revenue: Number(row.revenue || 0),
  }));

  const dailySeries = useMemo(() => {
    const normalized = dailyRows
      .map((row) => ({
        date: row.date,
        revenue: Number(row.daily_revenue || 0),
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (period === 'daily') {
      return normalized.map((row) => ({
        label: row.date,
        revenue: row.revenue,
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

      const existing = buckets.get(key) || 0;
      buckets.set(key, existing + row.revenue);
    });

    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, revenue]) => ({ label, revenue }));
  }, [dailyRows, period]);

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Reports
      </Typography>
      <Paper sx={{ p: 3 }} elevation={2}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          PC vs Revenue
        </Typography>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!loading && !error && (
          <BarChart
            dataset={chartData}
            xAxis={[{ scaleType: 'band', dataKey: 'pc' }]}
            series={[{ dataKey: 'revenue', label: 'Revenue (₱)' }]}
            height={320}
          />
        )}
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }} elevation={2}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="subtitle1">
            Revenue Over Time
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
            series={[{ dataKey: 'revenue', label: 'Revenue (₱)' }]}
            height={320}
          />
        )}
      </Paper>
    </Box>
  );
}

export default AdminReports;
