import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Box, Typography, Chip, LinearProgress } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import CustomGridToolbar from './CustomGridToolbar';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

function AdminTransactions({ adminPassword }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pesoToSeconds, setPesoToSeconds] = useState(60);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const response = await axios.get(`${API_URL}/transactions`);
        setRows(response.data);
      } catch (err) {
        console.error('Error fetching transactions:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, []);

  useEffect(() => {
    const fetchPricing = async () => {
      if (!adminPassword) return;

      try {
        const response = await axios.get(`${API_URL}/settings/peso_to_seconds`, {
          headers: { 'x-admin-password': adminPassword }
        });
        const nextValue = Number(response?.data?.value);
        if (!Number.isNaN(nextValue) && nextValue > 0) {
          setPesoToSeconds(nextValue);
        }
      } catch (err) {
        console.error('Error fetching peso_to_seconds setting:', err);
      }
    };

    fetchPricing();
  }, [adminPassword]);

  const formatDurationFromSeconds = (seconds) => {
    const totalSeconds = Math.max(0, Number(seconds) || 0);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }

    return `${totalMinutes}m`;
  };

  const getEquivalentSeconds = (row) => {
    const amount = Number(row?.amount || 0);
    const denomination = Number(row?.denomination || 0);
    const type = row?.transaction_type;

    if (type === 'open_time') {
      return Math.max(0, Math.floor(denomination * 60));
    }

    const isAdminAdjust = type === 'admin_add' || type === 'admin_deduct';

    if (isAdminAdjust) {
      return Math.max(0, Math.floor(amount * 60));
    }

    return Math.max(0, Math.floor(amount * pesoToSeconds));
  };

  const getEquivalentPesoAmount = (row) => {
    const amount = Number(row?.amount || 0);
    const type = row?.transaction_type;
    const isAdminAdjust = type === 'admin_add' || type === 'admin_deduct';

    if (!isAdminAdjust) {
      return amount;
    }

    if (!pesoToSeconds || pesoToSeconds <= 0) {
      return 0;
    }

    return (amount * 60) / pesoToSeconds;
  };

  const columns = [
    { field: 'id', headerName: 'ID', width: 90 },
    {
      field: 'date',
      headerName: 'Date',
      type: 'date',
      width: 140,
      valueGetter: (value, row) => {
        if (!row.timestamp) return null;
        const d = new Date(row.timestamp);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      },
      renderCell: (params) => {
        if (!params.row.timestamp) return '';
        return new Date(params.row.timestamp).toLocaleDateString();
      },
    },
    {
      field: 'time',
      headerName: 'Timestamp',
      width: 120,
      sortable: false,
      filterable: false,
      valueGetter: (value, row) => {
        if (!row.timestamp) return '';
        return new Date(row.timestamp).toLocaleTimeString();
      },
      renderCell: (params) => {
        if (!params.row.timestamp) return '';
        return new Date(params.row.timestamp).toLocaleTimeString();
      },
    },
    { 
      field: 'unit_id', 
      headerName: 'PC Unit', 
      width: 150,
      renderCell: (params) => (
        <Chip label={`Unit ${params.value}`} size="small" variant="outlined" />
      )
    },
    { 
      field: 'transaction_type', 
      headerName: 'Type', 
      width: 160,
      renderCell: (params) => {
        const typeMap = {
          coin: { label: 'Coin', color: 'success' },
          coin_acceptor: { label: 'Coin Acceptor', color: 'success' },
          gateway: { label: 'Gateway', color: 'info' },
          admin_add: { label: 'Admin Add', color: 'primary' },
          admin_deduct: { label: 'Admin Deduct', color: 'warning' },
          open_time: { label: 'Open Time', color: 'secondary' },
          manual: { label: 'Manual', color: 'default' },
        };
        const entry = typeMap[params.value] || { label: params.value, color: 'default' };
        return <Chip label={entry.label} color={entry.color} size="small" />;
      }
    },
    { 
      field: 'amount', 
      headerName: 'Amount', 
      width: 160, 
      type: 'number',
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => {
        if (params.value == null) return null;
        const type = params.row.transaction_type;
        const isAdminAdjust = type === 'admin_add' || type === 'admin_deduct';
        if (isAdminAdjust) {
          const pesoAmount = getEquivalentPesoAmount(params.row);
          const sign = pesoAmount >= 0 ? '+' : '';
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%', width: '100%' }}>
              <Typography color={pesoAmount >= 0 ? 'primary.main' : 'warning.main'} fontWeight="bold">
                {sign}₱{Math.abs(pesoAmount).toFixed(2)}
              </Typography>
            </Box>
          );
        }
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%', width: '100%' }}>
            <Typography color="success.main" fontWeight="bold">
              +₱{Number(params.value).toFixed(2)}
            </Typography>
          </Box>
        );
      }
    },
    {
      field: 'equivalent_time',
      headerName: 'Time',
      width: 140,
      sortable: false,
      filterable: false,
      valueGetter: (value, row) => getEquivalentSeconds(row),
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', width: '100%' }}>
          <Typography color="info.main" fontWeight="bold">
            {formatDurationFromSeconds(getEquivalentSeconds(params.row))}
          </Typography>
        </Box>
      )
    },
  ];

  const orderedColumns = columns.reduce((acc, column) => {
    if (column.field === 'amount') {
      acc.push(columns.find((c) => c.field === 'equivalent_time'));
    }

    if (column.field !== 'equivalent_time') {
      acc.push(column);
    }

    return acc;
  }, []);

  return (
    <Box sx={{ height: 700, width: '100%' }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Transaction History
      </Typography>
      
      <DataGrid
        rows={rows}
        columns={orderedColumns}
        initialState={{
          pagination: {
            paginationModel: { page: 0, pageSize: 25 },
          },
          sorting: {
            sortModel: [{ field: 'timestamp', sort: 'desc' }],
          },
        }}
        pageSizeOptions={[10, 25, 50, 100]}
        checkboxSelection
        disableRowSelectionOnClick
        loading={loading}
        slots={{
          loadingOverlay: LinearProgress,
          toolbar: CustomGridToolbar,
        }}
        slotProps={{
          toolbar: {
            showQuickFilter: true,
          },
        }}
        showToolbar
      />
    </Box>
  );
}

export default AdminTransactions;