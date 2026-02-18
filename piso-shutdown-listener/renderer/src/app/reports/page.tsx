'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  IconButton,
  AppBar,
  Toolbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Button,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useRouter } from 'next/navigation';

interface Transaction {
  id: number;
  unitId: number;
  coinValue: number;
  insertedAt: string;
}

export default function ReportsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Initialize dates after mounting to avoid hydration mismatch
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setDateFrom(today);
    setDateTo(today);
    setMounted(true);
  }, []);

  const loadTransactions = async () => {
    if (!dateFrom || !dateTo) return;
    
    try {
      if (window.electronAPI && window.electronAPI.getAllTransactions) {
        const data = await window.electronAPI.getAllTransactions(dateFrom, dateTo);
        setTransactions(data);
        const total = data.reduce((sum: number, t: Transaction) => sum + t.coinValue, 0);
        setTotalRevenue(total);
      } else {
        console.warn('electronAPI not available');
        setTransactions([]);
        setTotalRevenue(0);
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
      setTransactions([]);
      setTotalRevenue(0);
    }
  };

  useEffect(() => {
    if (mounted && dateFrom && dateTo) {
      loadTransactions();
    }
  }, [dateFrom, dateTo, mounted]);

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar position="static" sx={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
        <Toolbar>
          <IconButton color="inherit" onClick={() => router.push('/')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Reports & Transactions
          </Typography>
          <IconButton color="inherit" onClick={loadTransactions} disabled={!mounted}>
            <RefreshIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ flex: 1, py: 4, overflow: 'auto' }}>
        <Paper sx={{ p: 3, mb: 3, backgroundColor: '#1a1a2e' }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label="From Date"
              type="date"
              value={dateFrom || ''}
              onChange={(e) => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              disabled={!mounted}
            />
            <TextField
              label="To Date"
              type="date"
              value={dateTo || ''}
              onChange={(e) => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              disabled={!mounted}
            />
            <Button variant="contained" onClick={loadTransactions} disabled={!mounted}>
              Filter
            </Button>
          </Box>

          <Box sx={{ mt: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#00ff00' }}>
              Total Revenue: ₱{totalRevenue}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {transactions.length} transactions
            </Typography>
          </Box>
        </Paper>

        <TableContainer component={Paper} sx={{ backgroundColor: '#1a1a2e' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date & Time</TableCell>
                <TableCell>PC Unit</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    <Typography color="text.secondary">No transactions found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>{formatDate(transaction.insertedAt)}</TableCell>
                    <TableCell>PC {transaction.unitId}</TableCell>
                    <TableCell align="right" sx={{ color: '#00ff00', fontWeight: 600 }}>
                      ₱{transaction.coinValue}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Container>
    </Box>
  );
}
