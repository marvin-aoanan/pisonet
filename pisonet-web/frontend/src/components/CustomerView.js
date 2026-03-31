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
    <Box
      sx={{
        //height: '1024px',
        //maxHeight: '800px',
        overflow: 'hidden',
        p: 1,
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          sm: 'repeat(4, minmax(0, 1fr))',
          md: 'repeat(5, minmax(0, 1fr))',
        },
        gap: 1,
      }}
    >
      {units.map((unit) => (
        <Card
          key={unit.id}
          elevation={unit.open_time === 1 || unit.remaining_seconds > 0 ? 6 : 1}
          sx={{
            minHeight: 210,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            border: unit.open_time === 1 ? '2px solid #FF9800' : unit.remaining_seconds > 0 ? '2px solid #00E676' : '1px solid #424242',
            position: 'relative',
            overflow: 'hidden',
            alignSelf: 'stretch'
          }}
        >
          {unit.remaining_seconds > 0 ? (
            <Chip
              label="ACTIVE"
              color="success"
              size="small"
              sx={{ position: 'absolute', top: 6, right: 6 }}
            />
          ) : null}

          <CardContent sx={{ textAlign: 'center', p: 1, pb: 0.5, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
            <PcIcon sx={{ fontSize: 28, color: unit.open_time === 1 ? 'warning.main' : unit.remaining_seconds > 0 ? 'success.main' : 'text.disabled', mb: 0.5 }} />

            <Typography variant="subtitle1" component="div" gutterBottom>
              {unit.name}
            </Typography>

            {unit.open_time === 1 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                <Box sx={{ my: 1, p: 1, bgcolor: 'background.default', borderRadius: 1, minHeight: 78, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <Typography variant="h5" component="div" sx={{ fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 0.5, color: 'warning.main' }}>
                    {formatTime(unit.open_time_elapsed || 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    OPEN TIME
                  </Typography>
                </Box>
                <Box sx={{ mt: 0.5, minHeight: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                    TO PAY:
                  </Typography>
                  <Typography variant="h6" component="div" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
                    ₱{(unit.open_time_amount || 0).toFixed(2)}
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                <Box sx={{ my: 1, p: 1, bgcolor: 'background.default', borderRadius: 1, minHeight: 78, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <Typography variant="h5" component="div" sx={{ fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 0.5 }}>
                    {formatTime(unit.remaining_seconds)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    REMAINING TIME
                  </Typography>
                </Box>
                <Box sx={{ mt: 0.5, minHeight: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {unit.remaining_seconds > 0 && (
                    <LinearProgress
                      variant="determinate"
                      value={100}
                      color={getStatusColor(unit.status, unit.remaining_seconds)}
                      sx={{ width: '100%', height: 4, borderRadius: 4 }}
                    />
                  )}
                </Box>
              </Box>
            )}
          </CardContent>

          {unit.open_time !== 1 ? (
            <CardActions sx={{ p: 0.5, pt: 0.25, pb: 0.25, minHeight: 41 }}>
              <Button
                fullWidth
                variant="contained"
                color="primary"
                size="small"
                startIcon={<TimeIcon />}
                onClick={() => onSelectUnit(unit.id)}
                disabled={unit.status === 'maintenance'}
                sx={{ minHeight: 32 }}
              >
                Insert Coin
              </Button>
            </CardActions>
          ) : (
            <CardActions sx={{ p: 0.5, pt: 0.25, pb: 0.25, minHeight: 41 }} />
          )}
        </Card>
      ))}
    </Box>
  );
}

export default CustomerView;
