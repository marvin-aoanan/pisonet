import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Box,
  Button,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Alert,
  MenuItem,
  CircularProgress,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import CustomGridToolbar from './CustomGridToolbar';
import { formatPeso } from '../utils/currency';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

const initialForm = {
  sku: '',
  name: '',
  category: 'Beverages',
  description: '',
  image_url: '',
  size: '',
  quantity_in_stock: 0,
  base_price: 0,
  markup_price: 0,
  final_price: 0,
  is_active: true,
};

function toMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(2));
}

function toCsvCell(value) {
  const text = value == null ? '' : String(value);
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadCsvFile(filename, headers, rows) {
  const headerLine = headers.map((header) => toCsvCell(header)).join(',');
  const rowLines = rows.map((row) => row.map((cell) => toCsvCell(cell)).join(','));
  const csvContent = [headerLine, ...rowLines].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function AdminProducts({ adminPassword }) {
  const [activeTab, setActiveTab] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState(['Beverages', 'Snacks']);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [replenishDialogOpen, setReplenishDialogOpen] = useState(false);
  const [replenishTarget, setReplenishTarget] = useState(null);
  const [replenishQuantity, setReplenishQuantity] = useState(0);
  const [replenishUnitCost, setReplenishUnitCost] = useState('');
  const [replenishNotes, setReplenishNotes] = useState('');
  const [replenishing, setReplenishing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyProductId, setHistoryProductId] = useState('');
  const [historyEventType, setHistoryEventType] = useState('');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [inventoryHistoryRows, setInventoryHistoryRows] = useState([]);
  const [priceHistoryRows, setPriceHistoryRows] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, severity: 'success', message: '' });

  const authHeaders = useMemo(() => ({ headers: { 'x-admin-password': adminPassword } }), [adminPassword]);

  const showToast = (severity, message) => {
    setSnackbar({ open: true, severity, message });
  };

  const fetchProducts = useCallback(async () => {
    if (!adminPassword) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/products?limit=100&sort_by=updated_at&sort_order=desc`, authHeaders);
      setRows(response.data?.data || []);
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [adminPassword, authHeaders]);

  const fetchCategories = useCallback(async () => {
    if (!adminPassword) return;
    try {
      const response = await axios.get(`${API_URL}/products/categories`, authHeaders);
      const list = Array.isArray(response.data?.data) && response.data.data.length > 0
        ? response.data.data
        : ['Beverages', 'Snacks'];
      setCategories(list);
    } catch (err) {
      showToast('warning', 'Failed to load categories. Using defaults.');
      setCategories(['Beverages', 'Snacks']);
    }
  }, [adminPassword, authHeaders]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const fetchHistory = useCallback(async () => {
    if (!adminPassword) return;

    const params = new URLSearchParams();
    params.set('limit', '500');
    if (historyProductId) params.set('product_id', String(historyProductId));
    if (historyStartDate) params.set('start_date', `${historyStartDate}T00:00:00.000`);
    if (historyEndDate) params.set('end_date', `${historyEndDate}T23:59:59.999`);

    setHistoryLoading(true);
    try {
      if (activeTab === 1) {
        if (historyEventType) {
          params.set('event_type', historyEventType);
        }
        const response = await axios.get(`${API_URL}/products/inventory-logs?${params.toString()}`, authHeaders);
        setInventoryHistoryRows(response.data?.data || []);
      } else if (activeTab === 2) {
        const response = await axios.get(`${API_URL}/products/price-logs?${params.toString()}`, authHeaders);
        setPriceHistoryRows(response.data?.data || []);
      }
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to load history logs');
      if (activeTab === 1) setInventoryHistoryRows([]);
      if (activeTab === 2) setPriceHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [adminPassword, activeTab, authHeaders, historyEndDate, historyEventType, historyProductId, historyStartDate]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const openCreate = () => {
    setEditingProduct(null);
    setChangeReason('');
    setFormData({
      ...initialForm,
      category: categories[0] || 'Beverages',
    });
    setFormOpen(true);
  };

  const openEdit = (product) => {
    setEditingProduct(product);
    setChangeReason('');
    setFormData({
      ...initialForm,
      ...product,
      quantity_in_stock: Number(product.quantity_in_stock || 0),
      base_price: Number(product.base_price || 0),
      markup_price: Number(product.markup_price || 0),
      final_price: Number(product.final_price || 0),
    });
    setFormOpen(true);
  };

  const handleFieldChange = (field, value) => {
    const next = { ...formData, [field]: value };
    const basePrice = Number(next.base_price);
    const markupPrice = Number(next.markup_price);
    if (Number.isFinite(basePrice) && Number.isFinite(markupPrice)) {
      next.final_price = toMoney(basePrice + markupPrice);
    }
    setFormData(next);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      sku: String(formData.sku || '').trim().toUpperCase(),
      name: String(formData.name || '').trim(),
      category: String(formData.category || '').trim() || null,
      description: String(formData.description || '').trim() || null,
      image_url: String(formData.image_url || '').trim() || null,
      size: String(formData.size || '').trim() || null,
      quantity_in_stock: Number(formData.quantity_in_stock || 0),
      base_price: toMoney(formData.base_price),
      markup_price: toMoney(formData.markup_price),
      final_price: toMoney(formData.final_price),
      is_active: Boolean(formData.is_active),
      changed_by: 'Admin',
      price_change_reason: changeReason.trim() || null,
      stock_change_reason: changeReason.trim() || null,
    };

    try {
      if (editingProduct?.id) {
        await axios.put(`${API_URL}/products/${editingProduct.id}`, payload, authHeaders);
        showToast('success', 'Product updated');
      } else {
        await axios.post(`${API_URL}/products`, payload, authHeaders);
        showToast('success', 'Product created');
      }
      setFormOpen(false);
      await fetchProducts();
    } catch (err) {
      const message = err.response?.data?.error?.message || err.response?.data?.error || 'Failed to save product';
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  const openReplenish = (product) => {
    setReplenishTarget(product);
    setReplenishQuantity(0);
    setReplenishUnitCost('');
    setReplenishNotes('');
    setReplenishDialogOpen(true);
  };

  const handleReplenish = async () => {
    if (!replenishTarget?.id) {
      return;
    }

    const quantityAdded = Number.parseInt(replenishQuantity, 10);
    if (!Number.isInteger(quantityAdded) || quantityAdded < 1) {
      showToast('error', 'Quantity to replenish must be at least 1');
      return;
    }

    let unitCost = null;
    if (String(replenishUnitCost).trim() !== '') {
      const parsedCost = Number(replenishUnitCost);
      if (!Number.isFinite(parsedCost) || parsedCost < 0) {
        showToast('error', 'Unit cost must be a number >= 0');
        return;
      }
      unitCost = toMoney(parsedCost);
    }

    setReplenishing(true);
    try {
      await axios.post(
        `${API_URL}/products/${replenishTarget.id}/replenish`,
        {
          quantity_added: quantityAdded,
          unit_cost: unitCost,
          notes: replenishNotes.trim() || null,
          created_by: 'Admin',
        },
        authHeaders
      );

      showToast('success', `Replenished ${replenishTarget.name} by ${quantityAdded}`);
      setReplenishDialogOpen(false);
      await fetchProducts();
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to replenish stock');
    } finally {
      setReplenishing(false);
    }
  };

  const handleArchive = async (product) => {
    try {
      await axios.delete(`${API_URL}/products/${product.id}`, authHeaders);
      showToast('success', `Archived ${product.name}`);
      await fetchProducts();
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to archive product');
    }
  };

  const handleReactivate = async (product) => {
    try {
      await axios.put(
        `${API_URL}/products/${product.id}`,
        { is_active: true },
        authHeaders
      );
      showToast('success', `Reactivated ${product.name}`);
      await fetchProducts();
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to reactivate product');
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setUploadingImage(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('image', file);

      const response = await axios.post(`${API_URL}/products/upload-image`, formDataUpload, {
        headers: {
          'x-admin-password': adminPassword,
          'Content-Type': 'multipart/form-data',
        },
      });

      const uploadedPath = response.data?.data?.image_url || '';
      if (uploadedPath) {
        setFormData((prev) => ({ ...prev, image_url: uploadedPath }));
      }
      showToast('success', 'Image uploaded');
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddCategory = async () => {
    const categoryName = String(newCategoryName || '').trim();
    if (!categoryName) {
      showToast('error', 'Category name is required');
      return;
    }

    setSavingCategory(true);
    try {
      const response = await axios.post(`${API_URL}/products/categories`, { name: categoryName }, authHeaders);
      const nextList = Array.isArray(response.data?.data) ? response.data.data : categories;
      setCategories(nextList);
      if (!formData.category) {
        setFormData((prev) => ({ ...prev, category: categoryName }));
      }
      setCategoryDialogOpen(false);
      setNewCategoryName('');
      showToast('success', 'Category added');
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to add category');
    } finally {
      setSavingCategory(false);
    }
  };

  const exportInventoryHistoryCsv = () => {
    if (!inventoryHistoryRows.length) {
      showToast('warning', 'No inventory history rows to export');
      return;
    }

    const now = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const headers = [
      'Date/Time',
      'SKU',
      'Product',
      'Event',
      'Delta',
      'Before',
      'After',
      'Unit Cost',
      'Notes',
      'By',
    ];

    const csvRows = inventoryHistoryRows.map((row) => [
      row.created_at,
      row.sku,
      row.product_name,
      row.event_type,
      Number(row.quantity_delta || 0),
      Number(row.quantity_before || 0),
      Number(row.quantity_after || 0),
      row.unit_cost == null ? '' : Number(row.unit_cost || 0).toFixed(2),
      row.notes || '',
      row.created_by || '',
    ]);

    downloadCsvFile(`inventory-history-${now}.csv`, headers, csvRows);
    showToast('success', 'Inventory history CSV exported');
  };

  const exportPriceHistoryCsv = () => {
    if (!priceHistoryRows.length) {
      showToast('warning', 'No price history rows to export');
      return;
    }

    const now = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const headers = [
      'Date/Time',
      'SKU',
      'Product',
      'Base Before',
      'Base After',
      'Markup Before',
      'Markup After',
      'Final Before',
      'Final After',
      'Reason',
      'By',
    ];

    const csvRows = priceHistoryRows.map((row) => [
      row.created_at,
      row.sku,
      row.product_name,
      Number(row.base_price_before || 0).toFixed(2),
      Number(row.base_price_after || 0).toFixed(2),
      Number(row.markup_price_before || 0).toFixed(2),
      Number(row.markup_price_after || 0).toFixed(2),
      Number(row.final_price_before || 0).toFixed(2),
      Number(row.final_price_after || 0).toFixed(2),
      row.change_reason || '',
      row.created_by || '',
    ]);

    downloadCsvFile(`price-history-${now}.csv`, headers, csvRows);
    showToast('success', 'Price history CSV exported');
  };

  const columns = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'sku', headerName: 'SKU', width: 150 },
    { field: 'name', headerName: 'Name', minWidth: 180, flex: 1 },
    { field: 'category', headerName: 'Category', width: 140 },
    { field: 'size', headerName: 'Size', width: 130 },
    {
      field: 'quantity_in_stock',
      headerName: 'Stock',
      width: 120,
      renderCell: (params) => (
        <Chip
          size="small"
          color={Number(params.value) > 0 ? 'success' : 'error'}
          label={Number(params.value) > 0 ? `${params.value} in stock` : 'Out of stock'}
        />
      ),
    },
    {
      field: 'base_price',
      headerName: 'Base',
      width: 110,
      renderCell: (params) => formatPeso(params.value),
    },
    {
      field: 'markup_price',
      headerName: 'Markup',
      width: 110,
      renderCell: (params) => formatPeso(params.value),
    },
    {
      field: 'final_price',
      headerName: 'Final',
      width: 110,
      renderCell: (params) => formatPeso(params.value),
    },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 110,
      renderCell: (params) => (
        <Chip size="small" color={params.value ? 'success' : 'default'} label={params.value ? 'Active' : 'Archived'} />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 320,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small" onClick={() => openEdit(params.row)}>
            Edit
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="primary"
            onClick={() => openReplenish(params.row)}
          >
            Replenish
          </Button>
          {params.row.is_active ? (
            <Button
              variant="outlined"
              size="small"
              color="warning"
              onClick={() => handleArchive(params.row)}
            >
              Archive
            </Button>
          ) : (
            <Button
              variant="outlined"
              size="small"
              color="success"
              onClick={() => handleReactivate(params.row)}
            >
              Reactivate
            </Button>
          )}
        </Stack>
      ),
    },
  ];

  const inventoryHistoryColumns = [
    { field: 'created_at', headerName: 'Date/Time', width: 190, valueGetter: (value) => new Date(value).toLocaleString() },
    { field: 'sku', headerName: 'SKU', width: 140 },
    { field: 'product_name', headerName: 'Product', minWidth: 180, flex: 1 },
    { field: 'event_type', headerName: 'Event', width: 180 },
    { field: 'quantity_delta', headerName: 'Delta', width: 100 },
    { field: 'quantity_before', headerName: 'Before', width: 100 },
    { field: 'quantity_after', headerName: 'After', width: 100 },
    { field: 'unit_cost', headerName: 'Unit Cost', width: 110, renderCell: (params) => (params.value == null ? '-' : formatPeso(params.value)) },
    { field: 'notes', headerName: 'Notes', minWidth: 220, flex: 1 },
    { field: 'created_by', headerName: 'By', width: 120 },
  ];

  const priceHistoryColumns = [
    { field: 'created_at', headerName: 'Date/Time', width: 190, valueGetter: (value) => new Date(value).toLocaleString() },
    { field: 'sku', headerName: 'SKU', width: 140 },
    { field: 'product_name', headerName: 'Product', minWidth: 180, flex: 1 },
    { field: 'base_price_before', headerName: 'Base Before', width: 120, renderCell: (params) => formatPeso(params.value) },
    { field: 'base_price_after', headerName: 'Base After', width: 120, renderCell: (params) => formatPeso(params.value) },
    { field: 'markup_price_before', headerName: 'Markup Before', width: 130, renderCell: (params) => formatPeso(params.value) },
    { field: 'markup_price_after', headerName: 'Markup After', width: 130, renderCell: (params) => formatPeso(params.value) },
    { field: 'final_price_before', headerName: 'Final Before', width: 120, renderCell: (params) => formatPeso(params.value) },
    { field: 'final_price_after', headerName: 'Final After', width: 120, renderCell: (params) => formatPeso(params.value) },
    { field: 'change_reason', headerName: 'Reason', minWidth: 220, flex: 1 },
    { field: 'created_by', headerName: 'By', width: 120 },
  ];

  return (
    <Box sx={{ width: '100%' }}>
      <Tabs value={activeTab} onChange={(event, next) => setActiveTab(next)} sx={{ mb: 2 }}>
        <Tab label="Product Catalog" />
        <Tab label="Inventory History" />
        <Tab label="Price History" />
      </Tabs>

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">
          {activeTab === 0 ? 'Products' : activeTab === 1 ? 'Inventory History' : 'Price History'}
        </Typography>
        <Stack direction="row" spacing={1}>
          {activeTab === 0 ? (
            <>
              <Button variant="outlined" onClick={() => setCategoryDialogOpen(true)}>Add Category</Button>
              <Button variant="contained" onClick={openCreate}>Add Product</Button>
            </>
          ) : null}
        </Stack>
      </Stack>

      {activeTab === 0 ? (
        <Box sx={{ height: 650, width: '100%' }}>
          <DataGrid
            rows={rows}
            columns={columns}
            loading={loading}
            pageSizeOptions={[10, 25, 50, 100]}
            initialState={{
              pagination: {
                paginationModel: { page: 0, pageSize: 25 },
              },
            }}
            disableRowSelectionOnClick
            slots={{ toolbar: CustomGridToolbar }}
            slotProps={{ toolbar: { showQuickFilter: true } }}
            showToolbar
          />
        </Box>
      ) : (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
            <TextField
              select
              label="Product"
              value={historyProductId}
              onChange={(e) => setHistoryProductId(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">All Products</MenuItem>
              {rows.map((product) => (
                <MenuItem key={product.id} value={product.id}>{product.sku} - {product.name}</MenuItem>
              ))}
            </TextField>

            {activeTab === 1 ? (
              <TextField
                select
                label="Event"
                value={historyEventType}
                onChange={(e) => setHistoryEventType(e.target.value)}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="">All Events</MenuItem>
                <MenuItem value="initial_stock">Initial Stock</MenuItem>
                <MenuItem value="replenish">Replenish</MenuItem>
                <MenuItem value="manual_adjust_increase">Manual Increase</MenuItem>
                <MenuItem value="manual_adjust_decrease">Manual Decrease</MenuItem>
              </TextField>
            ) : null}

            <TextField
              label="Start Date"
              type="date"
              value={historyStartDate}
              onChange={(e) => setHistoryStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End Date"
              type="date"
              value={historyEndDate}
              onChange={(e) => setHistoryEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <Button variant="outlined" onClick={fetchHistory} disabled={historyLoading}>
              {historyLoading ? 'Loading...' : 'Refresh'}
            </Button>
            <Button
              variant="contained"
              onClick={activeTab === 1 ? exportInventoryHistoryCsv : exportPriceHistoryCsv}
              disabled={historyLoading || (activeTab === 1 ? inventoryHistoryRows.length === 0 : priceHistoryRows.length === 0)}
            >
              Export CSV
            </Button>
            <Button
              variant="text"
              onClick={() => {
                setHistoryProductId('');
                setHistoryEventType('');
                setHistoryStartDate('');
                setHistoryEndDate('');
              }}
            >
              Clear Filters
            </Button>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ height: 650, width: '100%' }}>
            <DataGrid
              rows={activeTab === 1 ? inventoryHistoryRows : priceHistoryRows}
              columns={activeTab === 1 ? inventoryHistoryColumns : priceHistoryColumns}
              loading={historyLoading}
              pageSizeOptions={[10, 25, 50, 100]}
              initialState={{
                pagination: {
                  paginationModel: { page: 0, pageSize: 25 },
                },
              }}
              disableRowSelectionOnClick
              slots={{ toolbar: CustomGridToolbar }}
              slotProps={{ toolbar: { showQuickFilter: true } }}
              showToolbar
            />
          </Box>
        </>
      )}

      <Dialog open={formOpen} onClose={() => !saving && setFormOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="SKU" value={formData.sku} onChange={(e) => handleFieldChange('sku', e.target.value)} fullWidth />
              <TextField label="Name" value={formData.name} onChange={(e) => handleFieldChange('name', e.target.value)} fullWidth />
            </Stack>
            <TextField
              select
              label="Category"
              value={formData.category || ''}
              onChange={(e) => handleFieldChange('category', e.target.value)}
              fullWidth
            >
              {categories.map((category) => (
                <MenuItem key={category} value={category}>{category}</MenuItem>
              ))}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Size" value={formData.size} onChange={(e) => handleFieldChange('size', e.target.value)} fullWidth />
              <TextField
                label="Quantity"
                type="number"
                value={formData.quantity_in_stock}
                onChange={(e) => handleFieldChange('quantity_in_stock', Number(e.target.value))}
                fullWidth
              />
            </Stack>
            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <TextField
                label="Image Path"
                value={formData.image_url || ''}
                onChange={(e) => handleFieldChange('image_url', e.target.value)}
                placeholder="/images/product-...jpg"
                fullWidth
                InputProps={{ readOnly: true }}
              />
              <Button
                variant="outlined"
                component="label"
                disabled={uploadingImage}
                sx={{ minWidth: 160 }}
              >
                {uploadingImage ? <CircularProgress size={18} /> : 'Upload Image'}
                <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden onChange={handleImageUpload} />
              </Button>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Base Price"
                type="number"
                value={formData.base_price}
                onChange={(e) => handleFieldChange('base_price', e.target.value)}
                fullWidth
              />
              <TextField
                label="Markup Price"
                type="number"
                value={formData.markup_price}
                onChange={(e) => handleFieldChange('markup_price', e.target.value)}
                fullWidth
              />
              <TextField
                label="Final Price"
                type="number"
                value={formData.final_price}
                onChange={(e) => handleFieldChange('final_price', e.target.value)}
                fullWidth
              />
            </Stack>
            <TextField
              label="Change Reason (for stock/price audit logs)"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Example: Weekly supplier update"
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button disabled={saving} variant="contained" onClick={handleSave}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={replenishDialogOpen} onClose={() => !replenishing && setReplenishDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Replenish Stock{replenishTarget?.name ? ` - ${replenishTarget.name}` : ''}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Quantity Added"
              type="number"
              value={replenishQuantity}
              onChange={(e) => setReplenishQuantity(e.target.value)}
              fullWidth
            />
            <TextField
              label="Unit Cost (optional)"
              type="number"
              value={replenishUnitCost}
              onChange={(e) => setReplenishUnitCost(e.target.value)}
              fullWidth
            />
            <TextField
              label="Notes (optional)"
              value={replenishNotes}
              onChange={(e) => setReplenishNotes(e.target.value)}
              placeholder="Example: Weekly replenishment from Supplier A"
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={replenishing} onClick={() => setReplenishDialogOpen(false)}>Cancel</Button>
          <Button disabled={replenishing} variant="contained" onClick={handleReplenish}>
            {replenishing ? 'Saving...' : 'Save Replenishment'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={categoryDialogOpen} onClose={() => !savingCategory && setCategoryDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Category</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="normal"
            label="Category Name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={savingCategory} onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
          <Button disabled={savingCategory} variant="contained" onClick={handleAddCategory}>
            {savingCategory ? 'Saving...' : 'Save Category'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={2500} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

export default AdminProducts;
