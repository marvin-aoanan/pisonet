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
  CircularProgress
} from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

function AdminSettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings`);
      setSettings(response.data);
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