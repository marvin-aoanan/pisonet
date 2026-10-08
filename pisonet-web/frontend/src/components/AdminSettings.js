import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Paper,
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  Snackbar,
  CircularProgress,
  Divider,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Radio,
  RadioGroup,
  FormControlLabel,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

function AdminSettings({ adminPassword, onAdminPasswordChanged }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [settings, setSettings] = useState({});
  const [units, setUnits] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingUnits, setSavingUnits] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [printServicePrices, setPrintServicePrices] = useState({});
  const [savingPrintServices, setSavingPrintServices] = useState(false);
  const [opexMetadata, setOpexMetadata] = useState({
    categories: [],
    fund_sources: [],
    entry_type_options: {
      operating: [],
      capital: [],
      financing: [],
      asset: [],
    },
  });
  const [savingOpexMetadata, setSavingOpexMetadata] = useState(false);

  const printServiceLabels = {
    document_short_bw: 'Document Short (A4/Letter) - B&W',
    document_short_color: 'Document Short (A4/Letter) - Color',
    document_long_bw: 'Document Long (Legal) - B&W',
    document_long_color: 'Document Long (Legal) - Color',
    photo_short_bw: 'Photo Short (A4/Letter) - B&W',
    photo_short_color: 'Photo Short (A4/Letter) - Color',
    photo_long_bw: 'Photo Long (Legal) - B&W',
    photo_long_color: 'Photo Long (Legal) - Color',
    photo_short_special: 'Photo Short (A4/Letter) - Special Paper',
    photo_long_special: 'Photo Long (Legal) - Special Paper',
  };

  const saveButtonSx = {
    minWidth: 210,
    width: isMobile ? '100%' : 'auto'
  };

  const listToText = (list) => (Array.isArray(list) ? list.join(', ') : '');

  const textToList = (value) => String(value || '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  useEffect(() => {
    fetchSettings();
  }, [adminPassword]);

  const fetchSettings = async () => {
    if (!adminPassword) {
      setLoading(false);
      setMessage({ type: 'error', text: 'Admin password is required to load settings.' });
      return;
    }

    try {
      const [settingsResponse, unitsResponse, pricesResponse, opexResponse] = await Promise.all([
        axios.get(`${API_URL}/settings`, {
          headers: { 'x-admin-password': adminPassword }
        }),
        axios.get(`${API_URL}/units`),
        axios.get(`${API_URL}/settings/admin/print-services`, {
          headers: { 'x-admin-password': adminPassword }
        }),
        axios.get(`${API_URL}/opex/metadata`, {
          headers: { 'x-admin-password': adminPassword }
        })
      ]);
      setSettings(settingsResponse.data);
      setUnits(unitsResponse.data || []);
      setPrintServicePrices(pricesResponse.data || {});
      setOpexMetadata(opexResponse.data?.data || {
        categories: [],
        fund_sources: [],
        entry_type_options: {
          operating: [],
          capital: [],
          financing: [],
          asset: [],
        },
      });
    } catch (err) {
      console.error('Error fetching settings:', err);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };


  const handleSave = async () => {
    setSaving(true);
    try {
      // Save each setting individually since the API is likely key-based update
      // Taking a simpler approach: Promise.all for all keys
      const promises = Object.keys(settings).map(key => 
        axios.put(
          `${API_URL}/settings/${key}`,
          { value: settings[key] },
          { headers: { 'x-admin-password': adminPassword } }
        )
      );
      
      await Promise.all(promises);
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (err) {
      console.error('Error saving settings:', err);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleUnitChange = (unitId, key, value) => {
    setUnits((prev) => prev.map((unit) => (
      unit.id === unitId ? { ...unit, [key]: value } : unit
    )));
  };

  const handleSaveUnitNetwork = async () => {
    setSavingUnits(true);
    try {
      await Promise.all(
        units.map((unit) => axios.put(
          `${API_URL}/units/${unit.id}`,
          {
            mac_address: unit.mac_address || '',
            ip_address: unit.ip_address || '',
            status_mode: unit.status_mode || 'active'
          },
          { headers: { 'x-admin-password': adminPassword } }
        ))
      );
      setMessage({ type: 'success', text: 'Unit network config saved successfully!' });
    } catch (err) {
      const errorText = err?.response?.data?.error || 'Failed to save unit network config';
      console.error('Error saving unit network config:', err);
      setMessage({ type: 'error', text: errorText });
    } finally {
      setSavingUnits(false);
    }
  };

  const handleChangeAdminPassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Fill out all password fields.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    if (newPassword.length < 4) {
      setMessage({ type: 'error', text: 'New password must be at least 4 characters.' });
      return;
    }

    setChangingPassword(true);
    try {
      await axios.put(`${API_URL}/settings/admin/password`, {
        currentPassword,
        newPassword
      });

      if (onAdminPasswordChanged) {
        onAdminPasswordChanged(newPassword);
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: 'Admin password updated successfully!' });
    } catch (err) {
      const errorText = err?.response?.data?.error || 'Failed to update admin password';
      console.error('Error updating admin password:', err);
      setMessage({ type: 'error', text: errorText });
    } finally {
      setChangingPassword(false);
    }
  };

  const handlePrintServicePriceChange = (serviceId, newPrice) => {
    const price = Math.max(0, parseFloat(newPrice) || 0);
    setPrintServicePrices(prev => ({
      ...prev,
      [serviceId]: price
    }));
  };

  const handleSavePrintServicePrices = async () => {
    setSavingPrintServices(true);
    try {
      await axios.put(
        `${API_URL}/settings/admin/print-services`,
        printServicePrices,
        { headers: { 'x-admin-password': adminPassword } }
      );
      setMessage({ type: 'success', text: 'Print service prices updated successfully!' });
    } catch (err) {
      const errorText = err?.response?.data?.error || 'Failed to update print service prices';
      console.error('Error updating print service prices:', err);
      setMessage({ type: 'error', text: errorText });
    } finally {
      setSavingPrintServices(false);
    }
  };

  const handleOpexMetadataChange = (field, value) => {
    setOpexMetadata((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleOpexEntryTypesChange = (group, value) => {
    setOpexMetadata((prev) => ({
      ...prev,
      entry_type_options: {
        ...(prev.entry_type_options || {}),
        [group]: value,
      },
    }));
  };

  const handleSaveOpexMetadata = async () => {
    setSavingOpexMetadata(true);
    try {
      await axios.put(
        `${API_URL}/opex/metadata`,
        {
          categories: textToList(opexMetadata.categories),
          fund_sources: textToList(opexMetadata.fund_sources),
          entry_type_options: {
            operating: textToList(opexMetadata.entry_type_options?.operating),
            capital: textToList(opexMetadata.entry_type_options?.capital),
            financing: textToList(opexMetadata.entry_type_options?.financing),
            asset: textToList(opexMetadata.entry_type_options?.asset),
          },
        },
        { headers: { 'x-admin-password': adminPassword } }
      );
      setMessage({ type: 'success', text: 'OPEX metadata saved successfully!' });
    } catch (err) {
      const errorText = err?.response?.data?.error?.message || 'Failed to save OPEX metadata';
      console.error('Error saving OPEX metadata:', err);
      setMessage({ type: 'error', text: errorText });
    } finally {
      setSavingOpexMetadata(false);
    }
  };


  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box maxWidth="lg">
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        System Configuration
      </Typography>

      <Paper elevation={3}>
        <Tabs
          value={activeTab}
          onChange={(event, nextTab) => setActiveTab(nextTab)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider', 
            px: 1,
            '& .MuiTab-root': {
              fontSize: isMobile ? '0.75rem' : '0.875rem',
              minWidth: isMobile ? 'auto' : 'auto'
            }
          }}
        >
          <Tab label="Pricing & Time Settings" />
          <Tab label="Admin Password" />
          <Tab label="Unit Network Config" />
          <Tab label="Print Services Pricing" />
          <Tab label="OPEX Settings" />
        </Tabs>

        {activeTab === 0 && (
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Pricing & Time */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Pricing & Time
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Flat-rate pricing (applies to both Open Time and Pre-defined Add/Deduct Time):
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
                  <TextField
                    fullWidth
                    label="Tier 1 Minutes"
                    type="number"
                    value={settings.flat_rate_tier1_minutes || '15'}
                    onChange={(e) => handleChange('flat_rate_tier1_minutes', e.target.value)}
                    inputProps={{ min: 1 }}
                  />
                  <TextField
                    fullWidth
                    label="Tier 1 Price (₱)"
                    type="number"
                    value={settings.flat_rate_tier1_price || '5'}
                    onChange={(e) => handleChange('flat_rate_tier1_price', e.target.value)}
                    inputProps={{ min: 1, step: '0.01' }}
                  />
                  <TextField
                    fullWidth
                    label="Tier 2 Minutes"
                    type="number"
                    value={settings.flat_rate_tier2_minutes || '30'}
                    onChange={(e) => handleChange('flat_rate_tier2_minutes', e.target.value)}
                    inputProps={{ min: 1 }}
                  />
                  <TextField
                    fullWidth
                    label="Tier 2 Price (₱)"
                    type="number"
                    value={settings.flat_rate_tier2_price || '10'}
                    onChange={(e) => handleChange('flat_rate_tier2_price', e.target.value)}
                    inputProps={{ min: 1, step: '0.01' }}
                  />
                  <TextField
                    fullWidth
                    label="Tier 3 Minutes"
                    type="number"
                    value={settings.flat_rate_tier3_minutes || '60'}
                    onChange={(e) => handleChange('flat_rate_tier3_minutes', e.target.value)}
                    inputProps={{ min: 1 }}
                  />
                  <TextField
                    fullWidth
                    label="Tier 3 Price (₱)"
                    type="number"
                    value={settings.flat_rate_tier3_price || '15'}
                    onChange={(e) => handleChange('flat_rate_tier3_price', e.target.value)}
                    inputProps={{ min: 1, step: '0.01' }}
                  />
                  <TextField
                    fullWidth
                    label="Tier 4 Minutes"
                    type="number"
                    value={settings.flat_rate_tier4_minutes || '75'}
                    onChange={(e) => handleChange('flat_rate_tier4_minutes', e.target.value)}
                    inputProps={{ min: 1 }}
                  />
                  <TextField
                    fullWidth
                    label="Tier 4 Price (₱)"
                    type="number"
                    value={settings.flat_rate_tier4_price || '20'}
                    onChange={(e) => handleChange('flat_rate_tier4_price', e.target.value)}
                    inputProps={{ min: 1, step: '0.01' }}
                  />
                </Box>
                <Alert severity="info">
                  Current target: 15 mins = ₱5, 30 mins = ₱10, 60 mins = ₱15, 75 mins = ₱20.
                </Alert>
                <Divider />
                <TextField
                  fullWidth
                  label="Minutes per Peso"
                  type="number"
                  helperText={`Currently: ${Number(settings.peso_to_seconds || 0) / 60} minute(s) = ₱1.`}
                  value={settings.peso_to_seconds ? Number(settings.peso_to_seconds) / 60 : ''}
                  onChange={(e) => handleChange('peso_to_seconds', String(Number(e.target.value || 0) * 60))}
                />
              </Box>
            </Box>

            <Divider />

            {/* System Behavior */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                System Behavior
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  select
                  fullWidth
                  label="Auto Logout"
                  value={settings.auto_logout || 'true'}
                  onChange={(e) => handleChange('auto_logout', e.target.value)}
                  SelectProps={{ native: true }}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </TextField>
              </Box>
            </Box>

            <Divider />

            {/* Electricity Consumption */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Electricity Consumption
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  fullWidth
                  label="Estimated PC Wattage (W)"
                  type="number"
                  helperText="Used for the Estimated Electricity Consumption report."
                  value={settings.estimated_pc_wattage || ''}
                  onChange={(e) => handleChange('estimated_pc_wattage', e.target.value)}
                />
                <TextField
                  fullWidth
                  label="Estimated Electricity Rate (₱/kWh)"
                  type="number"
                  helperText="Used to estimate electricity cost from computed consumption."
                  value={settings.estimated_kwh_rate || ''}
                  onChange={(e) => handleChange('estimated_kwh_rate', e.target.value)}
                />
              </Box>
            </Box>

            <Divider />

            {/* Save */}
            <Box sx={{ display: 'flex', justifyContent: isMobile ? 'center' : 'flex-start' }}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={saving}
                sx={saveButtonSx}
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </Box>

          </Box>
        )}

        {activeTab === 1 && (
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Password fields */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Change Password
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  fullWidth
                  type="password"
                  label="Current Password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <TextField
                  fullWidth
                  type="password"
                  label="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  helperText="Minimum 4 characters"
                />
                <TextField
                  fullWidth
                  type="password"
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </Box>
            </Box>

            <Divider />

            {/* Save */}
            <Box sx={{ display: 'flex', justifyContent: isMobile ? 'center' : 'flex-start' }}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleChangeAdminPassword}
                disabled={changingPassword}
                sx={saveButtonSx}
              >
                {changingPassword ? 'Saving...' : 'Save'}
              </Button>
            </Box>

          </Box>
        )}

        {activeTab === 2 && (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Set each unit IP/MAC mapping here. Use DHCP reservation on your router to make these IPs truly static.
            </Typography>

            <TableContainer
              sx={{
                maxHeight: 420,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1
              }}
            >
              <Table stickyHeader size="small" aria-label="unit network configuration table">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '18%', fontWeight: 700 }}>Unit</TableCell>
                    <TableCell sx={{ width: '28%', fontWeight: 700 }}>Static IP</TableCell>
                    <TableCell sx={{ width: '28%', fontWeight: 700 }}>MAC Address</TableCell>
                    <TableCell sx={{ width: '26%', fontWeight: 700 }}>Status Mode</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {units.map((unit) => (
                    <TableRow key={unit.id} hover>
                      <TableCell>
                        <TextField
                          fullWidth
                          value={unit.name || `PC ${unit.id}`}
                          InputProps={{ readOnly: true }}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          placeholder="e.g. 192.168.254.101"
                          value={unit.ip_address || ''}
                          onChange={(e) => handleUnitChange(unit.id, 'ip_address', e.target.value)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          placeholder="e.g. AA:BB:CC:DD:EE:FF"
                          value={unit.mac_address || ''}
                          onChange={(e) => handleUnitChange(unit.id, 'mac_address', e.target.value)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <RadioGroup
                          row
                          value={String(unit.status_mode || 'active').toLowerCase()}
                          onChange={(e) => handleUnitChange(unit.id, 'status_mode', e.target.value)}
                        >
                          <FormControlLabel value="active" control={<Radio size="small" />} label="Active" />
                          <FormControlLabel value="maintenance" control={<Radio size="small" />} label="Maintenance" />
                        </RadioGroup>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Box sx={{ display: 'flex', justifyContent: isMobile ? 'center' : 'flex-start', mt: 2 }}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveUnitNetwork}
                disabled={savingUnits}
                sx={saveButtonSx}
              >
                {savingUnits ? 'Saving...' : 'Save'}
              </Button>
            </Box>
          </Box>
        )}

        {activeTab === 3 && (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Configure pricing for print services. Prices are in Philippine Pesos (₱) per page.
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 3 }}>
              {Object.entries(printServiceLabels).map(([serviceId, label]) => (
                <Box key={serviceId} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                      {label}
                    </Typography>
                  </Box>
                  <TextField
                    type="number"
                    inputProps={{ step: '0.50', min: '0' }}
                    value={printServicePrices[serviceId] || ''}
                    onChange={(e) => handlePrintServicePriceChange(serviceId, e.target.value)}
                    sx={{ width: 120 }}
                    size="small"
                    label="Price (₱)"
                  />
                </Box>
              ))}
            </Box>

            <Box sx={{ display: 'flex', justifyContent: isMobile ? 'center' : 'flex-start', mt: 4, gap: 2 }}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSavePrintServicePrices}
                disabled={savingPrintServices}
                sx={saveButtonSx}
              >
                {savingPrintServices ? 'Saving...' : 'Save Prices'}
              </Button>
            </Box>
          </Box>
        )}

        {activeTab === 4 && (
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                OPEX Categories
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={3}
                value={listToText(opexMetadata.categories)}
                onChange={(e) => handleOpexMetadataChange('categories', textToList(e.target.value))}
                helperText="Comma-separated list. Example: Utilities, Rent, Supplies"
              />
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                OPEX Fund Sources
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={3}
                value={listToText(opexMetadata.fund_sources)}
                onChange={(e) => handleOpexMetadataChange('fund_sources', textToList(e.target.value))}
                helperText="Comma-separated list. Example: Owner Top-up, Loan, Refund"
              />
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                OPEX Entry Types
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  label="Operating"
                  value={listToText(opexMetadata.entry_type_options?.operating)}
                  onChange={(e) => handleOpexEntryTypesChange('operating', textToList(e.target.value))}
                  helperText="rent, utilities, internet, salary, maintenance..."
                />
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  label="Capital"
                  value={listToText(opexMetadata.entry_type_options?.capital)}
                  onChange={(e) => handleOpexEntryTypesChange('capital', textToList(e.target.value))}
                  helperText="initial_capital, owner_topup, partner_investment..."
                />
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  label="Financing"
                  value={listToText(opexMetadata.entry_type_options?.financing)}
                  onChange={(e) => handleOpexEntryTypesChange('financing', textToList(e.target.value))}
                  helperText="loan_proceeds, loan_payment, interest_payment..."
                />
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  label="Asset"
                  value={listToText(opexMetadata.entry_type_options?.asset)}
                  onChange={(e) => handleOpexEntryTypesChange('asset', textToList(e.target.value))}
                  helperText="pc_purchase, printer_purchase, renovation..."
                />
              </Box>
            </Box>

            <Divider />

            <Box sx={{ display: 'flex', justifyContent: isMobile ? 'center' : 'flex-start' }}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveOpexMetadata}
                disabled={savingOpexMetadata}
                sx={saveButtonSx}
              >
                {savingOpexMetadata ? 'Saving...' : 'Save OPEX Settings'}
              </Button>
            </Box>
          </Box>
        )}
      </Paper>

      <Snackbar 
        open={!!message.text} 
        autoHideDuration={6000} 
        onClose={() => setMessage({ type: '', text: '' })}
      >
        <Alert severity={message.type || 'info'} onClose={() => setMessage({ type: '', text: '' })}>
          {message.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default AdminSettings;