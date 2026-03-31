import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Box, Typography, Chip, LinearProgress } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import CustomGridToolbar from './CustomGridToolbar';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

function AdminTransactions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

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
      headerName: 'Time',
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
          const mins = Number(params.value);
          const sign = mins >= 0 ? '+' : '';
          return (
            <Typography color={mins >= 0 ? 'primary.main' : 'warning.main'} fontWeight="bold">
              {sign}{mins}m
            </Typography>
          );
        }
        return (
          <Typography color="success.main" fontWeight="bold">
            +₱{Number(params.value).toFixed(2)}
          </Typography>
        );
      }
    },
  ];

  return (
    <Box sx={{ height: 700, width: '100%' }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Transaction History
      </Typography>
      
      <DataGrid
        rows={rows}
        columns={columns}
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