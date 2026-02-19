import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Typography,
  Chip,
  Box,
  Tooltip,
  ButtonGroup
} from '@mui/material';
import {
  PowerSettingsNew as PowerIcon,
  Block as BlockIcon,
  Delete as ResetIcon
} from '@mui/icons-material';

function AdminView({ units, totalRevenue, onControl, onAddTime }) {
  const [loading, setLoading] = useState(null);

  const handleAction = async (unitId, action, callback) => {
    setLoading(unitId);
    try {
      if (callback) await callback();
    } finally {
      setLoading(null);
    }
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ color: 'primary.main', mb: 3 }}>
        System Overview
      </Typography>

      <TableContainer component={Paper} elevation={3}>
        <Table sx={{ minWidth: 650 }} aria-label="admin table">
          <TableHead>
            <TableRow>
              <TableCell>Unit Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Time Remaining</TableCell>
              <TableCell align="right">Session Revenue</TableCell>
              <TableCell align="center">Power Control</TableCell>
              <TableCell align="center">Timer Control</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {units.map((unit) => (
              <TableRow
                key={unit.id}
                sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
              >
                <TableCell component="th" scope="row">
                  <Typography variant="subtitle1" fontWeight="bold">
                    {unit.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip 
                    label={unit.status ? unit.status.toUpperCase() : 'UNKNOWN'} 
                    color={unit.is_active ? 'success' : 'default'} 
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="h6" color="text.primary">
                    {formatTime(unit.remaining_seconds)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography color="secondary.main" fontWeight="bold">
                    ₱{(unit.total_revenue || 0).toFixed(2)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <ButtonGroup variant="outlined" size="small">
                    <Tooltip title="Power ON">
                      <Button 
                        color="success"
                        onClick={() => handleAction(unit.id, 'on', () => onControl(unit.id, 'on'))}
                        disabled={loading === unit.id}
                      >
                        <PowerIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    <Tooltip title="Graceful Shutdown">
                      <Button 
                        color="warning"
                        onClick={() => handleAction(unit.id, 'shutdown', () => onControl(unit.id, 'shutdown'))}
                        disabled={loading === unit.id}
                      >
                        <BlockIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    <Tooltip title="Force OFF (Relay)">
                      <Button 
                        color="error"
                        onClick={() => handleAction(unit.id, 'off', () => onControl(unit.id, 'off'))}
                        disabled={loading === unit.id}
                      >
                        <PowerIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                  </ButtonGroup>
                </TableCell>
                <TableCell align="center">
                  <ButtonGroup variant="contained" size="small">
                    <Button 
                      onClick={() => onAddTime(unit.id, 5)}
                      disabled={loading === unit.id}
                    >
                      +5m
                    </Button>
                    <Button 
                      onClick={() => onAddTime(unit.id, 15)}
                      disabled={loading === unit.id}
                    >
                      +15m
                    </Button>
                    <Button 
                      color="error"
                      onClick={() => onControl(unit.id, 'reset_timer')}
                      disabled={loading === unit.id}
                    >
                      <ResetIcon fontSize="small" />
                    </Button>
                  </ButtonGroup>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default AdminView;
