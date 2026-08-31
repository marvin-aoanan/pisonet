import React, { useEffect, useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Computer as ComputerIcon,
  Storefront as StorefrontIcon,
  Inventory2 as InventoryIcon,
  Print as PrintIcon,
  ReceiptLong as TransactionIcon,
  BarChart as ReportsIcon,
  Paid as CoinsOutIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';

import AdminDashboard from './AdminDashboard';
import AdminPcRental from './AdminPcRental';
import PrintServices from './PrintServices';
import AdminTransactions from './AdminTransactions';
import AdminReports from './AdminReports';
import AdminCoinsOut from './AdminCoinsOut';
import AdminSettings from './AdminSettings';
import AdminProducts from './AdminProducts';
import StoreView from './StoreView';

const STORE_SUBTAB_STORAGE_KEY = 'admin.storeSubtab';

function getInitialStoreSubtab() {
  if (typeof window === 'undefined') {
    return 0;
  }

  const storedValue = window.localStorage.getItem(STORE_SUBTAB_STORAGE_KEY);
  if (storedValue === '1') {
    return 1;
  }
  return 0;
}

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

function AdminView({ units, totalRevenue, onControl, onTestWake, onAddTime, onOpenTime, onStopOpenTime, onPauseTimer, onResumeTimer, adminPassword, onAdminPasswordChanged, onPosSaleRecorded }) {
  const [value, setValue] = useState(0);
  const [storeTab, setStoreTab] = useState(getInitialStoreSubtab);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORE_SUBTAB_STORAGE_KEY, String(storeTab));
  }, [storeTab]);

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  const handleStoreTabChange = (event, newValue) => {
    setStoreTab(newValue);
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
          <Tab icon={<ComputerIcon />} iconPosition={isMobile ? 'top' : 'start'} label="PC Rental" sx={{ minHeight: isMobile ? 44 : 48 }} />
          <Tab icon={<StorefrontIcon />} iconPosition={isMobile ? 'top' : 'start'} label="Store" sx={{ minHeight: isMobile ? 44 : 48 }} />
          <Tab icon={<PrintIcon />} iconPosition={isMobile ? 'top' : 'start'} label="Print Services" sx={{ minHeight: isMobile ? 44 : 48 }} />
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
          onTestWake={onTestWake}
          onAddTime={onAddTime}
          onOpenTime={onOpenTime}
          onStopOpenTime={onStopOpenTime}
          onPauseTimer={onPauseTimer}
          onResumeTimer={onResumeTimer}
          adminPassword={adminPassword}
        />
      </TabPanel>
      <TabPanel value={value} index={1} isMobile={isMobile}>
        <AdminPcRental
          units={units}
          onControl={onControl}
          onTestWake={onTestWake}
          onAddTime={onAddTime}
          onOpenTime={onOpenTime}
          onStopOpenTime={onStopOpenTime}
          onPauseTimer={onPauseTimer}
          onResumeTimer={onResumeTimer}
          adminPassword={adminPassword}
        />
      </TabPanel>
      <TabPanel value={value} index={2} isMobile={isMobile}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs
            value={storeTab}
            onChange={handleStoreTabChange}
            aria-label="store subtabs"
            variant={isMobile ? 'fullWidth' : 'standard'}
          >
            <Tab label="POS" />
            <Tab icon={<InventoryIcon />} iconPosition={isMobile ? 'top' : 'start'} label="Products" />
          </Tabs>
        </Box>
        {storeTab === 0 ? (
          <StoreView adminPassword={adminPassword} onSaleRecorded={onPosSaleRecorded} />
        ) : (
          <AdminProducts adminPassword={adminPassword} />
        )}
      </TabPanel>
      <TabPanel value={value} index={3} isMobile={isMobile}>
        <PrintServices />
      </TabPanel>
      <TabPanel value={value} index={4} isMobile={isMobile}>
        <AdminTransactions adminPassword={adminPassword} />
      </TabPanel>
      <TabPanel value={value} index={5} isMobile={isMobile}>
        <AdminReports adminPassword={adminPassword} />
      </TabPanel>
      <TabPanel value={value} index={6} isMobile={isMobile}>
        <AdminCoinsOut adminPassword={adminPassword} />
      </TabPanel>
      <TabPanel value={value} index={7} isMobile={isMobile}>
        <AdminSettings
          adminPassword={adminPassword}
          onAdminPasswordChanged={onAdminPasswordChanged}
        />
      </TabPanel>
    </Box>
  );
}

export default AdminView;
