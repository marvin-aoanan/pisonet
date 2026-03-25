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
  Divider
} from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

function AdminSettings() {
  const [settings, setSettings] = useState({});
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingUnits, setSavingUnits] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const [settingsResponse, unitsResponse] = await Promise.all([
        axios.get(`${API_URL}/settings`),
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
        axios.put(`${API_URL}/settings/${key}`, { value: settings[key] })
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
        units.map((unit) => axios.put(`${API_URL}/units/${unit.id}`, {
          mac_address: unit.mac_address || '',
          ip_address: unit.ip_address || ''
        }))
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

  if (loading) return <CircularProgress />;

  return (
    <Box maxWidth="md">
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        System Configuration
      </Typography>

      <Paper elevation={3} sx={{ p: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Pricing & Time
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Seconds per Peso"
              type="number"
              helperText={`Currently: ${settings.peso_to_seconds} seconds = ₱1. (60 = 1 min/peso)`}
              value={settings.peso_to_seconds || ''}
              onChange={(e) => handleChange('peso_to_seconds', e.target.value)}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Max Session Duration (Seconds)"
              type="number"
              value={settings.max_session_duration || ''}
              onChange={(e) => handleChange('max_session_duration', e.target.value)}
            />
          </Grid>

          <Grid item xs={12}>
             <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }} gutterBottom>
              System Behavior
            </Typography>
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              select
              fullWidth
              label="Auto Logout"
              value={settings.auto_logout || 'true'}
              onChange={(e) => handleChange('auto_logout', e.target.value)}
              SelectProps={{
                native: true,
              }}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </TextField>
          </Grid>

          <Grid item xs={12}>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }} gutterBottom>
              Unit Network Config
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Set each unit IP/MAC mapping here. Use DHCP reservation on your router to make these IPs truly static.
            </Typography>
          </Grid>

          {units.map((unit) => (
            <React.Fragment key={unit.id}>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Unit"
                  value={unit.name || `PC ${unit.id}`}
                  InputProps={{ readOnly: true }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Static IP"
                  placeholder="e.g. 192.168.1.101"
                  value={unit.ip_address || ''}
                  onChange={(e) => handleUnitChange(unit.id, 'ip_address', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={5}>
                <TextField
                  fullWidth
                  label="MAC Address"
                  placeholder="e.g. AA:BB:CC:DD:EE:FF"
                  value={unit.mac_address || ''}
                  onChange={(e) => handleUnitChange(unit.id, 'mac_address', e.target.value)}
                />
              </Grid>
            </React.Fragment>
          ))}

          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 1 }}>
              <Button
                variant="outlined"
                onClick={handleSaveUnitNetwork}
                disabled={savingUnits}
              >
                {savingUnits ? 'Saving Unit Config...' : 'Save Unit Network'}
              </Button>
            </Box>
          </Grid>

          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
              <Button 
                variant="contained" 
                size="large" 
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </Box>
          </Grid>
        </Grid>
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