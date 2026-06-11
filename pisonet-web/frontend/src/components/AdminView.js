import React, { useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  ReceiptLong as TransactionIcon,
  BarChart as ReportsIcon,
  Paid as CoinsOutIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';

import AdminDashboard from './AdminDashboard';
import AdminTransactions from './AdminTransactions';
import AdminReports from './AdminReports';
import AdminCoinsOut from './AdminCoinsOut';
import AdminSettings from './AdminSettings';

function TabPanel(props) {
  const { children, value, index, isMobile, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: isMobile ? 1.5 : 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function AdminView({ units, totalRevenue, onControl, onAddTime, onOpenTime, onStopOpenTime, onPauseTimer, onResumeTimer, adminPassword, onAdminPasswordChanged }) {
  const [value, setValue] = useState(0);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={value}
          onChange={handleChange}
          aria-label="admin tabs"
          variant={isMobile ? 'scrollable' : 'standard'}
          allowScrollButtonsMobile
          scrollButtons={isMobile ? 'auto' : false}
          sx={{ minHeight: isMobile ? 44 : 48 }}
        >
          <Tab icon={<DashboardIcon />} iconPosition={isMobile ? 'top' : 'start'} label="Dashboard" sx={{ minHeight: isMobile ? 44 : 48 }} />
          <Tab icon={<TransactionIcon />} iconPosition={isMobile ? 'top' : 'start'} label="Transactions" sx={{ minHeight: isMobile ? 44 : 48 }} />
          <Tab icon={<ReportsIcon />} iconPosition={isMobile ? 'top' : 'start'} label="Reports" sx={{ minHeight: isMobile ? 44 : 48 }} />
          <Tab icon={<CoinsOutIcon />} iconPosition={isMobile ? 'top' : 'start'} label="Coins Out" sx={{ minHeight: isMobile ? 44 : 48 }} />
          <Tab icon={<SettingsIcon />} iconPosition={isMobile ? 'top' : 'start'} label="Settings" sx={{ minHeight: isMobile ? 44 : 48 }} />
        </Tabs>
      </Box>

      <TabPanel value={value} index={0} isMobile={isMobile}>
        <AdminDashboard 
          units={units}
          totalRevenue={totalRevenue}
          onControl={onControl}
          onAddTime={onAddTime}
          onOpenTime={onOpenTime}
          onStopOpenTime={onStopOpenTime}
          onPauseTimer={onPauseTimer}
          onResumeTimer={onResumeTimer}
          adminPassword={adminPassword}
        />
      </TabPanel>
      <TabPanel value={value} index={1} isMobile={isMobile}>
        <AdminTransactions adminPassword={adminPassword} />
      </TabPanel>
      <TabPanel value={value} index={2} isMobile={isMobile}>
        <AdminReports />
      </TabPanel>
      <TabPanel value={value} index={3} isMobile={isMobile}>
        <AdminCoinsOut adminPassword={adminPassword} />
      </TabPanel>
      <TabPanel value={value} index={4} isMobile={isMobile}>
        <AdminSettings
          adminPassword={adminPassword}
          onAdminPasswordChanged={onAdminPasswordChanged}
        />
      </TabPanel>
    </Box>
  );
}

export default AdminView;
