'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Grid,
  AppBar,
  Toolbar,
  Typography,
  Paper,
  IconButton,
  Chip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import TimerPanel from './TimerPanel';
import RevenueStats from './RevenueStats';
import type { Unit } from '@/types';

const NUM_UNITS = 10;

export default function Dashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [revenueToday, setRevenueToday] = useState(0);
  const [revenueAll, setRevenueAll] = useState(0);
  const [sessionsToday, setSessionsToday] = useState(0);

  // Initialize units
  useEffect(() => {
    console.log('Dashboard useEffect running...');
    console.log('window.electronAPI available:', !!window.electronAPI);
    
    setMounted(true);
    
    const initialUnits: Unit[] = [];
    for (let i = 1; i <= NUM_UNITS; i++) {
      initialUnits.push({
        id: i,
        name: `PC ${i}`,
        status: 'idle',
        totalSeconds: 0,
        revenue: 0,
        intervalId: null,
        warningShown: false,
      });
    }
    console.log('Setting', initialUnits.length, 'units');
    setUnits(initialUnits);

    // Load saved timers from Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      console.log('Loading saved timers and revenue...');
      loadSavedTimers();
      loadRevenue();
    } else {
      console.warn('window.electronAPI not available!');
    }
  }, []);

  const loadSavedTimers = async () => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available for loadSavedTimers');
      return;
    }
    try {
      const savedTimers = await window.electronAPI.getTimers();
      setUnits(prev => prev.map(unit => {
        const saved = savedTimers.find(t => t.unit_id === unit.id);
        if (saved && saved.remaining_seconds > 0) {
          return {
            ...unit,
            totalSeconds: saved.remaining_seconds,
            revenue: saved.total_revenue,
            status: 'active',
          };
        }
        return unit;
      }));
    } catch (error) {
      console.error('Failed to load saved timers:', error);
    }
  };

  const loadRevenue = async () => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available for loadRevenue');
      return;
    }
    try {
      const [today, all, sessions] = await Promise.all([
        window.electronAPI.getRevenueToday(),
        window.electronAPI.getRevenueAll(),
        window.electronAPI.getSessionsToday(),
      ]);
      setRevenueToday(today);
      setRevenueAll(all);
      setSessionsToday(sessions);
    } catch (error) {
      console.error('Failed to load revenue:', error);
    }
  };
  
  // Prevent rendering until mounted to avoid hydration issues
  if (!mounted) {
    return null;
  }

  const handleAddTime = (unitId: number, coinValue: number) => {
    setUnits(prev => prev.map(unit => {
      if (unit.id === unitId) {
        const newSeconds = unit.totalSeconds + (coinValue * 60);
        const newRevenue = unit.revenue + coinValue;
        
        // Notify Electron
        if (window.electronAPI) {
          window.electronAPI.simulateCoin(unitId, coinValue);
          window.electronAPI.updateTimer(unitId, newSeconds, newRevenue);
        }

        return {
          ...unit,
          totalSeconds: newSeconds,
          revenue: newRevenue,
          status: 'active',
        };
      }
      return unit;
    }));

    // Refresh revenue stats
    loadRevenue();
  };

  const handleTimerUpdate = (unitId: number, seconds: number) => {
    setUnits(prev => prev.map(unit => {
      if (unit.id === unitId) {
        let newStatus = unit.status;
        if (seconds <= 0) {
          newStatus = 'idle';
        } else if (seconds <= 10) {
          newStatus = 'warning';
        } else if (seconds <= 60) {
          newStatus = 'warning';
        }

        // Save to Electron
        if (window.electronAPI && seconds % 5 === 0) {
          window.electronAPI.updateTimer(unitId, seconds, unit.revenue);
        }

        return {
          ...unit,
          totalSeconds: seconds,
          status: newStatus,
        };
      }
      return unit;
    }));
  };

  const activeUnits = units.filter(u => u.status === 'active').length;
  const idleUnits = units.filter(u => u.status === 'idle').length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* App Bar */}
      <AppBar position="static" sx={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            PisoNet Management System
          </Typography>
          <Chip 
            label={`${activeUnits} Active`} 
            color="success" 
            size="small" 
            sx={{ mr: 1 }} 
          />
          <Chip 
            label={`${idleUnits} Idle`} 
            size="small" 
            sx={{ mr: 2 }} 
          />
          <IconButton color="inherit" onClick={loadRevenue}>
            <RefreshIcon />
          </IconButton>
          <IconButton color="inherit" onClick={() => router.push('/reports')}>
            <AssessmentIcon />
          </IconButton>
          <IconButton color="inherit" onClick={() => router.push('/settings')}>
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Container maxWidth={false} sx={{ flex: 1, py: 3, overflow: 'auto' }}>
        {/* Revenue Stats */}
        <RevenueStats
          revenueToday={revenueToday}
          revenueAll={revenueAll}
          sessionsToday={sessionsToday}
        />

        {/* Timer Panels Grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mt: 2 }}>
          {units.map(unit => (
            <TimerPanel
              key={unit.id}
              unit={unit}
              onAddTime={handleAddTime}
              onTimerUpdate={handleTimerUpdate}
            />
          ))}
        </Box>
      </Container>
    </Box>
  );
}
