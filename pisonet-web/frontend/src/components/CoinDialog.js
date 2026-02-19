import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  Typography,
  Paper,
  Box,
  Avatar
} from '@mui/material';
import { MonetizationOn as CoinIcon } from '@mui/icons-material';

function CoinDialog({ unit, onInsertCoin, onClose }) {
  const coins = [
    { value: 1, label: '₱1', color: '#90CAF9' },
    { value: 5, label: '₱5', color: '#FFCC80' },
    { value: 10, label: '₱10', color: '#A5D6A7' },
  ];

  return (
    <Dialog 
      open={true} 
      onClose={onClose}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle sx={{ textAlign: 'center' }}>
        Insert Coin for {unit.name}
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Simulate inserting a coin into the coin slot.
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {coins.map((coin) => (
            <Grid item xs={12} key={coin.value}>
              <Paper
                component={Button}
                onClick={() => onInsertCoin(coin.value)}
                elevation={3}
                sx={{
                  p: 2,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                  bgcolor: 'background.paper',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                <Avatar sx={{ bgcolor: coin.color, color: 'black', mr: 2 }}>
                  <CoinIcon />
                </Avatar>
                <Box sx={{ textAlign: 'left' }}>
                  <Typography variant="h6" color="text.primary">
                    {coin.label} Coin
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Adds {coin.value === 1 ? '5 mins' : coin.value === 5 ? '25 mins' : '50 mins'}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} color="error" fullWidth>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CoinDialog;
