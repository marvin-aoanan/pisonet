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
  const handleDialogClose = (_event, reason) => {
    if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
      return;
    }
    onClose();
  };

  return (
    <Dialog 
      open={true} 
      onClose={handleDialogClose}
      disableEscapeKeyDown
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle sx={{ textAlign: 'center' }}>
        Insert Coin for {unit.name}
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <CoinIcon sx={{ fontSize: 52, color: 'secondary.main', mb: 1 }} />
          <Typography variant="h6" color="success.main" sx={{ mt: 0.5, fontWeight: 'bold' }}>
            ₱{insertedAmount.toFixed(2)} inserted
          </Typography>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} color="error" fullWidth variant="contained">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CoinDialog;
