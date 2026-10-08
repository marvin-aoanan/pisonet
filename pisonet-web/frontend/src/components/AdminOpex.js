import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  LinearProgress,
  MenuItem,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { BarChart } from '@mui/x-charts/BarChart';
import CustomGridToolbar from './CustomGridToolbar';
import { formatNumber, formatPeso } from '../utils/currency';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

const FALLBACK_METADATA = {
  ledger_groups: [
    { value: 'operating', label: 'Operating' },
    { value: 'capital', label: 'Capital' },
    { value: 'financing', label: 'Financing' },
    { value: 'asset', label: 'Asset' },
  ],
  entry_type_options: {
    operating: ['rent', 'utilities', 'internet', 'salary', 'maintenance', 'supplies', 'inventory_purchase', 'other_opex'],
    capital: ['initial_capital', 'owner_topup', 'partner_investment', 'capital_withdrawal'],
    financing: ['loan_proceeds', 'loan_payment', 'interest_payment', 'other_financing'],
    asset: ['pc_purchase', 'printer_purchase', 'renovation', 'furniture', 'equipment_upgrade', 'other_asset'],
  },
  categories: ['Utilities', 'Rent', 'Supplies', 'Maintenance', 'Salaries', 'Internet', 'Other'],
  fund_sources: ['Owner Top-up', 'Loan', 'Refund', 'Other'],
};

