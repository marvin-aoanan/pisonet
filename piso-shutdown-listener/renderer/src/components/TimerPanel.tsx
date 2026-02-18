'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  ButtonGroup,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  PowerSettingsNew as PowerIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import type { Unit } from '@/types';

interface TimerPanelProps {
  unit: Unit;
  onAddTime: (unitId: number, coinValue: number) => void;
  onTimerUpdate: (unitId: number, seconds: number) => void;
}

export default function TimerPanel({ unit, onAddTime, onTimerUpdate }: TimerPanelProps) {
  const [seconds, setSeconds] = useState(unit.totalSeconds);

  // Timer countdown
  useEffect(() => {
    setSeconds(unit.totalSeconds);
  }, [unit.totalSeconds]);

  useEffect(() => {
    if (seconds > 0) {
      const timer = setInterval(() => {
        setSeconds(prev => {
          const newSeconds = prev - 1;
          onTimerUpdate(unit.id, newSeconds);
          return newSeconds;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [seconds, unit.id, onTimerUpdate]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    switch (unit.status) {
      case 'active': return 'success';
      case 'warning': return 'warning';
      case 'disconnected': return 'error';
      default: return 'default';
    }
  };

  const getCardBorder = () => {
    switch (unit.status) {
      case 'active': return '2px solid #00ff00';
      case 'warning': return '2px solid #ff8800';
      case 'disconnected': return '2px solid #ff0000';
      default: return '1px solid #333';
    }
  };

  const progress = unit.totalSeconds > 0 ? (seconds / unit.totalSeconds) * 100 : 0;

  return (
    <Card 
      sx={{ 
        border: getCardBorder(),
        transition: 'all 0.3s',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 700 }}>
            {unit.name}
          </Typography>
          <Chip 
            label={unit.status} 
            color={getStatusColor()} 
            size="small"
            sx={{ textTransform: 'uppercase' }}
          />
        </Box>

        {/* Timer Display */}
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Typography 
            variant="h2" 
            sx={{ 
              fontFamily: 'monospace',
              fontWeight: 'bold',
              color: unit.status === 'warning' ? 'warning.main' : 'primary.main',
              textShadow: `0 0 20px ${unit.status === 'warning' ? '#ff8800' : '#00ff00'}`,
            }}
          >
            {formatTime(seconds)}
          </Typography>
          {unit.status === 'warning' && seconds <= 10 && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 1, gap: 1 }}>
              <WarningIcon color="warning" />
              <Typography color="warning.main" variant="body2" fontWeight="bold">
                SAVE YOUR WORK!
              </Typography>
            </Box>
          )}
        </Box>

        {/* Progress Bar */}
        {seconds > 0 && (
          <LinearProgress 
            variant="determinate" 
            value={progress} 
            sx={{ 
              height: 6, 
              borderRadius: 3,
              backgroundColor: 'rgba(255,255,255,0.1)',
              '& .MuiLinearProgress-bar': {
                background: unit.status === 'warning' 
                  ? 'linear-gradient(90deg, #ff8800 0%, #ff0000 100%)'
                  : 'linear-gradient(90deg, #00ff00 0%, #00b300 100%)',
              }
            }} 
          />
        )}

        {/* Revenue */}
        <Typography variant="body2" color="text.secondary" textAlign="center">
          Revenue: ₱{unit.revenue}
        </Typography>

        {/* Coin Buttons */}
        <ButtonGroup fullWidth variant="contained" sx={{ mt: 'auto' }}>
          <Button 
            onClick={() => onAddTime(unit.id, 1)}
            sx={{ 
              background: 'linear-gradient(135deg, #00ff00 0%, #00b300 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #00b300 0%, #008800 100%)' }
            }}
          >
            ₱1
          </Button>
          <Button 
            onClick={() => onAddTime(unit.id, 5)}
            sx={{ 
              background: 'linear-gradient(135deg, #00cc00 0%, #009900 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #009900 0%, #006600 100%)' }
            }}
          >
            ₱5
          </Button>
          <Button 
            onClick={() => onAddTime(unit.id, 10)}
            sx={{ 
              background: 'linear-gradient(135deg, #00aa00 0%, #007700 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #007700 0%, #004400 100%)' }
            }}
          >
            ₱10
          </Button>
        </ButtonGroup>

        {/* Manual Controls */}
        <ButtonGroup fullWidth size="small" variant="outlined">
          <Button startIcon={<PowerIcon />} color="error">
            OFF
          </Button>
          <Button startIcon={<PowerIcon />} color="success">
            ON
          </Button>
        </ButtonGroup>
      </CardContent>
    </Card>
  );
}
