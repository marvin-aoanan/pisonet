import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Paper,
  Typography,
  Box,
  TextField,
  Button,
  Grid,
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
  TableRow
} from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

function AdminSettings({ adminPassword, onAdminPasswordChanged }) {
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

  const saveButtonSx = {
    minWidth: 210
  };

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
      const [settingsResponse, unitsResponse] = await Promise.all([
        axios.get(`${API_URL}/settings`, {
          headers: { 'x-admin-password': adminPassword }
        }),
        axios.get(`${API_URL}/units`)
      ]);
      setSettings(settingsResponse.data);
      setUnits(unitsResponse.data || []);
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
            ip_address: unit.ip_address || ''
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
          sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}
        >
          <Tab label="Pricing & Time Settings" />
          <Tab label="Admin Password" />
          <Tab label="Unit Network Config" />
        </Tabs>

        {activeTab === 0 && (
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Pricing & Time */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Pricing & Time
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  fullWidth
                  label="Seconds per Peso"
                  type="number"
                  helperText={`Currently: ${settings.peso_to_seconds} seconds = ₱1. (60 = 1 min/peso)`}
                  value={settings.peso_to_seconds || ''}
                  onChange={(e) => handleChange('peso_to_seconds', e.target.value)}
                />
                <TextField
                  fullWidth
                  label="Max Session Duration (Seconds)"
                  type="number"
                  value={settings.max_session_duration || ''}
                  onChange={(e) => handleChange('max_session_duration', e.target.value)}
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

            {/* Save */}
            <Box>
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
            <Box>
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
                    <TableCell sx={{ width: '20%', fontWeight: 700 }}>Unit</TableCell>
                    <TableCell sx={{ width: '40%', fontWeight: 700 }}>Static IP</TableCell>
                    <TableCell sx={{ width: '40%', fontWeight: 700 }}>MAC Address</TableCell>
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
                          placeholder="e.g. 192.168.1.101"
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 2 }}>
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