function formatTypeLabel(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getDefaultDirectionForGroup(group) {
  if (group === 'capital') {
    return 'fund_in';
  }
  if (group === 'financing') {
    return 'fund_in';
  }
  return 'expense';
}

function buildCurrentLocalDateTimeInput() {
  return toLocalDateTimeInput(new Date().toISOString());
}

const initialForm = {
  direction: 'expense',
  ledger_group: 'operating',
  entry_type: 'other_opex',
  category: '',
  source_type: '',
  source_or_payee: '',
  description: '',
  amount: '',
  entry_date: buildCurrentLocalDateTimeInput(),
};

function toLocalDateTimeInput(isoValue) {
  if (!isoValue) {
    return '';
  }

  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const timezoneOffsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function formatMoney(value) {
  return formatPeso(value);
}

function toCsvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsvFile(filename, headers, rows) {
  const headerLine = headers.map((header) => toCsvCell(header)).join(',');
  const rowLines = rows.map((row) => row.map((cell) => toCsvCell(cell)).join(','));
  const csvContent = [headerLine, ...rowLines].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function AdminOpex({ adminPassword }) {
  const [activeTab, setActiveTab] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({
    total_incoming: 0,
    total_expense: 0,
    net_cashflow: 0,
    operating_revenue: 0,
    cogs: 0,
    gross_profit: 0,
    operating_expense: 0,
    operating_profit: 0,
    invested_capital: 0,
    capital_outflow: 0,
    financing_inflow: 0,
    financing_outflow: 0,
    asset_expense: 0,
    roi_percent: null,
    payback_progress_percent: null,
    by_category: [],
    by_entry_type: [],
  });
  const [timelineRows, setTimelineRows] = useState([]);
  const [metadata, setMetadata] = useState(FALLBACK_METADATA);

  const [filters, setFilters] = useState({
    direction: 'all',
    ledger_group: 'all',
    entry_type: 'all',
    status: 'active',
    category: 'all',
    startDate: '',
    endDate: '',
    q: '',
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const [snackbar, setSnackbar] = useState({ open: false, severity: 'success', message: '' });

  const authHeaders = useMemo(() => ({ headers: { 'x-admin-password': adminPassword } }), [adminPassword]);

  const showToast = (severity, message) => {
    setSnackbar({ open: true, severity, message });
  };

  const categories = metadata.categories || [];
  const fundSources = metadata.fund_sources || [];
  const ledgerGroups = metadata.ledger_groups || FALLBACK_METADATA.ledger_groups;

  const currentEntryTypeOptions = useMemo(() => {
    const group = formData.ledger_group || 'operating';
    return metadata.entry_type_options?.[group] || FALLBACK_METADATA.entry_type_options[group] || [];
  }, [formData.ledger_group, metadata.entry_type_options]);

  const filterEntryTypeOptions = useMemo(() => {
    if (filters.ledger_group !== 'all') {
      return metadata.entry_type_options?.[filters.ledger_group] || FALLBACK_METADATA.entry_type_options[filters.ledger_group] || [];
    }

    const allValues = Object.values(metadata.entry_type_options || FALLBACK_METADATA.entry_type_options).flat();
    return Array.from(new Set(allValues));
  }, [filters.ledger_group, metadata.entry_type_options]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', '300');
    params.set('sort_by', 'entry_date');
    params.set('sort_order', 'desc');

    if (filters.direction !== 'all') {
      params.set('direction', filters.direction);
    }

    if (filters.ledger_group !== 'all') {
      params.set('ledger_group', filters.ledger_group);
    }

    if (filters.entry_type !== 'all') {
      params.set('entry_type', filters.entry_type);
    }

    if (filters.status !== 'all') {
      params.set('status', filters.status);
    }

    if (filters.category !== 'all') {
      params.set('category', filters.category);
    }

    if (filters.startDate) {
      params.set('start_date', `${filters.startDate}T00:00:00.000`);
    }

    if (filters.endDate) {
      params.set('end_date', `${filters.endDate}T23:59:59.999`);
    }

    if (filters.q.trim()) {
      params.set('q', filters.q.trim());
    }

    return params;
  }, [filters]);

  const fetchMetadata = useCallback(async () => {
    if (!adminPassword) {
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/opex/metadata`, authHeaders);
      setMetadata(response.data?.data || FALLBACK_METADATA);
    } catch (err) {
      console.error('Error loading opex metadata:', err);
      showToast('warning', 'Failed to load OPEX metadata');
      setMetadata(FALLBACK_METADATA);
    }
  }, [adminPassword, authHeaders]);

  const fetchEntries = useCallback(async () => {
    if (!adminPassword) {
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/opex?${queryParams.toString()}`, authHeaders);
      setRows(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (err) {
      console.error('Error loading opex entries:', err);
      showToast('error', err.response?.data?.error?.message || err.response?.data?.error || 'Failed to load OPEX entries');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [adminPassword, authHeaders, queryParams]);

  const fetchSummary = useCallback(async () => {
    if (!adminPassword) {
      return;
    }

    const params = new URLSearchParams();
    if (filters.startDate) {
      params.set('start_date', `${filters.startDate}T00:00:00.000`);
    }
    if (filters.endDate) {
      params.set('end_date', `${filters.endDate}T23:59:59.999`);
    }

    try {
      const response = await axios.get(`${API_URL}/opex/summary?${params.toString()}`, authHeaders);
      setSummary(response.data?.data || {
        total_incoming: 0,
        total_expense: 0,
        net_cashflow: 0,
        operating_revenue: 0,
        cogs: 0,
        gross_profit: 0,
        operating_expense: 0,
        operating_profit: 0,
        invested_capital: 0,
        capital_outflow: 0,
        financing_inflow: 0,
        financing_outflow: 0,
        asset_expense: 0,
        roi_percent: null,
        payback_progress_percent: null,
        by_category: [],
        by_entry_type: [],
      });
    } catch (err) {
      console.error('Error loading opex summary:', err);
      setSummary({
        total_incoming: 0,
        total_expense: 0,
        net_cashflow: 0,
        operating_revenue: 0,
        cogs: 0,
        gross_profit: 0,
        operating_expense: 0,
        operating_profit: 0,
        invested_capital: 0,
        capital_outflow: 0,
        financing_inflow: 0,
        financing_outflow: 0,
        asset_expense: 0,
        roi_percent: null,
        payback_progress_percent: null,
        by_category: [],
        by_entry_type: [],
      });
    }
  }, [adminPassword, authHeaders, filters.endDate, filters.startDate]);

  const fetchTimeline = useCallback(async () => {
    if (!adminPassword) {
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/opex/timeline?days=30`, authHeaders);
      setTimelineRows(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (err) {
      console.error('Error loading opex timeline:', err);
      setTimelineRows([]);
    }
  }, [adminPassword, authHeaders]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  const openCreate = () => {
    setEditingEntry(null);
    setFormData({
      ...initialForm,
      ledger_group: 'operating',
      entry_type: (metadata.entry_type_options?.operating || FALLBACK_METADATA.entry_type_options.operating)[0] || 'other_opex',
      category: categories[0] || '',
      source_type: fundSources[0] || '',
      entry_date: buildCurrentLocalDateTimeInput(),
    });
    setFormOpen(true);
  };

  const openEdit = (entry) => {
    setEditingEntry(entry);
    setFormData({
      direction: entry.direction || 'expense',
      ledger_group: entry.ledger_group || 'operating',
      entry_type: entry.entry_type || 'other_opex',
      category: entry.category || '',
      source_type: entry.source_type || '',
      source_or_payee: entry.source_or_payee || '',
      description: entry.description || '',
      amount: String(entry.amount || ''),
      entry_date: toLocalDateTimeInput(entry.entry_date),
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      direction: String(formData.direction || '').trim(),
      ledger_group: String(formData.ledger_group || '').trim(),
      entry_type: String(formData.entry_type || '').trim(),
      category: String(formData.category || '').trim(),
      source_type: String(formData.source_type || '').trim() || null,
      source_or_payee: String(formData.source_or_payee || '').trim() || null,
      description: String(formData.description || '').trim() || null,
      amount: Number(formData.amount),
      entry_date: new Date(formData.entry_date).toISOString(),
      changed_by: 'Admin',
      created_by: 'Admin',
    };

    if (!payload.ledger_group) {
      showToast('error', 'Ledger group is required');
      return;
    }

    if (!payload.entry_type) {
      showToast('error', 'Entry type is required');
      return;
    }

    if (!payload.category) {
      showToast('error', 'Category is required');
      return;
    }

    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      showToast('error', 'Amount must be a positive number');
      return;
    }

    if (Number.isNaN(new Date(formData.entry_date).getTime())) {
      showToast('error', 'Entry date is required');
      return;
    }

    setSaving(true);
    try {
      if (editingEntry?.id) {
        await axios.put(`${API_URL}/opex/${editingEntry.id}`, payload, authHeaders);
        showToast('success', 'OPEX entry updated');
      } else {
        await axios.post(`${API_URL}/opex`, payload, authHeaders);
        showToast('success', 'OPEX entry created');
      }

      setFormOpen(false);
      await Promise.all([fetchEntries(), fetchSummary(), fetchTimeline()]);
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || err.response?.data?.error || 'Failed to save OPEX entry');
    } finally {
      setSaving(false);
    }
  };

  const openVoidDialog = (entry) => {
    setVoidTarget(entry);
    setVoidReason('');
    setVoidDialogOpen(true);
  };

  const handleVoid = async () => {
    if (!voidTarget?.id) {
      return;
    }

    if (!voidReason.trim()) {
      showToast('error', 'Void reason is required');
      return;
    }

    setVoiding(true);
    try {
      await axios.post(`${API_URL}/opex/${voidTarget.id}/void`, {
        reason: voidReason.trim(),
        voided_by: 'Admin',
      }, authHeaders);

      showToast('success', 'Entry voided');
      setVoidDialogOpen(false);
      await Promise.all([fetchEntries(), fetchSummary(), fetchTimeline()]);
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || err.response?.data?.error || 'Failed to void entry');
    } finally {
      setVoiding(false);
    }
  };

  const exportCsv = () => {
    const headers = ['Reference', 'Date', 'Direction', 'Ledger Group', 'Entry Type', 'Category', 'Source Type', 'Source/Payee', 'Amount', 'Status', 'Description'];
    const csvRows = rows.map((row) => [
      row.reference_no,
      row.entry_date,
      row.direction,
      row.ledger_group,
      row.entry_type,
      row.category,
      row.source_type || '',
      row.source_or_payee || '',
      formatMoney(row.amount),
      row.status,
      row.description || '',
    ]);

    downloadCsvFile(`opex-ledger-${new Date().toISOString().slice(0, 10)}.csv`, headers, csvRows);
    showToast('success', 'CSV exported');
  };

  const columns = [
    {
      field: 'entry_date',
      headerName: 'Date',
      width: 170,
      valueGetter: (value, row) => row.entry_date || '',
      renderCell: (params) => (
        <Typography variant="body2">{params.row.entry_date ? new Date(params.row.entry_date).toLocaleString() : '-'}</Typography>
      ),
    },
    {
      field: 'reference_no',
      headerName: 'Reference',
      minWidth: 180,
      flex: 1,
    },
    {
      field: 'direction',
      headerName: 'Direction',
      width: 130,
      renderCell: (params) => (
        <Chip
          size="small"
          label={params.value === 'fund_in' ? 'Incoming' : 'Expense'}
          color={params.value === 'fund_in' ? 'success' : 'warning'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'ledger_group',
      headerName: 'Ledger Group',
      width: 140,
      renderCell: (params) => (
        <Chip size="small" label={formatTypeLabel(params.value)} variant="outlined" />
      ),
    },
    {
      field: 'entry_type',
      headerName: 'Entry Type',
      width: 170,
      renderCell: (params) => (
        <Typography variant="body2" color="text.secondary">{formatTypeLabel(params.value)}</Typography>
      ),
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 150,
    },
    {
      field: 'source_or_payee',
      headerName: 'Source/Payee',
      minWidth: 170,
      flex: 1,
      renderCell: (params) => (
        <Typography variant="body2" color="text.secondary" noWrap title={params.value || ''}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'amount',
      headerName: 'Amount',
      width: 130,
      type: 'number',
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => (
        <Typography
          sx={{
            width: '100%',
            textAlign: 'right',
            fontWeight: 700,
            color: params.row.direction === 'fund_in' ? 'success.main' : 'warning.main',
          }}
        >
          {params.row.direction === 'fund_in' ? '+' : '-'}{formatMoney(Math.abs(Number(params.value || 0)))}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip
          size="small"
          label={params.value === 'voided' ? 'Voided' : 'Active'}
          color={params.value === 'voided' ? 'default' : 'primary'}
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 200,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => openEdit(params.row)}
            disabled={params.row.status === 'voided'}
          >
            Edit
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={() => openVoidDialog(params.row)}
            disabled={params.row.status === 'voided'}
          >
            Void
          </Button>
        </Stack>
      ),
    },
  ];

  const timelineDataset = useMemo(() => {
    return (timelineRows || []).map((item) => ({
      date: item.date,
      total_incoming: Number(item.total_incoming || 0),
      total_expense: Number(item.total_expense || 0),
      net_cashflow: Number(item.net_cashflow || 0),
      operating_revenue: Number(item.operating_revenue || 0),
      operating_expense: Number(item.operating_expense || 0),
      operating_profit: Number(item.operating_profit || 0),
    }));
  }, [timelineRows]);

  const topOperatingCategories = useMemo(() => {
    return (summary.by_category || [])
      .filter((entry) => Number(entry.operating_expense || 0) > 0)
      .sort((a, b) => Number(b.operating_expense || 0) - Number(a.operating_expense || 0))
      .slice(0, 5);
  }, [summary.by_category]);

  const handleLedgerGroupChange = (nextGroup) => {
    const nextEntryTypes = metadata.entry_type_options?.[nextGroup] || FALLBACK_METADATA.entry_type_options[nextGroup] || [];
    setFormData((prev) => ({
      ...prev,
      ledger_group: nextGroup,
      direction: getDefaultDirectionForGroup(nextGroup),
      entry_type: nextEntryTypes[0] || '',
    }));
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5">OPEX Ledger</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={exportCsv}>Export CSV</Button>
          <Button variant="contained" onClick={openCreate}>Add Entry</Button>
        </Stack>
      </Stack>

      <Tabs value={activeTab} onChange={(event, nextValue) => setActiveTab(nextValue)} sx={{ mb: 2 }}>
        <Tab label="Ledger" />
        <Tab label="ROI Dashboard" />
      </Tabs>

      {activeTab === 0 ? (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Total Incoming Cash</Typography>
                  <Typography variant="h5" color="success.main">{formatMoney(summary.total_incoming)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Total Outgoing Cash</Typography>
                  <Typography variant="h5" color="warning.main">{formatMoney(summary.total_expense)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Net Cashflow</Typography>
                  <Typography variant="h5" color={Number(summary.net_cashflow || 0) >= 0 ? 'success.main' : 'error.main'}>
                    {formatMoney(summary.net_cashflow)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Alert severity="info" sx={{ mb: 2 }}>
            Cashflow includes capital and financing entries. Profitability and ROI are shown in the ROI Dashboard and exclude capital inflows from net profit.
          </Alert>

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Cashflow Trend (Last 30 Days)</Typography>
              <Box sx={{ width: '100%', overflowX: 'auto' }}>
                <BarChart
                  dataset={timelineDataset}
                  xAxis={[{ scaleType: 'band', dataKey: 'date' }]}
                  series={[
                    { dataKey: 'total_incoming', label: 'Incoming Cash', color: '#2e7d32' },
                    { dataKey: 'total_expense', label: 'Outgoing Cash', color: '#ed6c02' },
                    { dataKey: 'net_cashflow', label: 'Net Cashflow', color: '#1565c0' },
                  ]}
                  height={280}
                  margin={{ top: 10, left: 50, right: 20, bottom: 60 }}
                />
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Filters</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 1 }}>
                <TextField
                  select
                  label="Direction"
                  size="small"
                  value={filters.direction}
                  onChange={(e) => setFilters((prev) => ({ ...prev, direction: e.target.value }))}
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="expense">Expense</MenuItem>
                  <MenuItem value="fund_in">Incoming</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Ledger Group"
                  size="small"
                  value={filters.ledger_group}
                  onChange={(e) => setFilters((prev) => ({
                    ...prev,
                    ledger_group: e.target.value,
                    entry_type: 'all',
                  }))}
                  sx={{ minWidth: 160 }}
                >
                  <MenuItem value="all">All</MenuItem>
                  {ledgerGroups.map((group) => (
                    <MenuItem key={group.value} value={group.value}>{group.label}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Entry Type"
                  size="small"
                  value={filters.entry_type}
                  onChange={(e) => setFilters((prev) => ({ ...prev, entry_type: e.target.value }))}
                  sx={{ minWidth: 170 }}
                >
                  <MenuItem value="all">All</MenuItem>
                  {filterEntryTypeOptions.map((entryType) => (
                    <MenuItem key={entryType} value={entryType}>{formatTypeLabel(entryType)}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Status"
                  size="small"
                  value={filters.status}
                  onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                  sx={{ minWidth: 140 }}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="voided">Voided</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Category"
                  size="small"
                  value={filters.category}
                  onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
                  sx={{ minWidth: 170 }}
                >
                  <MenuItem value="all">All</MenuItem>
                  {categories.map((category) => (
                    <MenuItem key={category} value={category}>{category}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Search"
                  size="small"
                  value={filters.q}
                  onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
                  placeholder="Reference, type, payee"
                  sx={{ minWidth: 220 }}
                />
                <TextField
                  label="Start Date"
                  type="date"
                  size="small"
                  value={filters.startDate}
                  onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="End Date"
                  type="date"
                  size="small"
                  value={filters.endDate}
                  onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
                <Button
                  variant="outlined"
                  onClick={() => setFilters({ direction: 'all', ledger_group: 'all', entry_type: 'all', status: 'active', category: 'all', startDate: '', endDate: '', q: '' })}
                >
                  Reset
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Box sx={{ height: 640, width: '100%' }}>
            <DataGrid
              rows={rows}
              columns={columns}
              loading={loading}
              slots={{
                toolbar: CustomGridToolbar,
                loadingOverlay: LinearProgress,
              }}
              initialState={{
                pagination: {
                  paginationModel: { page: 0, pageSize: 25 },
                },
                sorting: {
                  sortModel: [{ field: 'entry_date', sort: 'desc' }],
                },
              }}
              pageSizeOptions={[10, 25, 50, 100]}
              disableRowSelectionOnClick
            />
          </Box>
        </>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6} lg={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Invested Capital</Typography>
                  <Typography variant="h5">{formatMoney(summary.invested_capital)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} lg={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Operating Revenue</Typography>
                  <Typography variant="h5" color="success.main">{formatMoney(summary.operating_revenue)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} lg={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">COGS</Typography>
                  <Typography variant="h5" color="warning.main">{formatMoney(summary.cogs)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} lg={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Gross Profit</Typography>
                  <Typography variant="h5" color="info.main">{formatMoney(summary.gross_profit)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} lg={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Operating Expenses</Typography>
                  <Typography variant="h5" color="warning.main">{formatMoney(summary.operating_expense)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} lg={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Operating Profit</Typography>
                  <Typography variant="h5" color={Number(summary.operating_profit || 0) >= 0 ? 'success.main' : 'error.main'}>
                    {formatMoney(summary.operating_profit)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} lg={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">ROI</Typography>
                  <Typography variant="h5" color={Number(summary.roi_percent || 0) >= 0 ? 'success.main' : 'error.main'}>
                    {summary.roi_percent == null ? 'N/A' : `${formatNumber(summary.roi_percent)}%`}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} lg={4}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Payback Progress</Typography>
                  <Typography variant="h5">
                    {summary.payback_progress_percent == null ? 'N/A' : `${formatNumber(summary.payback_progress_percent)}%`}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Alert severity="info" sx={{ mb: 2 }}>
            COGS is separated from operating expenses. Operating profit is calculated as sales revenue minus COGS minus other operating expenses. Capital inflows such as initial capital and owner top-ups are excluded from profit.
          </Alert>

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Operating Profit Trend (Last 30 Days)</Typography>
              <Box sx={{ width: '100%', overflowX: 'auto' }}>
                <BarChart
                  dataset={timelineDataset}
                  xAxis={[{ scaleType: 'band', dataKey: 'date' }]}
                  series={[
                    { dataKey: 'operating_revenue', label: 'Operating Revenue', color: '#2e7d32' },
                    { dataKey: 'cogs', label: 'COGS', color: '#ef6c00' },
                    { dataKey: 'operating_expense', label: 'Operating Expense', color: '#ed6c02' },
                    { dataKey: 'operating_profit', label: 'Operating Profit', color: '#1565c0' },
                  ]}
                  height={300}
                  margin={{ top: 10, left: 50, right: 20, bottom: 60 }}
                />
              </Box>
            </CardContent>
          </Card>

          <Grid container spacing={2}>
            <Grid item xs={12} lg={6}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>Largest Operating Expense Categories</Typography>
                  <Stack spacing={1}>
                    {topOperatingCategories.length > 0 ? topOperatingCategories.map((entry) => (
                      <Stack key={entry.category} direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2">{entry.category}</Typography>
                        <Typography variant="body2" color="warning.main" fontWeight={700}>
                          {formatMoney(entry.operating_expense)}
                        </Typography>
                      </Stack>
                    )) : (
                      <Typography variant="body2" color="text.secondary">No operating expenses recorded for the selected period.</Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} lg={6}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>Capital and Financing Snapshot</Typography>
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2">Capital In</Typography>
                      <Typography variant="body2" fontWeight={700}>{formatMoney(summary.invested_capital)}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2">Capital Out</Typography>
                      <Typography variant="body2" fontWeight={700}>{formatMoney(summary.capital_outflow)}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2">Financing In</Typography>
                      <Typography variant="body2" fontWeight={700}>{formatMoney(summary.financing_inflow)}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2">Financing Out</Typography>
                      <Typography variant="body2" fontWeight={700}>{formatMoney(summary.financing_outflow)}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2">Asset Purchases</Typography>
                      <Typography variant="body2" fontWeight={700}>{formatMoney(summary.asset_expense)}</Typography>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingEntry?.id ? 'Edit OPEX Entry' : 'Add OPEX Entry'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Ledger Group"
              value={formData.ledger_group}
              onChange={(e) => handleLedgerGroupChange(e.target.value)}
            >
              {ledgerGroups.map((group) => (
                <MenuItem key={group.value} value={group.value}>{group.label}</MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Entry Type"
              value={formData.entry_type}
              onChange={(e) => setFormData((prev) => ({ ...prev, entry_type: e.target.value }))}
            >
              {currentEntryTypeOptions.map((entryType) => (
                <MenuItem key={entryType} value={entryType}>{formatTypeLabel(entryType)}</MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Direction"
              value={formData.direction}
              onChange={(e) => setFormData((prev) => ({ ...prev, direction: e.target.value }))}
            >
              <MenuItem value="expense">Expense</MenuItem>
              <MenuItem value="fund_in">Incoming</MenuItem>
            </TextField>

            <TextField
              label="Category"
              value={formData.category}
              onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
              placeholder="Utilities, Rent, Capital, Equipment..."
              helperText={categories.length > 0 ? `Suggestions: ${categories.join(', ')}` : ''}
            />

            {formData.direction === 'fund_in' && (
              <TextField
                label="Fund Source"
                value={formData.source_type}
                onChange={(e) => setFormData((prev) => ({ ...prev, source_type: e.target.value }))}
                placeholder="Owner Top-up, Loan, Refund..."
                helperText={fundSources.length > 0 ? `Suggestions: ${fundSources.join(', ')}` : ''}
              />
            )}

            <TextField
              label={formData.direction === 'fund_in' ? 'Source / Payer' : 'Payee / Vendor'}
              value={formData.source_or_payee}
              onChange={(e) => setFormData((prev) => ({ ...prev, source_or_payee: e.target.value }))}
            />

            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              multiline
              minRows={2}
            />

            <TextField
              label="Amount"
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
            />

            <TextField
              label="Entry Date"
              type="datetime-local"
              value={formData.entry_date}
              onChange={(e) => setFormData((prev) => ({ ...prev, entry_date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={voidDialogOpen} onClose={() => setVoidDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Void OPEX Entry</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            This action keeps the record for audit and excludes it from active totals.
          </Typography>
          <TextField
            label="Reason"
            fullWidth
            required
            multiline
            minRows={2}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVoidDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleVoid} disabled={voiding}>
            {voiding ? 'Voiding...' : 'Void Entry'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3500}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default AdminOpex;
