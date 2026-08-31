import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  Alert,
  Box,
  Badge,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Drawer,
  Fab,
  Grid,
  IconButton,
  Snackbar,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  DeleteOutline as DeleteIcon,
  ShoppingCart as ShoppingCartIcon,
} from '@mui/icons-material';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;
const STORE_CART_STORAGE_KEY = 'admin.store.cart';
const STORE_SOLD_BY_STORAGE_KEY = 'admin.store.soldBy';
const STORE_NOTES_STORAGE_KEY = 'admin.store.notes';

function getInitialCart() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORE_CART_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => ({
        product_id: Number(entry?.product_id),
        sku: String(entry?.sku || ''),
        name: String(entry?.name || ''),
        quantity: Math.max(0, Number(entry?.quantity || 0)),
        unit_final_price: Number(entry?.unit_final_price || 0),
        available: Math.max(0, Number(entry?.available || 0)),
      }))
      .filter((entry) => Number.isFinite(entry.product_id) && entry.product_id > 0 && entry.quantity > 0);
  } catch (error) {
    return [];
  }
}

function getInitialTextValue(storageKey, fallback = '') {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (typeof raw === 'string') {
      return raw;
    }
    return fallback;
  } catch (error) {
    return fallback;
  }
}

function resolveImageSrc(imageUrl) {
  const value = String(imageUrl || '').trim();
  if (!value) {
    return '';
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return value;
}

function CategoryTicker({ categoryName, categoryProducts, addToCart, loading, lastAddedProductId, cartPulse }) {
  const constraintsRef = useRef(null);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="h6">{categoryName}</Typography>
        <Typography variant="caption" color="text.secondary">
          {categoryProducts.length} products
        </Typography>
      </Stack>

      <Box
        ref={constraintsRef}
        sx={{
          overflow: 'hidden',
          borderRadius: 1,
          cursor: 'grab',
        }}
      >
        <Box
          component={motion.div}
          drag="x"
          dragConstraints={constraintsRef}
          whileTap={{ cursor: 'grabbing' }}
          sx={{
            display: 'flex',
            gap: 2,
            width: 'max-content',
            pb: 1,
          }}
        >
          {categoryProducts.map((product) => (
            <Card key={product.id} variant="outlined" sx={{ width: 300, flexShrink: 0 }}>
              <Box
                sx={{
                  width: '100%',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: 1,
                }}
              >
                <Box
                  sx={{
                    width: 240,
                    height: 150,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'action.hover',
                    overflow: 'hidden',
                    borderRadius: 1,
                  }}
                >
                  {product.image_url ? (
                    <Box
                      component="img"
                      src={resolveImageSrc(product.image_url)}
                      alt={product.name}
                      onError={(evt) => {
                        evt.currentTarget.style.display = 'none';
                        const sibling = evt.currentTarget.nextElementSibling;
                        if (sibling) {
                          sibling.style.display = 'block';
                        }
                      }}
                      sx={{
                        width: 240,
                        height: 150,
                        objectFit: 'cover',
                      }}
                    />
                  ) : null}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ display: product.image_url ? 'none' : 'block' }}
                  >
                    No Image
                  </Typography>
                </Box>
              </Box>
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" fontWeight={700}>{product.name}</Typography>
                    <Chip
                      size="small"
                      label={Number(product.quantity_in_stock) > 0 ? `${product.quantity_in_stock} left` : 'Out'}
                      color={Number(product.quantity_in_stock) > 0 ? 'success' : 'error'}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">SKU: {product.sku}</Typography>
                  <Typography variant="body2" color="text.secondary">{product.description || 'No description'}</Typography>
                  <Typography variant="h6">P{Number(product.final_price || 0).toFixed(2)}</Typography>
                  <Box
                    component={motion.div}
                    key={`${product.id}-${lastAddedProductId === product.id ? cartPulse : 0}`}
                    animate={
                      lastAddedProductId === product.id
                        ? { scale: [1, 1.08, 1], y: [0, -2, 0] }
                        : { scale: 1, y: 0 }
                    }
                    transition={{ duration: 0.28 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <Button
                      variant="contained"
                      onClick={(event) => addToCart(product, event.currentTarget)}
                      disabled={loading || Number(product.quantity_in_stock) < 1}
                      fullWidth
                    >
                      Add to Basket
                    </Button>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function StoreView({ adminPassword, onSaleRecorded }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState(getInitialCart);
  const [soldBy, setSoldBy] = useState(() => getInitialTextValue(STORE_SOLD_BY_STORAGE_KEY, 'Admin'));
  const [notes, setNotes] = useState(() => getInitialTextValue(STORE_NOTES_STORAGE_KEY, ''));
  const [submitting, setSubmitting] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, severity: 'success', message: '' });
  const [lastAddedProductId, setLastAddedProductId] = useState(null);
  const [cartPulse, setCartPulse] = useState(0);
  const [flyingBadges, setFlyingBadges] = useState([]);
  const [desktopCartTop, setDesktopCartTop] = useState(180);
  const cartPanelRef = useRef(null);
  const desktopDragAreaRef = useRef(null);

  const authHeaders = useMemo(() => ({ headers: { 'x-admin-password': adminPassword } }), [adminPassword]);

  const showToast = (severity, message) => {
    setSnackbar({ open: true, severity, message });
  };

  const fetchProducts = useCallback(async () => {
    if (!adminPassword) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/products?is_active=true&limit=100&sort_by=name&sort_order=asc`, authHeaders);
      setProducts(response.data?.data || []);
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [adminPassword, authHeaders]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const initialTop = 180;
    const stickyTop = 20;

    const updateTop = () => {
      const nextTop = Math.max(stickyTop, initialTop - window.scrollY);
      setDesktopCartTop(nextTop);
    };

    updateTop();
    window.addEventListener('scroll', updateTop, { passive: true });
    return () => window.removeEventListener('scroll', updateTop);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(STORE_CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (error) {
      // Ignore storage write failures to keep checkout flow non-blocking.
    }
  }, [cart]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(STORE_SOLD_BY_STORAGE_KEY, soldBy);
    } catch (error) {
      // Ignore storage write failures to keep checkout flow non-blocking.
    }
  }, [soldBy]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(STORE_NOTES_STORAGE_KEY, notes);
    } catch (error) {
      // Ignore storage write failures to keep checkout flow non-blocking.
    }
  }, [notes]);

  useEffect(() => {
    if (!products.length) {
      return;
    }

    setCart((prev) => {
      let changed = false;
      const productMap = new Map(products.map((product) => [Number(product.id), product]));

      const next = prev
        .map((entry) => {
          const product = productMap.get(Number(entry.product_id));
          if (!product) {
            changed = true;
            return null;
          }

          const available = Math.max(0, Number(product.quantity_in_stock || 0));
          const quantity = Math.min(Math.max(0, Number(entry.quantity || 0)), available);
          const unitFinalPrice = Number(product.final_price || 0);
          const sku = String(product.sku || entry.sku || '');
          const name = String(product.name || entry.name || '');

          if (
            quantity !== entry.quantity ||
            available !== entry.available ||
            unitFinalPrice !== entry.unit_final_price ||
            sku !== entry.sku ||
            name !== entry.name
          ) {
            changed = true;
          }

          if (quantity <= 0) {
            changed = true;
            return null;
          }

          return {
            ...entry,
            quantity,
            available,
            unit_final_price: unitFinalPrice,
            sku,
            name,
          };
        })
        .filter(Boolean);

      return changed ? next : prev;
    });
  }, [products]);

  const addToCart = (product, sourceElement) => {
    const found = cart.find((entry) => entry.product_id === product.id);
    if (found && found.quantity + 1 > found.available) {
      showToast('warning', `Only ${found.available} available for ${found.name}`);
      return;
    }

    if (sourceElement && cartPanelRef.current) {
      const sourceRect = sourceElement.getBoundingClientRect();
      const cartRect = cartPanelRef.current.getBoundingClientRect();
      const id = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

      setFlyingBadges((prev) => [
        ...prev,
        {
          id,
          startX: sourceRect.left + sourceRect.width / 2,
          startY: sourceRect.top + sourceRect.height / 2,
          endX: cartRect.left + Math.min(160, cartRect.width / 2),
          endY: cartRect.top + 36,
        },
      ]);

      setTimeout(() => {
        setFlyingBadges((prev) => prev.filter((entry) => entry.id !== id));
      }, 600);
    }

    setLastAddedProductId(product.id);
    setCartPulse((prev) => prev + 1);

    setCart((prev) => {
      const existing = prev.find((entry) => entry.product_id === product.id);
      if (!existing) {
        return [...prev, {
          product_id: product.id,
          sku: product.sku,
          name: product.name,
          quantity: 1,
          unit_final_price: Number(product.final_price || 0),
          available: Number(product.quantity_in_stock || 0),
        }];
      }

      return prev.map((entry) => entry.product_id === product.id ? { ...entry, quantity: entry.quantity + 1 } : entry);
    });
  };

  const changeCartQuantity = (productId, direction) => {
    setCart((prev) => prev
      .map((entry) => {
        if (entry.product_id !== productId) return entry;
        const nextQty = direction === 'up' ? entry.quantity + 1 : entry.quantity - 1;
        if (nextQty > entry.available) {
          showToast('warning', `Only ${entry.available} available for ${entry.name}`);
          return entry;
        }
        return { ...entry, quantity: Math.max(0, nextQty) };
      })
      .filter((entry) => entry.quantity > 0));
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((entry) => entry.product_id !== productId));
  };

  const subtotal = cart.reduce((sum, entry) => sum + (entry.quantity * entry.unit_final_price), 0);
  const cartItemCount = cart.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);

  const groupedProducts = products.reduce((acc, product) => {
    const category = String(product.category || 'Uncategorized').trim() || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(product);
    return acc;
  }, {});

  const categoryEntries = Object.entries(groupedProducts).sort((a, b) => {
    const aName = String(a[0] || '').trim();
    const bName = String(b[0] || '').trim();
    const aIsOthers = aName.toLowerCase() === 'others';
    const bIsOthers = bName.toLowerCase() === 'others';

    if (aIsOthers && !bIsOthers) return 1;
    if (!aIsOthers && bIsOthers) return -1;
    return aName.localeCompare(bName);
  });

  const handleCheckout = async () => {
    if (!soldBy.trim()) {
      showToast('error', 'Sold by is required');
      return;
    }

    if (cart.length < 1) {
      showToast('error', 'Cart is empty');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        payment_method: 'cash',
        sold_by: soldBy.trim(),
        notes: notes.trim() || null,
        items: cart.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          client_unit_price: item.unit_final_price,
        })),
      };

      const response = await axios.post(`${API_URL}/pos-sales`, payload, authHeaders);
      const refNo = response.data?.data?.sale?.reference_no;
      showToast('success', `Sale recorded (${refNo || 'no ref'})`);
      setCart([]);
      setNotes('');
      await fetchProducts();
      if (typeof onSaleRecorded === 'function') {
        onSaleRecorded(response.data?.data || null);
      }
    } catch (err) {
      const message = err.response?.data?.error?.message || 'Checkout failed';
      showToast('error', message);
      await fetchProducts();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Store POS</Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={isMobile ? 12 : 8}>
          <Stack spacing={3}>
            {categoryEntries.map(([categoryName, categoryProducts]) => (
              <CategoryTicker
                key={categoryName}
                categoryName={categoryName}
                categoryProducts={categoryProducts}
                addToCart={addToCart}
                loading={loading}
                lastAddedProductId={lastAddedProductId}
                cartPulse={cartPulse}
              />
            ))}
          </Stack>
        </Grid>

        {!isMobile ? (
          <Grid
            item
            xs={12}
            md={4}
            sx={{
              position: { xs: 'static', md: 'fixed' },
              top: { md: desktopCartTop },
              right: { md: 24 },
              width: { md: 360 },
              zIndex: { md: 5 },
              maxHeight: { md: `calc(100vh - ${desktopCartTop + 40}px)` }
            }}
          >
            <Box
              ref={desktopDragAreaRef}
              sx={{
                position: 'fixed',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 4,
              }}
            />
            <Card
              ref={cartPanelRef}
              component={motion.div}
              drag
              dragMomentum={false}
              dragElastic={0.08}
              dragConstraints={desktopDragAreaRef}
              whileDrag={{ scale: 1.01, cursor: 'grabbing' }}
              animate={{ scale: cartPulse > 0 ? [1, 1.01, 1] : 1 }}
              transition={{ duration: 0.18 }}
              variant="outlined"
              sx={{ cursor: 'grab' }}
            >
              <CardContent>
                <Typography variant="h6">Current Cart</Typography>
                <Divider sx={{ my: 1.5 }} />

                {cart.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No items selected.</Typography>
                ) : (
                  <Stack spacing={1.5} sx={{ mb: 2 }}>
                    {cart.map((entry) => (
                      <Box key={entry.product_id}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" fontWeight={700}>{entry.name}</Typography>
                          <IconButton size="small" color="error" onClick={() => removeFromCart(entry.product_id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <IconButton size="small" onClick={() => changeCartQuantity(entry.product_id, 'down')}>
                              <RemoveIcon fontSize="small" />
                            </IconButton>
                            <Chip size="small" label={entry.quantity} />
                            <IconButton size="small" onClick={() => changeCartQuantity(entry.product_id, 'up')}>
                              <AddIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                          <Typography variant="body2">P{(entry.unit_final_price * entry.quantity).toFixed(2)}</Typography>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                )}

                <Typography variant="subtitle1" sx={{ mb: 2 }}>Subtotal: P{subtotal.toFixed(2)}</Typography>

                <Stack spacing={1.5}>
                  <TextField label="Sold By" value={soldBy} onChange={(e) => setSoldBy(e.target.value)} fullWidth />
                  <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} fullWidth />
                  <Button variant="contained" onClick={handleCheckout} disabled={submitting || cart.length === 0}>
                    {submitting ? 'Processing...' : 'Checkout'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ) : null}

        <Box sx={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1400 }}>
          {flyingBadges.map((badge) => (
            <Box
              key={badge.id}
              component={motion.div}
              initial={{ x: badge.startX, y: badge.startY, scale: 0.8, opacity: 0.95 }}
              animate={{ x: badge.endX, y: badge.endY, scale: 0.45, opacity: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              sx={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 34,
                height: 34,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                boxShadow: 3,
              }}
            >
              +1
            </Box>
          ))}
        </Box>
      </Grid>

      {isMobile ? (
        <>
          <Fab
            color="primary"
            onClick={() => setMobileCartOpen(true)}
            sx={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1300 }}
          >
            <Badge badgeContent={cartItemCount} color="error" max={99}>
              <ShoppingCartIcon />
            </Badge>
          </Fab>

          <Drawer
            anchor="bottom"
            open={mobileCartOpen}
            onClose={() => setMobileCartOpen(false)}
            PaperProps={{
              sx: {
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                maxHeight: '85vh',
              },
            }}
          >
            <Box sx={{ p: 2 }}>
              <Card
                ref={cartPanelRef}
                component={motion.div}
                animate={{ scale: cartPulse > 0 ? [1, 1.01, 1] : 1 }}
                transition={{ duration: 0.18 }}
                variant="outlined"
              >
                <CardContent>
                  <Typography variant="h6">Current Cart</Typography>
                  <Divider sx={{ my: 1.5 }} />

                  {cart.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No items selected.</Typography>
                  ) : (
                    <Stack spacing={1.5} sx={{ mb: 2 }}>
                      {cart.map((entry) => (
                        <Box key={entry.product_id}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" fontWeight={700}>{entry.name}</Typography>
                            <IconButton size="small" color="error" onClick={() => removeFromCart(entry.product_id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <IconButton size="small" onClick={() => changeCartQuantity(entry.product_id, 'down')}>
                                <RemoveIcon fontSize="small" />
                              </IconButton>
                              <Chip size="small" label={entry.quantity} />
                              <IconButton size="small" onClick={() => changeCartQuantity(entry.product_id, 'up')}>
                                <AddIcon fontSize="small" />
                              </IconButton>
                            </Stack>
                            <Typography variant="body2">P{(entry.unit_final_price * entry.quantity).toFixed(2)}</Typography>
                          </Stack>
                        </Box>
                      ))}
                    </Stack>
                  )}

                  <Typography variant="subtitle1" sx={{ mb: 2 }}>Subtotal: P{subtotal.toFixed(2)}</Typography>

                  <Stack spacing={1.5}>
                    <TextField label="Sold By" value={soldBy} onChange={(e) => setSoldBy(e.target.value)} fullWidth />
                    <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} fullWidth />
                    <Button variant="contained" onClick={handleCheckout} disabled={submitting || cart.length === 0}>
                      {submitting ? 'Processing...' : 'Checkout'}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Box>
          </Drawer>
        </>
      ) : null}

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

export default StoreView;
