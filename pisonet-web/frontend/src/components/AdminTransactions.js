import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Box, Typography, Chip, LinearProgress } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import CustomGridToolbar from './CustomGridToolbar';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

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
      field: 'timestamp', 
      headerName: 'Date/Time', 
      width: 250,
      renderCell: (params) => {
        if (!params.value) return '';
        return new Date(params.value).toLocaleString();
      }
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
      width: 150,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
          {params.value}
        </Typography>
      )
    },
    { 
      field: 'amount', 
      headerName: 'Amount', 
      width: 150, 
      type: 'number',
      headerAlign: 'right',
      align: 'right',
      renderCell: (params) => {
        if (params.value == null) return null;
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