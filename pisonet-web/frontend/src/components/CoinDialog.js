import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  LinearProgress
} from '@mui/material';
import { MonetizationOn as CoinIcon } from '@mui/icons-material';

function CoinDialog({ unit, selection, onClose }) {
  const timeoutMs = selection?.timeout_ms || 30000;
  const [remainingMs, setRemainingMs] = useState(timeoutMs);

  const expiresAt = useMemo(() => {
    if (!selection?.expires_at) {
      return null;
    }
    const value = new Date(selection.expires_at).getTime();
    return Number.isNaN(value) ? null : value;
  }, [selection?.expires_at]);

  useEffect(() => {
    if (!expiresAt) {
      setRemainingMs(timeoutMs);
      return undefined;
    }

    const updateCountdown = () => {
      const diff = Math.max(0, expiresAt - Date.now());
      setRemainingMs(diff);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 250);

    return () => clearInterval(interval);
  }, [expiresAt, timeoutMs]);

  const progressValue = Math.max(0, Math.min(100, (remainingMs / timeoutMs) * 100));
  const secondsLeft = Math.ceil(remainingMs / 1000);

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
            Selected PC: {unit.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Time left to insert: {secondsLeft}s
          </Typography>
        </Box>

        <LinearProgress
          variant="determinate"
          value={progressValue}
          color={remainingMs > 5000 ? 'primary' : 'warning'}
          sx={{ height: 10, borderRadius: 5, mt: 1 }}
        />
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
