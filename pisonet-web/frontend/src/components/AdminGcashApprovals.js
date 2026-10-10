import React, { useCallback, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { formatPeso } from '../utils/currency';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

function getErrorMessage(error, fallback) {
  const direct = error?.response?.data?.error;
  if (typeof direct === 'string' && direct.trim()) {
    return direct;
  }

  const nested = error?.response?.data?.error?.message;
  if (typeof nested === 'string' && nested.trim()) {
    return nested;
  }

  const message = error?.message;
  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  return fallback;
}

function formatDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
}

function AdminGcashApprovals({ adminPassword }) {
  const authHeaders = useMemo(() => ({ headers: { 'x-admin-password': adminPassword } }), [adminPassword]);

  const [pendingRows, setPendingRows] = useState([]);
  const [summary, setSummary] = useState({
    cash_approved: 0,
    gcash_approved: 0,
    gcash_pending: 0,
    gcash_rejected: 0,
  });
  const [approvalNotes, setApprovalNotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [actionById, setActionById] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [activeFilter, setActiveFilter] = useState(null);

  const loadData = useCallback(async () => {
    if (!adminPassword) {
      setPendingRows([]);
      setSummary({
        cash_approved: 0,
        gcash_approved: 0,
        gcash_pending: 0,
        gcash_rejected: 0,
      });
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const statusSuffix = activeFilter ? `-${activeFilter.replace('gcash_', '')}` : '';
      const pendingEndpoint = activeFilter === 'gcash_approved' ? 'approved' : activeFilter === 'gcash_rejected' ? 'rejected' : 'pending';
      
      const [
        posPendingResult,
        posSummaryResult,
        rentalPendingResult,
        rentalSummaryResult,
        printPendingResult,
        printSummaryResult,
        opexSummaryResult,
      ] = await Promise.allSettled([
        axios.get(`${API_URL}/pos-sales/${pendingEndpoint}-payments`, authHeaders),
        axios.get(`${API_URL}/pos-sales/payment-summary`, authHeaders),
        axios.get(`${API_URL}/units/payment-requests/${pendingEndpoint}`, authHeaders),
        axios.get(`${API_URL}/units/payment-summary`, authHeaders),
        axios.get(`${API_URL}/transactions/print-service/${pendingEndpoint}-payments`, authHeaders),
        axios.get(`${API_URL}/transactions/print-service/payment-summary`, authHeaders),
        axios.get(`${API_URL}/opex/summary`, authHeaders),
      ]);

      const posPendingResponse = posPendingResult.status === 'fulfilled' ? posPendingResult.value : null;
      const posSummaryResponse = posSummaryResult.status === 'fulfilled' ? posSummaryResult.value : null;
      const rentalPendingResponse = rentalPendingResult.status === 'fulfilled' ? rentalPendingResult.value : null;
      const rentalSummaryResponse = rentalSummaryResult.status === 'fulfilled' ? rentalSummaryResult.value : null;
      const printPendingResponse = printPendingResult.status === 'fulfilled' ? printPendingResult.value : null;
      const printSummaryResponse = printSummaryResult.status === 'fulfilled' ? printSummaryResult.value : null;
      const opexSummaryResponse = opexSummaryResult.status === 'fulfilled' ? opexSummaryResult.value : null;

      const posRows = (Array.isArray(posPendingResponse?.data?.data) ? posPendingResponse.data.data : []).map((row) => ({
        ...row,
        source_type: 'store',
        row_key: `store-${row.id}`,
      }));
      const rentalRows = (Array.isArray(rentalPendingResponse?.data?.data) ? rentalPendingResponse.data.data : []).map((row) => ({
        ...row,
        sold_by: row.created_by || '-',
        sold_at: row.created_at,
        subtotal: Number(row.amount || 0),
        source_type: 'pc_rental',
        row_key: `rental-${row.id}`,
      }));
      const printRows = (Array.isArray(printPendingResponse?.data?.data) ? printPendingResponse.data.data : []).map((row) => ({
        ...row,
        unit_name: row.notes || 'Print Service',
        sold_by: row.sold_by || 'Admin',
        sold_at: row.sold_at,
        subtotal: Number(row.subtotal || 0),
        source_type: 'print_service',
        row_key: `print-${row.id}`,
      }));

      setPendingRows([...posRows, ...rentalRows, ...printRows]);

      const posSummary = posSummaryResponse?.data?.data || {};
      const rentalSummary = rentalSummaryResponse?.data?.data || {};
      const printSummary = printSummaryResponse?.data?.data || {};
      const opexSummary = opexSummaryResponse?.data?.data || {};
      const combinedCashApproved = Number(posSummary.cash_approved || 0) + Number(rentalSummary.cash_approved || 0) + Number(printSummary.cash_approved || 0);
      const opexOperatingRevenue = Number(opexSummary.operating_revenue || 0);

      setSummary({
        cash_approved: Number.isFinite(opexOperatingRevenue) && opexOperatingRevenue >= 0 ? opexOperatingRevenue : combinedCashApproved,
        gcash_approved: Number(posSummary.gcash_approved || 0) + Number(rentalSummary.gcash_approved || 0) + Number(printSummary.gcash_approved || 0),
        gcash_pending: Number(posSummary.gcash_pending || 0) + Number(rentalSummary.gcash_pending || 0) + Number(printSummary.gcash_pending || 0),
        gcash_rejected: Number(posSummary.gcash_rejected || 0) + Number(rentalSummary.gcash_rejected || 0) + Number(printSummary.gcash_rejected || 0),
      });

      const failures = [posPendingResult, posSummaryResult, rentalPendingResult, rentalSummaryResult, printPendingResult, printSummaryResult, opexSummaryResult]
        .filter((result) => result.status === 'rejected')
        .map((result) => getErrorMessage(result.reason, 'Failed to load some approval data'));

      if (failures.length > 0) {
        setErrorMessage(`Partial data loaded. ${failures[0]}`);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Failed to load GCash approvals data.'));
    } finally {
      setLoading(false);
    }
  }, [adminPassword, authHeaders, activeFilter]);

  React.useEffect(() => {
    loadData();
  }, [loadData, refreshVersion, activeFilter]);

  const runAction = async (row, type) => {
    const rowKey = row.row_key || `${row.source_type}-${row.id}`;
    const notes = String(approvalNotes[rowKey] || '').trim();
    const endpoint = type === 'approve' ? 'approve-gcash' : 'reject-gcash';
    const isPcRental = row.source_type === 'pc_rental';
    const isPrintService = row.source_type === 'print_service';
    const url = isPcRental
      ? `${API_URL}/units/payment-requests/${row.id}/${endpoint}`
      : isPrintService
        ? `${API_URL}/transactions/print-service/${row.id}/${endpoint}`
      : `${API_URL}/pos-sales/${row.id}/${endpoint}`;

    setActionById((prev) => ({ ...prev, [rowKey]: type }));
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await axios.post(
        url,
        {
          approved_by: 'Admin',
          approval_notes: notes || null,
        },
        authHeaders
      );

      setSuccessMessage(type === 'approve'
        ? isPcRental
          ? 'PC rental GCash request approved and time added.'
          : isPrintService
            ? 'Print service GCash payment approved.'
          : 'GCash sale approved.'
        : isPcRental
          ? 'PC rental GCash request rejected.'
          : isPrintService
            ? 'Print service GCash payment rejected.'
          : 'GCash sale rejected and stock restored.');
      setApprovalNotes((prev) => ({ ...prev, [rowKey]: '' }));
      setRefreshVersion((prev) => prev + 1);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Unable to process GCash action.'));
    } finally {
      setActionById((prev) => ({ ...prev, [rowKey]: null }));
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5">GCash Approvals</Typography>
        <Button variant="outlined" onClick={() => setRefreshVersion((prev) => prev + 1)} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      {errorMessage ? <Alert severity="error" sx={{ mb: 2 }}>{errorMessage}</Alert> : null}
      {successMessage ? <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert> : null}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined"><CardContent><Typography variant="caption" color="text.secondary">Cash Approved</Typography><Typography variant="h6">{formatPeso(summary.cash_approved)}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card
            variant="outlined"
            sx={{ 
              cursor: 'pointer',
              border: activeFilter === 'gcash_approved' ? '2px solid' : '1px solid',
              borderColor: activeFilter === 'gcash_approved' ? 'success.main' : 'divider',
              backgroundColor: activeFilter === 'gcash_approved' ? 'success.lighter' : 'transparent',
              boxShadow: activeFilter === 'gcash_approved' ? '0 4px 8px rgba(0, 128, 0, 0.15)' : 'none',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': { 
                borderColor: 'success.main',
                backgroundColor: activeFilter === 'gcash_approved' ? 'success.lighter' : 'action.hover',
                boxShadow: '0 2px 4px rgba(0, 128, 0, 0.1)'
              }
            }}
            onClick={() => setActiveFilter(activeFilter === 'gcash_approved' ? null : 'gcash_approved')}
          >
            <CardContent>
              <Typography variant="caption" color="text.secondary">GCash Approved</Typography>
              <Typography variant="h6">{formatPeso(summary.gcash_approved)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            variant="outlined"
            sx={{ 
              cursor: 'pointer',
              border: activeFilter === 'gcash_pending' ? '2px solid' : '1px solid',
              borderColor: activeFilter === 'gcash_pending' ? 'warning.main' : 'divider',
              backgroundColor: activeFilter === 'gcash_pending' ? 'warning.lighter' : 'transparent',
              boxShadow: activeFilter === 'gcash_pending' ? '0 4px 8px rgba(255, 152, 0, 0.15)' : 'none',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': { 
                borderColor: 'warning.main',
                backgroundColor: activeFilter === 'gcash_pending' ? 'warning.lighter' : 'action.hover',
                boxShadow: '0 2px 4px rgba(255, 152, 0, 0.1)'
              }
            }}
            onClick={() => setActiveFilter(activeFilter === 'gcash_pending' ? null : 'gcash_pending')}
          >
            <CardContent>
              <Typography variant="caption" color="text.secondary">GCash Pending</Typography>
              <Typography variant="h6">{formatPeso(summary.gcash_pending)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            variant="outlined"
            sx={{ 
              cursor: 'pointer',
              border: activeFilter === 'gcash_rejected' ? '2px solid' : '1px solid',
              borderColor: activeFilter === 'gcash_rejected' ? 'error.main' : 'divider',
              backgroundColor: activeFilter === 'gcash_rejected' ? 'error.lighter' : 'transparent',
              boxShadow: activeFilter === 'gcash_rejected' ? '0 4px 8px rgba(211, 47, 47, 0.15)' : 'none',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': { 
                borderColor: 'error.main',
                backgroundColor: activeFilter === 'gcash_rejected' ? 'error.lighter' : 'action.hover',
                boxShadow: '0 2px 4px rgba(211, 47, 47, 0.1)'
              }
            }}
            onClick={() => setActiveFilter(activeFilter === 'gcash_rejected' ? null : 'gcash_rejected')}
          >
            <CardContent>
              <Typography variant="caption" color="text.secondary">GCash Rejected</Typography>
              <Typography variant="h6">{formatPeso(summary.gcash_rejected)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6">
              {activeFilter ? `${activeFilter.replace('gcash_', '').charAt(0).toUpperCase() + activeFilter.replace('gcash_', '').slice(1)} Queue` : 'Pending Queue'}
            </Typography>
            {activeFilter && (
              <Button 
                size="small" 
                variant="outlined"
                onClick={() => setActiveFilter(null)}
              >
                Clear Filter
              </Button>
            )}
          </Stack>
          <Divider sx={{ mb: 2 }} />

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : pendingRows.length === 0 ? (
            <Alert severity="info">
              {activeFilter 
                ? `No ${activeFilter.replace('gcash_', '')} GCash payments found.`
                : 'No pending GCash payments.'}
            </Alert>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Source</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell>Sold By</TableCell>
                    <TableCell>GCash Ref</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell>Notes</TableCell>
                    {(activeFilter === null || activeFilter === 'gcash_pending') && <TableCell align="right">Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingRows.map((row) => {
                    const rowKey = row.row_key || `${row.source_type}-${row.id}`;
                    const actionState = actionById[rowKey];
                    const busy = actionState === 'approve' || actionState === 'reject';

                    return (
                      <TableRow key={rowKey} hover>
                        <TableCell>{row.source_type === 'pc_rental' ? 'PC Rental' : row.source_type === 'print_service' ? 'Print Service' : 'Store POS'}</TableCell>
                        <TableCell>{row.reference_no || '-'}</TableCell>
                        <TableCell>{row.unit_name || '-'}</TableCell>
                        <TableCell>{row.sold_by || '-'}</TableCell>
                        <TableCell>{row.payment_reference || '-'}</TableCell>
                        <TableCell>{formatPeso(Number(row.subtotal || 0))}</TableCell>
                        <TableCell>{formatDateTime(row.sold_at)}</TableCell>
                        <TableCell sx={{ minWidth: 220 }}>
                          <TextField
                            size="small"
                            fullWidth
                            placeholder="Approval notes (optional)"
                            value={approvalNotes[rowKey] || ''}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setApprovalNotes((prev) => ({ ...prev, [rowKey]: nextValue }));
                            }}
                            disabled={busy}
                          />
                        </TableCell>
                        {(activeFilter === null || activeFilter === 'gcash_pending') && (
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <Button
                                variant="contained"
                                color="success"
                                size="small"
                                onClick={() => runAction(row, 'approve')}
                                disabled={busy}
                              >
                                {actionState === 'approve' ? 'Approving...' : 'Approve'}
                              </Button>
                              <Button
                                variant="contained"
                                color="error"
                                size="small"
                                onClick={() => runAction(row, 'reject')}
                                disabled={busy}
                              >
                                {actionState === 'reject' ? 'Rejecting...' : 'Reject'}
                              </Button>
                            </Stack>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default AdminGcashApprovals;
