import React from 'react';
import { 
  Grid, 
  Card, 
  CardContent, 
  CardActions, 
  Typography, 
  Button, 
  Box,
  Divider,
  LinearProgress,
  Chip
} from '@mui/material';
import { AccessTime as TimeIcon, Monitor as PcIcon } from '@mui/icons-material';

function CustomerView({ units, onSelectUnit }) {
  const formatTime = (seconds) => {
    if (seconds <= 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status, seconds) => {
    if (status === 'active' && seconds > 300) return 'success';
    if (status === 'active' && seconds <= 300) return 'warning';
    if (status === 'maintenance') return 'error';
    return 'default';
  };

  return (
    <Grid container spacing={3}>
      {units.map((unit) => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={unit.id}>
          <Card 
            elevation={unit.is_active ? 8 : 2}
            sx={{ 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column',
              border: unit.is_active ? '2px solid #00E676' : '1px solid #424242',
              position: 'relative',
              overflow: 'visible'
            }}
          >
            {unit.is_active && (
              <Chip 
                label="ACTIVE" 
                color="success" 
                size="small" 
                sx={{ position: 'absolute', top: -12, right: 12 }}
              />
            )}
            
            <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
              <PcIcon sx={{ fontSize: 60, color: unit.is_active ? 'success.main' : 'text.disabled', mb: 2 }} />
              
              <Typography variant="h5" component="div" gutterBottom>
                {unit.name}
              </Typography>
              
              <Box sx={{ my: 2, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                <Typography variant="h3" component="div" sx={{ fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 2 }}>
                  {formatTime(unit.remaining_seconds)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  REMAINING TIME
                </Typography>
              </Box>

              {unit.is_active && (
                <LinearProgress 
                  variant="determinate" 
                  value={unit.remaining_seconds > 0 ? 100 : 0} 
                  color={getStatusColor(unit.status, unit.remaining_seconds)}
                  sx={{ mt: 2, height: 8, borderRadius: 4 }}
                />
              )}
            </CardContent>

            <Divider />

            <CardActions>
              <Button 
                fullWidth 
                variant="contained" 
                color="primary" 
                size="large"
                startIcon={<TimeIcon />}
                onClick={() => onSelectUnit(unit.id)}
                disabled={unit.status === 'maintenance'}
              >
                Insert Coin
              </Button>
            </CardActions>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

export default CustomerView;
