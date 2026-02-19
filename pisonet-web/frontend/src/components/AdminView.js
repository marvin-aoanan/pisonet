import React, { useState } from 'react';
import {
  Box,
  Tabs,
  Tab
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  ReceiptLong as TransactionIcon,
  BarChart as ReportsIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';

import AdminDashboard from './AdminDashboard';
import AdminTransactions from './AdminTransactions';
import AdminReports from './AdminReports';
import AdminSettings from './AdminSettings';



function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function AdminView({ units, totalRevenue, onControl, onAddTime }) {
  const [value, setValue] = useState(0);

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={value} onChange={handleChange} aria-label="admin tabs">
          <Tab icon={<DashboardIcon />} iconPosition="start" label="Dashboard" />
          <Tab icon={<TransactionIcon />} iconPosition="start" label="Transactions" />
          <Tab icon={<ReportsIcon />} iconPosition="start" label="Reports" />
          <Tab icon={<SettingsIcon />} iconPosition="start" label="Settings" />
        </Tabs>
      </Box>

      <TabPanel value={value} index={0}>
        <AdminDashboard 
          units={units}
          totalRevenue={totalRevenue}
          onControl={onControl}
          onAddTime={onAddTime}
        />
      </TabPanel>
      <TabPanel value={value} index={1}>
        <AdminTransactions />
      </TabPanel>
      <TabPanel value={value} index={2}>
        <AdminReports />
      </TabPanel>
      <TabPanel value={value} index={3}>
        <AdminSettings />
      </TabPanel>
    </Box>
  );
}

export default AdminView;
