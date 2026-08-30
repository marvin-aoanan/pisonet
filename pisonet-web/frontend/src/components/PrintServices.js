import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Button,
  Paper,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  useMediaQuery,
  useTheme,
  CircularProgress,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Grid,
} from '@mui/material';
import { Print as PrintIcon } from '@mui/icons-material';

const API_URL = 'http://localhost:5001/api';

const DEFAULT_PRICING = {
  document_short_bw: 3,
  document_short_color: 5,
  document_long_bw: 5,
  document_long_color: 7,
  photo_short_bw: 5,
  photo_short_color: 10,
  photo_long_bw: 10,
  photo_long_color: 15,
  photo_short_special: 20,
  photo_long_special: 30,
};

function PrintServices() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [currentServiceType, setCurrentServiceType] = useState(null); // 'document' or 'photo'
  const [size, setSize] = useState('short'); // 'short' or 'long'
  const [hasImage, setHasImage] = useState(false); // false for document, true for photo
  const [isColor, setIsColor] = useState(false); // false for B&W, true for color
  const [paperType, setPaperType] = useState('ordinary'); // 'ordinary' or 'special' (photo only)
  const [pageCount, setPageCount] = useState(1);
  const [printDescription, setPrintDescription] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [recordingLoading, setRecordingLoading] = useState(false);

  useEffect(() => {
    fetchPrintServicePrices();
  }, []);

  const fetchPrintServicePrices = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings/print-services`);
      setPricing(response.data || DEFAULT_PRICING);
    } catch (err) {
      console.error('Failed to fetch print service prices:', err);
      setPricing(DEFAULT_PRICING);
    } finally {
      setLoading(false);
    }
  };

  const getPricePerPage = () => {
    if (hasImage && paperType === 'special') {
      return pricing[`photo_${size}_special`] || 0;
    }
    const typePrefix = hasImage ? 'photo' : 'document';
    const key = `${typePrefix}_${size}_${isColor ? 'color' : 'bw'}`;
    return pricing[key] || 0;
  };

  const getTotalPrice = () => {
    return getPricePerPage() * pageCount;
  };

  const getServiceTypeId = () => {
    if (hasImage && paperType === 'special') {
      return `print_photo_${size}_special`;
    }
    const typePrefix = hasImage ? 'photo' : 'document';
    return `print_${typePrefix}_${size}_${isColor ? 'color' : 'bw'}`;
  };

  const handleOpenDialog = (serviceType) => {
    setCurrentServiceType(serviceType);
    setSize('short');
    setHasImage(serviceType === 'photo');
    setIsColor(false);
    setPaperType('ordinary');
    setPageCount(1);
    setPrintDescription('');
    setMessage({ type: '', text: '' });
    setPrintDialogOpen(true);
  };

  const handleConfirm = async () => {
    if (pageCount < 1) {
      setMessage({ type: 'error', text: 'Please enter at least 1 page' });
      return;
    }

    try {
      setRecordingLoading(true);
      const serviceTypeId = getServiceTypeId();
      const totalPrice = getTotalPrice();

      await axios.post(`${API_URL}/transactions/print-service`, {
        service_type: serviceTypeId,
        pages_count: pageCount,
        description: String(printDescription || '').trim() || null,
      });

      const sizeLabel = size === 'short' ? 'A4/Letter' : 'Legal';
      const colorLabel = isColor ? 'Color' : 'B&W';
      const typeLabel = hasImage ? 'Photo' : 'Document';
      const paperLabel = hasImage ? (paperType === 'special' ? ', Special Paper' : ', Ordinary Paper') : '';
      setMessage({
        type: 'success',
        text: `${typeLabel} (${sizeLabel}, ${paperType === 'special' && hasImage ? 'Special Paper' : colorLabel}${paperLabel && paperType !== 'special' ? paperLabel : ''}) x${pageCount} = ₱${totalPrice.toFixed(2)}`,
      });

      setTimeout(() => {
        setPrintDialogOpen(false);
        setPrintDescription('');
        setMessage({ type: '', text: '' });
      }, 2000);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err?.response?.data?.error || 'Failed to record print service',
      });
    } finally {
      setRecordingLoading(false);
    }
  };

  const handleCancel = () => {
    setPrintDialogOpen(false);
    setPrintDescription('');
    setMessage({ type: '', text: '' });
  };

  return (
    <Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <PrintIcon sx={{ fontSize: 32, mr: 1.5, color: 'primary.main' }} />
            <Typography variant="h6">Print Services</Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Button
                fullWidth
                variant="contained"
                onClick={() => handleOpenDialog('document')}
                disabled={recordingLoading}
                sx={{
                  p: 3,
                  backgroundColor: '#f0f4ff',
                  color: 'primary.main',
                  border: '2px solid',
                  borderColor: 'primary.main',
                  '&:hover': {
                    backgroundColor: 'primary.main',
                    color: '#ffffff',
                  },
                  '&:disabled': {
                    opacity: 0.6,
                  },
                  textAlign: 'left',
                }}
              >
                <Box sx={{ width: '100%' }}>
                  <Typography variant="h6" fontWeight="600" sx={{ color: 'inherit', mb: 1 }}>
                    📄 Document
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'inherit', opacity: 0.9 }}>
                    Text only printing
                  </Typography>
                </Box>
              </Button>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Button
                fullWidth
                variant="contained"
                onClick={() => handleOpenDialog('photo')}
                disabled={recordingLoading}
                sx={{
                  p: 3,
                  backgroundColor: '#f0f4ff',
                  color: 'primary.main',
                  border: '2px solid',
                  borderColor: 'primary.main',
                  '&:hover': {
                    backgroundColor: 'primary.main',
                    color: '#ffffff',
                  },
                  '&:disabled': {
                    opacity: 0.6,
                  },
                  textAlign: 'left',
                }}
              >
                <Box sx={{ width: '100%' }}>
                  <Typography variant="h6" fontWeight="600" sx={{ color: 'inherit', mb: 1 }}>
                    🖼️ Photo
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'inherit', opacity: 0.9 }}>
                    Printing with images
                  </Typography>
                </Box>
              </Button>
            </Grid>
          </Grid>
        </Paper>
      )}

      <Dialog open={printDialogOpen} onClose={handleCancel} maxWidth="sm" fullWidth>
        <DialogTitle>
          {currentServiceType === 'photo' ? '🖼️ Photo Printing' : '📄 Document Printing'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {/* Size Selection */}
          <FormControl sx={{ mb: 3, display: 'block' }}>
            <FormLabel sx={{ mb: 1, fontWeight: 600 }}>Size</FormLabel>
            <RadioGroup row value={size} onChange={(e) => setSize(e.target.value)}>
              <FormControlLabel value="short" control={<Radio />} label="Short (A4/Letter)" />
              <FormControlLabel value="long" control={<Radio />} label="Long (Legal)" />
            </RadioGroup>
          </FormControl>

          {/* Paper Type (Photo only) */}
          {currentServiceType === 'photo' && (
            <FormControl sx={{ mb: 3, display: 'block' }}>
              <FormLabel sx={{ mb: 1, fontWeight: 600 }}>Paper</FormLabel>
              <RadioGroup row value={paperType} onChange={(e) => setPaperType(e.target.value)}>
                <FormControlLabel value="ordinary" control={<Radio />} label="Ordinary" />
                <FormControlLabel
                  value="special"
                  control={<Radio />}
                  label="Special"
                />
              </RadioGroup>
            </FormControl>
          )}

          {/* Color Selection (hidden for special paper photo) */}
          {!(currentServiceType === 'photo' && paperType === 'special') && (
            <FormControl sx={{ mb: 3, display: 'block' }}>
              <FormLabel sx={{ mb: 1, fontWeight: 600 }}>Print Mode</FormLabel>
              <RadioGroup row value={isColor ? 'color' : 'bw'} onChange={(e) => setIsColor(e.target.value === 'color')}>
                <FormControlLabel value="bw" control={<Radio />} label="Black & White" />
                <FormControlLabel value="color" control={<Radio />} label="Color" />
              </RadioGroup>
            </FormControl>
          )}

          {/* Page Count */}
          <TextField
            fullWidth
            type="number"
            label="Number of Pages"
            value={pageCount}
            onChange={(e) => setPageCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            inputProps={{ min: '1', step: '1' }}
            sx={{ mb: 3 }}
          />

          <TextField
            fullWidth
            label="Description (optional)"
            value={printDescription}
            onChange={(e) => setPrintDescription(e.target.value)}
            placeholder="Customer note, file name, or job details"
            sx={{ mb: 3 }}
          />

          {/* Price Calculation */}
          <Box sx={{ mt: 3, p: 2, backgroundColor: '#e3f2fd', borderRadius: 1, border: '1px solid #90caf9' }}>
            <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: '#000000' }}>
              Price per page: ₱{getPricePerPage().toFixed(2)}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1, color: '#000000' }}>
              Pages: {pageCount}
            </Typography>
            <Typography variant="h6" color="primary" sx={{ fontWeight: 600, borderTop: '1px solid #90caf9', pt: 1 }}>
              Total: ₱{getTotalPrice().toFixed(2)}
            </Typography>
          </Box>

          {message.text && (
            <Box sx={{ mt: 2, p: 1, backgroundColor: message.type === 'error' ? '#ffebee' : '#e8f5e9', borderRadius: 1 }}>
              <Typography variant="body2" color={message.type === 'error' ? 'error' : 'success.main'}>
                {message.text}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel} color="inherit">
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            variant="contained"
            color="primary"
            disabled={pageCount < 1 || recordingLoading}
          >
            {recordingLoading ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default PrintServices;
