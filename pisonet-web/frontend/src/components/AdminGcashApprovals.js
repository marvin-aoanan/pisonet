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
      const [pendingResponse, summaryResponse] = await Promise.all([
        axios.get(`${API_URL}/pos-sales/pending-payments`, authHeaders),
        axios.get(`${API_URL}/pos-sales/payment-summary`, authHeaders),
      ]);

      setPendingRows(Array.isArray(pendingResponse?.data?.data) ? pendingResponse.data.data : []);
      setSummary({
        cash_approved: Number(summaryResponse?.data?.data?.cash_approved || 0),
        gcash_approved: Number(summaryResponse?.data?.data?.gcash_approved || 0),
        gcash_pending: Number(summaryResponse?.data?.data?.gcash_pending || 0),
        gcash_rejected: Number(summaryResponse?.data?.data?.gcash_rejected || 0),
      });
    } catch (error) {
      setErrorMessage(error?.response?.data?.error?.message || 'Failed to load GCash approvals data.');
    } finally {
      setLoading(false);
    }
  }, [adminPassword, authHeaders]);

  React.useEffect(() => {
    loadData();
  }, [loadData, refreshVersion]);

  const runAction = async (saleId, type) => {
    const endpoint = type === 'approve' ? 'approve-gcash' : 'reject-gcash';
    const notes = String(approvalNotes[saleId] || '').trim();

    setActionById((prev) => ({ ...prev, [saleId]: type }));
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await axios.post(
        `${API_URL}/pos-sales/${saleId}/${endpoint}`,
        {
          approved_by: 'Admin',
          approval_notes: notes || null,
        },
        authHeaders
      );

      setSuccessMessage(type === 'approve' ? 'GCash sale approved.' : 'GCash sale rejected and stock restored.');
      setApprovalNotes((prev) => ({ ...prev, [saleId]: '' }));
      setRefreshVersion((prev) => prev + 1);
    } catch (error) {
      setErrorMessage(error?.response?.data?.error?.message || 'Unable to process GCash action.');
    } finally {
      setActionById((prev) => ({ ...prev, [saleId]: null }));
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
          <Card variant="outlined"><CardContent><Typography variant="caption" color="text.secondary">GCash Approved</Typography><Typography variant="h6">{formatPeso(summary.gcash_approved)}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined"><CardContent><Typography variant="caption" color="text.secondary">GCash Pending</Typography><Typography variant="h6">{formatPeso(summary.gcash_pending)}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined"><CardContent><Typography variant="caption" color="text.secondary">GCash Rejected</Typography><Typography variant="h6">{formatPeso(summary.gcash_rejected)}</Typography></CardContent></Card>
        </Grid>
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>Pending Queue</Typography>
          <Divider sx={{ mb: 2 }} />

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : pendingRows.length === 0 ? (
            <Alert severity="info">No pending GCash sales.</Alert>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Reference</TableCell>
                    <TableCell>Sold By</TableCell>
                    <TableCell>GCash Ref</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingRows.map((row) => {
                    const saleId = Number(row.id);
                    const actionState = actionById[saleId];
                    const busy = actionState === 'approve' || actionState === 'reject';

                    return (
                      <TableRow key={saleId} hover>
                        <TableCell>{row.reference_no || '-'}</TableCell>
                        <TableCell>{row.sold_by || '-'}</TableCell>
                        <TableCell>{row.payment_reference || '-'}</TableCell>
                        <TableCell>{formatPeso(Number(row.subtotal || 0))}</TableCell>
                        <TableCell>{formatDateTime(row.sold_at)}</TableCell>
                        <TableCell sx={{ minWidth: 220 }}>
                          <TextField
                            size="small"
                            fullWidth
                            placeholder="Approval notes (optional)"
                            value={approvalNotes[saleId] || ''}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setApprovalNotes((prev) => ({ ...prev, [saleId]: nextValue }));
                            }}
                            disabled={busy}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button
                              variant="contained"
                              color="success"
                              size="small"
                              onClick={() => runAction(saleId, 'approve')}
                              disabled={busy}
                            >
                              {actionState === 'approve' ? 'Approving...' : 'Approve'}
                            </Button>
                            <Button
                              variant="contained"
                              color="error"
                              size="small"
                              onClick={() => runAction(saleId, 'reject')}
                              disabled={busy}
                            >
                              {actionState === 'reject' ? 'Rejecting...' : 'Reject'}
                            </Button>
                          </Stack>
                        </TableCell>
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
