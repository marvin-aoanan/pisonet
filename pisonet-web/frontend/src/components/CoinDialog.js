import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box
} from '@mui/material';
import { MonetizationOn as CoinIcon } from '@mui/icons-material';

function CoinDialog({ unit, insertedAmount = 0, onClose }) {
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
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <CoinIcon sx={{ fontSize: 52, color: 'secondary.main', mb: 1 }} />
          <Typography variant="body1" color="text.primary" sx={{ mb: 1 }}>
            Waiting for coin acceptor input...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Selected: {unit.name}
          </Typography>
          {insertedAmount > 0 && (
            <Typography variant="h6" color="success.main" sx={{ mt: 1.5, fontWeight: 'bold' }}>
              ₱{insertedAmount.toFixed(2)} inserted
            </Typography>
          )}
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} color="error" fullWidth variant="contained">
          Cancel Selection
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CoinDialog;
