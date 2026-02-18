'use client';

import { Paper, Typography, Box } from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  AccountBalance as AccountBalanceIcon,
  People as PeopleIcon,
} from '@mui/icons-material';

interface RevenueStatsProps {
  revenueToday: number;
  revenueAll: number;
  sessionsToday: number;
}

export default function RevenueStats({ revenueToday, revenueAll, sessionsToday }: RevenueStatsProps) {
  const stats = [
    {
      title: 'Revenue Today',
      value: `₱${revenueToday}`,
      icon: <TrendingUpIcon sx={{ fontSize: 40 }} />,
      color: '#00ff00',
    },
    {
      title: 'Total Revenue',
      value: `₱${revenueAll}`,
      icon: <AccountBalanceIcon sx={{ fontSize: 40 }} />,
      color: '#00b3ff',
    },
    {
      title: 'Sessions Today',
      value: sessionsToday.toString(),
      icon: <PeopleIcon sx={{ fontSize: 40 }} />,
      color: '#ff8800',
    },
  ];

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 2 }}>
      {stats.map((stat, index) => (
        <Paper
          key={index}
          sx={{
            p: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: 'linear-gradient(135deg, rgba(26,26,46,0.8) 0%, rgba(22,33,62,0.8) 100%)',
            border: `1px solid ${stat.color}33`,
          }}
        >
          <Box sx={{ color: stat.color }}>
            {stat.icon}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {stat.title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: stat.color }}>
              {stat.value}
            </Typography>
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
