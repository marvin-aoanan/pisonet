const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const db = require('../database');
const { requireAdminAuth } = require('../admin-auth');

const ALLOWED_SORT_BY = new Set(['created_at', 'updated_at', 'name', 'quantity_in_stock', 'final_price']);
const ALLOWED_SORT_ORDER = new Set(['asc', 'desc']);
const WRITE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const WRITE_RATE_LIMIT_MAX_REQUESTS = 60;
const MAX_UPLOAD_BYTES = 200 * 1024;
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const writeBuckets = new Map();
const imagesDir = path.join(__dirname, '..', '..', 'frontend', 'public', 'images');

fs.mkdirSync(imagesDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, imagesDir),
    filename: (req, file, cb) => {
      const extByMime = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
      };
      const safeExt = extByMime[file.mimetype] || '.jpg';
      cb(null, `product-${Date.now()}-${Math.floor(Math.random() * 1e6)}${safeExt}`);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
  },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED_IMAGE_MIME.has(mime)) {
      cb(new Error('Only JPG, PNG, and WEBP images are allowed'));
      return;
    }
    cb(null, true);
  },
});

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const fromForwarded = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0].trim();
  return (fromForwarded || req.ip || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

function writeRateLimit(req, res, next) {
  const now = Date.now();
  const ip = getClientIp(req);
  const bucket = writeBuckets.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    writeBuckets.set(ip, { count: 1, resetAt: now + WRITE_RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (bucket.count >= WRITE_RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      status: 'error',
      error: {
        code: 'rate_limited',
        message: 'Too many write requests. Please retry later.',
      },
    });
  }

  bucket.count += 1;
  return next();
}

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidSku(sku) {
  return /^[A-Z0-9-]{1,64}$/.test(sku);
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidImagePath(url) {
  return /^\/images\/[a-zA-Z0-9._-]+$/.test(String(url || ''));
}

function toProductPayload(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    description: row.description,
    image_url: row.image_url,
    size: row.size,
    quantity_in_stock: Number(row.quantity_in_stock || 0),
    base_price: Number(row.base_price || 0),
    markup_price: Number(row.markup_price || 0),
    final_price: Number(row.final_price || 0),
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toInventoryLogPayload(row) {
  return {
    id: row.id,
    product_id: row.product_id,
    event_type: row.event_type,
    quantity_delta: Number(row.quantity_delta || 0),
    quantity_before: Number(row.quantity_before || 0),
    quantity_after: Number(row.quantity_after || 0),
    unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
    notes: row.notes || null,
    created_by: row.created_by || null,
    created_at: row.created_at,
  };
}

function toPriceLogPayload(row) {
  return {
    id: row.id,
    product_id: row.product_id,
    base_price_before: Number(row.base_price_before || 0),
    base_price_after: Number(row.base_price_after || 0),
    markup_price_before: Number(row.markup_price_before || 0),
    markup_price_after: Number(row.markup_price_after || 0),
    final_price_before: Number(row.final_price_before || 0),
    final_price_after: Number(row.final_price_after || 0),
    change_reason: row.change_reason || null,
    created_by: row.created_by || null,
    created_at: row.created_at,
  };
}

function createInventoryLog({
  productId,
  eventType,
  quantityDelta,
  quantityBefore,
  quantityAfter,
  unitCost = null,
  notes = null,
  createdBy = null,
}) {
  db.run(
    `INSERT INTO product_inventory_logs (
      product_id, event_type, quantity_delta, quantity_before, quantity_after, unit_cost, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      productId,
      eventType,
      quantityDelta,
      quantityBefore,
      quantityAfter,
      unitCost == null ? null : roundMoney(unitCost),
      notes || null,
      createdBy || null,
      new Date().toISOString(),
    ]
  );
}

function createPriceLog({
  productId,
  basePriceBefore,
  basePriceAfter,
  markupPriceBefore,
  markupPriceAfter,
  finalPriceBefore,
  finalPriceAfter,
  changeReason = null,
  createdBy = null,
}) {
  db.run(
    `INSERT INTO product_price_logs (
      product_id, base_price_before, base_price_after, markup_price_before, markup_price_after,
      final_price_before, final_price_after, change_reason, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      productId,
      roundMoney(basePriceBefore),
      roundMoney(basePriceAfter),
      roundMoney(markupPriceBefore),
      roundMoney(markupPriceAfter),
      roundMoney(finalPriceBefore),
      roundMoney(finalPriceAfter),
      changeReason || null,
      createdBy || null,
      new Date().toISOString(),
    ]
  );
}

function getCategoriesFromSettings() {
  const row = db.get('SELECT value FROM settings WHERE key = ?', ['product_categories']);
  if (!row?.value) {
    return ['Beverages', 'Snacks'];
  }

  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) {
      return ['Beverages', 'Snacks'];
    }

    const cleaned = parsed
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);

    return cleaned.length > 0 ? cleaned : ['Beverages', 'Snacks'];
  } catch {
    return ['Beverages', 'Snacks'];
  }
}

function saveCategoriesToSettings(categories) {
  const serialized = JSON.stringify(categories);
  const now = new Date().toISOString();
  const updateInfo = db.run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [serialized, now, 'product_categories']);
  if (Number(updateInfo?.changes || 0) === 0) {
    db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['product_categories', serialized]);
  }
}

function sendValidationError(res, fieldErrors) {
  return res.status(400).json({
    status: 'error',
    error: {
      code: 'validation_failed',
      message: 'Request validation failed',
    },
    field_errors: fieldErrors,
  });
}

function validateProductInput(body, isUpdate = false) {
  const fieldErrors = {};

  const skuRaw = body.sku;
  const nameRaw = body.name;
  const descriptionRaw = body.description;
  const categoryRaw = body.category;
  const imageUrlRaw = body.image_url;
  const sizeRaw = body.size;
  const quantityRaw = body.quantity_in_stock;
  const baseRaw = body.base_price;
  const markupRaw = body.markup_price;
  const finalRaw = body.final_price;

  const sku = skuRaw == null ? undefined : String(skuRaw).trim().toUpperCase();
  const name = nameRaw == null ? undefined : String(nameRaw).trim();
  const description = descriptionRaw == null ? null : String(descriptionRaw).trim();
  const category = categoryRaw == null ? null : String(categoryRaw).trim();
  const imageUrl = imageUrlRaw == null ? null : String(imageUrlRaw).trim();
  const size = sizeRaw == null ? null : String(sizeRaw).trim();

  const quantity = quantityRaw == null ? undefined : Number(quantityRaw);
  const basePrice = baseRaw == null ? undefined : Number(baseRaw);
  const markupPrice = markupRaw == null ? undefined : Number(markupRaw);
  const finalPrice = finalRaw == null ? undefined : Number(finalRaw);

  if (!isUpdate || sku !== undefined) {
    if (!sku) {
      fieldErrors.sku = ['sku is required'];
    } else if (!isValidSku(sku)) {
      fieldErrors.sku = ['sku must be uppercase letters, numbers, and dashes only (1-64 chars)'];
    }
  }

  if (!isUpdate || name !== undefined) {
    if (!name) {
      fieldErrors.name = ['name is required'];
    } else if (name.length > 120) {
      fieldErrors.name = ['name must be 1-120 characters'];
    }
  }

  if (category != null && category.length > 60) {
    fieldErrors.category = ['category max length is 60'];
  }

  if (description != null && description.length > 1000) {
    fieldErrors.description = ['description max length is 1000'];
  }

  if (imageUrl != null && imageUrl.length > 0) {
    if (imageUrl.length > 500) {
      fieldErrors.image_url = ['image_url max length is 500'];
    } else if (!isValidUrl(imageUrl) && !isValidImagePath(imageUrl)) {
      fieldErrors.image_url = ['image_url must be an uploaded /images path or valid http/https URL'];
    }
  }

  if (size != null && size.length > 60) {
    fieldErrors.size = ['size max length is 60'];
  }

  if (!isUpdate || quantity !== undefined) {
    if (!Number.isInteger(quantity) || quantity < 0) {
      fieldErrors.quantity_in_stock = ['quantity_in_stock must be an integer >= 0'];
    }
  }

  if (!isUpdate || basePrice !== undefined) {
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      fieldErrors.base_price = ['base_price must be a number >= 0'];
    }
  }

  if (!isUpdate || markupPrice !== undefined) {
    if (!Number.isFinite(markupPrice) || markupPrice < 0) {
      fieldErrors.markup_price = ['markup_price must be a number >= 0'];
    }
  }

  if (!isUpdate || finalPrice !== undefined) {
    if (!Number.isFinite(finalPrice) || finalPrice < 0) {
      fieldErrors.final_price = ['final_price must be a number >= 0'];
    }
  }

  if (
    Number.isFinite(basePrice) &&
    Number.isFinite(markupPrice) &&
    Number.isFinite(finalPrice)
  ) {
    const expected = roundMoney(basePrice + markupPrice);
    if (Math.abs(roundMoney(finalPrice) - expected) > 0.01) {
      fieldErrors.final_price = ['final_price must equal base_price + markup_price'];
    }
  }

  return {
    fieldErrors,
    normalized: {
      sku,
      name,
      category: category || null,
      description: description || null,
      image_url: imageUrl || null,
      size: size || null,
      quantity_in_stock: quantity,
      base_price: Number.isFinite(basePrice) ? roundMoney(basePrice) : undefined,
      markup_price: Number.isFinite(markupPrice) ? roundMoney(markupPrice) : undefined,
      final_price: Number.isFinite(finalPrice) ? roundMoney(finalPrice) : undefined,
      is_active: body.is_active == null ? undefined : (body.is_active ? 1 : 0),
    },
  };
}

function parseDateToIso(value, fieldName, fieldErrors) {
  if (value == null || String(value).trim() === '') {
    return null;
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    fieldErrors[fieldName] = [`${fieldName} must be a valid ISO datetime`];
    return null;
  }

  return parsed.toISOString();
}

router.use(requireAdminAuth);
router.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    return writeRateLimit(req, res, next);
  }
  return next();
});

router.post('/upload-image', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'validation_failed',
          message: tooLarge
            ? `Image must not exceed ${MAX_UPLOAD_BYTES} bytes (200KB)`
            : (err.message || 'Image upload failed'),
        },
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'validation_failed',
          message: 'Image file is required',
        },
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Image uploaded',
      data: {
        image_url: `/images/${req.file.filename}`,
        file_name: req.file.filename,
      },
    });
  });
});

router.get('/categories', (req, res) => {
  try {
    const categories = getCategoriesFromSettings();
    return res.json({
      status: 'success',
      data: categories,
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'internal_error',
        message: err.message,
      },
    });
  }
});

router.post('/categories', (req, res) => {
  const rawName = String(req.body?.name || '').trim();
  if (!rawName) {
    return sendValidationError(res, { name: ['name is required'] });
  }

  if (rawName.length > 60) {
    return sendValidationError(res, { name: ['name max length is 60'] });
  }

  try {
    const existing = getCategoriesFromSettings();
    const lowerSet = new Set(existing.map((entry) => entry.toLowerCase()));
    if (lowerSet.has(rawName.toLowerCase())) {
      return res.status(409).json({
        status: 'error',
        error: {
          code: 'duplicate_category',
          message: 'Category already exists',
        },
      });
    }

    const updated = [...existing, rawName];
    saveCategoriesToSettings(updated);

    return res.status(201).json({
      status: 'success',
      message: 'Category added',
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'internal_error',
        message: err.message,
      },
    });
  }
});

router.get('/', (req, res) => {
  const page = Number.parseInt(req.query.page, 10) || 1;
  const limit = Number.parseInt(req.query.limit, 10) || 20;
  const search = toTrimmedString(req.query.search || '');
  const isActiveQuery = req.query.is_active;
  const sortBy = toTrimmedString(req.query.sort_by || 'updated_at');
  const sortOrder = toTrimmedString(req.query.sort_order || 'desc').toLowerCase();

  const fieldErrors = {};
  if (!Number.isInteger(page) || page < 1) fieldErrors.page = ['page must be an integer >= 1'];
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fieldErrors.limit = ['limit must be an integer between 1 and 100'];
  if (!ALLOWED_SORT_BY.has(sortBy)) fieldErrors.sort_by = ['invalid sort_by'];
  if (!ALLOWED_SORT_ORDER.has(sortOrder)) fieldErrors.sort_order = ['invalid sort_order'];

  let isActiveFilter;
  if (isActiveQuery != null) {
    if (String(isActiveQuery) === 'true') {
      isActiveFilter = 1;
    } else if (String(isActiveQuery) === 'false') {
      isActiveFilter = 0;
    } else {
      fieldErrors.is_active = ['is_active must be true or false'];
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return sendValidationError(res, fieldErrors);
  }

  const where = [];
  const params = [];

  if (search) {
    where.push('(UPPER(sku) LIKE ? OR UPPER(name) LIKE ?)');
    const pattern = `%${search.toUpperCase()}%`;
    params.push(pattern, pattern);
  }

  if (isActiveFilter != null) {
    where.push('is_active = ?');
    params.push(isActiveFilter);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  try {
    const totalRow = db.get(`SELECT COUNT(*) as total FROM products ${whereSql}`, params);
    const rows = db.all(
      `SELECT * FROM products ${whereSql} ORDER BY ${sortBy} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const total = Number(totalRow?.total || 0);

    return res.json({
      status: 'success',
      data: (rows || []).map(toProductPayload).filter(Boolean),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'internal_error',
        message: err.message,
      },
    });
  }
});

router.post('/', (req, res) => {
  const { fieldErrors, normalized } = validateProductInput(req.body || {}, false);
  if (Object.keys(fieldErrors).length > 0) {
    return sendValidationError(res, fieldErrors);
  }

  const now = new Date().toISOString();
  const isActive = normalized.is_active == null ? 1 : normalized.is_active;
  const createdBy = toTrimmedString(req.body?.changed_by || req.body?.updated_by || 'Admin').slice(0, 80) || 'Admin';

  try {
    const existing = db.get('SELECT id FROM products WHERE sku = ?', [normalized.sku]);
    if (existing) {
      return res.status(409).json({
        status: 'error',
        error: {
          code: 'duplicate_sku',
          message: 'SKU already exists',
        },
      });
    }

    db.run(
      `INSERT INTO products (
        sku, name, category, description, image_url, size, quantity_in_stock,
        base_price, markup_price, final_price, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.sku,
        normalized.name,
        normalized.category,
        normalized.description,
        normalized.image_url,
        normalized.size,
        normalized.quantity_in_stock,
        normalized.base_price,
        normalized.markup_price,
        normalized.final_price,
        isActive,
        now,
        now,
      ]
    );

    const created = db.get('SELECT * FROM products WHERE sku = ?', [normalized.sku]);
    if (!created) {
      return res.status(500).json({
        status: 'error',
        error: {
          code: 'internal_error',
          message: 'Product was inserted but could not be loaded',
        },
      });
    }

    createInventoryLog({
      productId: created.id,
      eventType: 'initial_stock',
      quantityDelta: Number(created.quantity_in_stock || 0),
      quantityBefore: 0,
      quantityAfter: Number(created.quantity_in_stock || 0),
      notes: 'Initial stock on product creation',
      createdBy,
    });

    createPriceLog({
      productId: created.id,
      basePriceBefore: 0,
      basePriceAfter: Number(created.base_price || 0),
      markupPriceBefore: 0,
      markupPriceAfter: Number(created.markup_price || 0),
      finalPriceBefore: 0,
      finalPriceAfter: Number(created.final_price || 0),
      changeReason: 'Initial pricing on product creation',
      createdBy,
    });

    return res.status(201).json({
      status: 'success',
      message: 'Product created',
      data: toProductPayload(created),
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'internal_error',
        message: err.message,
      },
    });
  }
});

router.get('/inventory-logs', (req, res) => {
  const fieldErrors = {};
  const limit = Number.parseInt(req.query.limit, 10) || 200;
  const productId = req.query.product_id == null || String(req.query.product_id).trim() === ''
    ? null
    : parsePositiveInt(req.query.product_id);
  const eventType = toTrimmedString(req.query.event_type || '');
  const startDate = parseDateToIso(req.query.start_date, 'start_date', fieldErrors);
  const endDate = parseDateToIso(req.query.end_date, 'end_date', fieldErrors);

  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    fieldErrors.limit = ['limit must be an integer between 1 and 1000'];
  }

  if (req.query.product_id != null && String(req.query.product_id).trim() !== '' && !productId) {
    fieldErrors.product_id = ['product_id must be a positive integer'];
  }

  if (startDate && endDate && startDate > endDate) {
    fieldErrors.date_range = ['start_date must be <= end_date'];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return sendValidationError(res, fieldErrors);
  }

  const where = [];
  const params = [];

  if (productId) {
    where.push('log.product_id = ?');
    params.push(productId);
  }

  if (eventType) {
    where.push('log.event_type = ?');
    params.push(eventType);
  }

  if (startDate) {
    where.push('log.created_at >= ?');
    params.push(startDate);
  }

  if (endDate) {
    where.push('log.created_at <= ?');
    params.push(endDate);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const rows = db.all(
      `SELECT
         log.id,
         log.product_id,
         p.sku,
         p.name,
         log.event_type,
         log.quantity_delta,
         log.quantity_before,
         log.quantity_after,
         log.unit_cost,
         log.notes,
         log.created_by,
         log.created_at
       FROM product_inventory_logs log
       JOIN products p ON p.id = log.product_id
       ${whereSql}
       ORDER BY log.created_at DESC
       LIMIT ?`,
      [...params, limit]
    );

    return res.json({
      status: 'success',
      data: (rows || []).map((row) => ({
        ...toInventoryLogPayload(row),
        sku: row.sku,
        product_name: row.name,
      })),
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'internal_error',
        message: err.message,
      },
    });
  }
});

router.get('/price-logs', (req, res) => {
  const fieldErrors = {};
  const limit = Number.parseInt(req.query.limit, 10) || 200;
  const productId = req.query.product_id == null || String(req.query.product_id).trim() === ''
    ? null
    : parsePositiveInt(req.query.product_id);
  const startDate = parseDateToIso(req.query.start_date, 'start_date', fieldErrors);
  const endDate = parseDateToIso(req.query.end_date, 'end_date', fieldErrors);

  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    fieldErrors.limit = ['limit must be an integer between 1 and 1000'];
  }

  if (req.query.product_id != null && String(req.query.product_id).trim() !== '' && !productId) {
    fieldErrors.product_id = ['product_id must be a positive integer'];
  }

  if (startDate && endDate && startDate > endDate) {
    fieldErrors.date_range = ['start_date must be <= end_date'];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return sendValidationError(res, fieldErrors);
  }

  const where = [];
  const params = [];

  if (productId) {
    where.push('log.product_id = ?');
    params.push(productId);
  }

  if (startDate) {
    where.push('log.created_at >= ?');
    params.push(startDate);
  }

  if (endDate) {
    where.push('log.created_at <= ?');
    params.push(endDate);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const rows = db.all(
      `SELECT
         log.id,
         log.product_id,
         p.sku,
         p.name,
         log.base_price_before,
         log.base_price_after,
         log.markup_price_before,
         log.markup_price_after,
         log.final_price_before,
         log.final_price_after,
         log.change_reason,
         log.created_by,
         log.created_at
       FROM product_price_logs log
       JOIN products p ON p.id = log.product_id
       ${whereSql}
       ORDER BY log.created_at DESC
       LIMIT ?`,
      [...params, limit]
    );

    return res.json({
      status: 'success',
      data: (rows || []).map((row) => ({
        ...toPriceLogPayload(row),
        sku: row.sku,
        product_name: row.name,
      })),
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'internal_error',
        message: err.message,
      },
    });
  }
});

router.get('/:id', (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      status: 'error',
      error: {
        code: 'invalid_id',
        message: 'Invalid product id',
      },
    });
  }

  try {
    const row = db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!row) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'product_not_found',
          message: 'Product not found',
        },
      });
    }

    return res.json({ status: 'success', data: toProductPayload(row) });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'internal_error',
        message: err.message,
      },
    });
  }
});

router.put('/:id', (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      status: 'error',
      error: {
        code: 'invalid_id',
        message: 'Invalid product id',
      },
    });
  }

  try {
    const current = db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'product_not_found',
          message: 'Product not found',
        },
      });
    }

    const { fieldErrors, normalized } = validateProductInput(req.body || {}, true);
    if (Object.keys(fieldErrors).length > 0) {
      return sendValidationError(res, fieldErrors);
    }

    const next = {
      sku: normalized.sku ?? current.sku,
      name: normalized.name ?? current.name,
      category: normalized.category ?? current.category,
      description: normalized.description ?? current.description,
      image_url: normalized.image_url ?? current.image_url,
      size: normalized.size ?? current.size,
      quantity_in_stock: normalized.quantity_in_stock ?? Number(current.quantity_in_stock),
      base_price: normalized.base_price ?? Number(current.base_price),
      markup_price: normalized.markup_price ?? Number(current.markup_price),
      final_price: normalized.final_price,
      is_active: normalized.is_active == null ? Number(current.is_active) : normalized.is_active,
    };
    const changedBy = toTrimmedString(req.body?.changed_by || req.body?.updated_by || 'Admin').slice(0, 80) || 'Admin';
    const stockChangeReason = toTrimmedString(req.body?.stock_change_reason || req.body?.change_reason || '').slice(0, 255) || null;
    const priceChangeReason = toTrimmedString(req.body?.price_change_reason || req.body?.change_reason || '').slice(0, 255) || null;

    if (next.final_price == null) {
      next.final_price = roundMoney(next.base_price + next.markup_price);
    }

    const expected = roundMoney(next.base_price + next.markup_price);
    if (Math.abs(roundMoney(next.final_price) - expected) > 0.01) {
      return sendValidationError(res, {
        final_price: ['final_price must equal base_price + markup_price'],
      });
    }

    const duplicate = db.get('SELECT id FROM products WHERE sku = ? AND id != ?', [next.sku, id]);
    if (duplicate) {
      return res.status(409).json({
        status: 'error',
        error: {
          code: 'duplicate_sku',
          message: 'SKU already exists',
        },
      });
    }

    db.run(
      `UPDATE products
       SET sku = ?, name = ?, category = ?, description = ?, image_url = ?, size = ?,
           quantity_in_stock = ?, base_price = ?, markup_price = ?, final_price = ?,
           is_active = ?, updated_at = ?
       WHERE id = ?`,
      [
        next.sku,
        next.name,
        next.category,
        next.description,
        next.image_url,
        next.size,
        next.quantity_in_stock,
        roundMoney(next.base_price),
        roundMoney(next.markup_price),
        roundMoney(next.final_price),
        next.is_active,
        new Date().toISOString(),
        id,
      ]
    );

    const updated = db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!updated) {
      return res.status(500).json({
        status: 'error',
        error: {
          code: 'internal_error',
          message: 'Product was updated but could not be loaded',
        },
      });
    }

    const prevQty = Number(current.quantity_in_stock || 0);
    const nextQty = Number(updated.quantity_in_stock || 0);
    const qtyDelta = nextQty - prevQty;
    if (qtyDelta !== 0) {
      createInventoryLog({
        productId: id,
        eventType: qtyDelta > 0 ? 'manual_adjust_increase' : 'manual_adjust_decrease',
        quantityDelta: qtyDelta,
        quantityBefore: prevQty,
        quantityAfter: nextQty,
        notes: stockChangeReason,
        createdBy: changedBy,
      });
    }

    const prevBase = Number(current.base_price || 0);
    const prevMarkup = Number(current.markup_price || 0);
    const prevFinal = Number(current.final_price || 0);
    const nextBase = Number(updated.base_price || 0);
    const nextMarkup = Number(updated.markup_price || 0);
    const nextFinal = Number(updated.final_price || 0);
    if (prevBase !== nextBase || prevMarkup !== nextMarkup || prevFinal !== nextFinal) {
      createPriceLog({
        productId: id,
        basePriceBefore: prevBase,
        basePriceAfter: nextBase,
        markupPriceBefore: prevMarkup,
        markupPriceAfter: nextMarkup,
        finalPriceBefore: prevFinal,
        finalPriceAfter: nextFinal,
        changeReason: priceChangeReason,
        createdBy: changedBy,
      });
    }

    return res.json({
      status: 'success',
      message: 'Product updated',
      data: toProductPayload(updated),
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'internal_error',
        message: err.message,
      },
    });
  }
});

router.post('/:id/replenish', (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      status: 'error',
      error: {
        code: 'invalid_id',
        message: 'Invalid product id',
      },
    });
  }

  const quantityAdded = Number.parseInt(req.body?.quantity_added, 10);
  const unitCostRaw = req.body?.unit_cost;
  const notes = toTrimmedString(req.body?.notes || '').slice(0, 255) || null;
  const createdBy = toTrimmedString(req.body?.created_by || req.body?.changed_by || 'Admin').slice(0, 80) || 'Admin';

  if (!Number.isInteger(quantityAdded) || quantityAdded < 1 || quantityAdded > 1000000) {
    return sendValidationError(res, {
      quantity_added: ['quantity_added must be an integer between 1 and 1000000'],
    });
  }

  let unitCost = null;
  if (unitCostRaw != null && String(unitCostRaw).trim() !== '') {
    unitCost = Number(unitCostRaw);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      return sendValidationError(res, {
        unit_cost: ['unit_cost must be a number >= 0'],
      });
    }
  }

  try {
    const current = db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!current) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'product_not_found',
          message: 'Product not found',
        },
      });
    }

    const beforeQty = Number(current.quantity_in_stock || 0);
    const afterQty = beforeQty + quantityAdded;

    db.run(
      'UPDATE products SET quantity_in_stock = ?, updated_at = ? WHERE id = ?',
      [afterQty, new Date().toISOString(), id]
    );

    createInventoryLog({
      productId: id,
      eventType: 'replenish',
      quantityDelta: quantityAdded,
      quantityBefore: beforeQty,
      quantityAfter: afterQty,
      unitCost,
      notes,
      createdBy,
    });

    const updated = db.get('SELECT * FROM products WHERE id = ?', [id]);

    return res.json({
      status: 'success',
      message: 'Stock replenished',
      data: {
        product: toProductPayload(updated),
        replenishment: {
          quantity_added: quantityAdded,
          quantity_before: beforeQty,
          quantity_after: afterQty,
          unit_cost: unitCost == null ? null : roundMoney(unitCost),
          notes,
          created_by: createdBy,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'internal_error',
        message: err.message,
      },
    });
  }
});

router.get('/:id/inventory-logs', (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      status: 'error',
      error: {
        code: 'invalid_id',
        message: 'Invalid product id',
      },
    });
  }

  const limit = Number.parseInt(req.query.limit, 10) || 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return sendValidationError(res, {
      limit: ['limit must be an integer between 1 and 500'],
    });
  }

  try {
    const rows = db.all(
      `SELECT id, product_id, event_type, quantity_delta, quantity_before, quantity_after, unit_cost, notes, created_by, created_at
       FROM product_inventory_logs
       WHERE product_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [id, limit]
    );

    return res.json({
      status: 'success',
      data: (rows || []).map(toInventoryLogPayload),
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'internal_error',
        message: err.message,
      },
    });
  }
});

router.get('/:id/price-logs', (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      status: 'error',
      error: {
        code: 'invalid_id',
        message: 'Invalid product id',
      },
    });
  }

  const limit = Number.parseInt(req.query.limit, 10) || 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return sendValidationError(res, {
      limit: ['limit must be an integer between 1 and 500'],
    });
  }

  try {
    const rows = db.all(
      `SELECT id, product_id, base_price_before, base_price_after, markup_price_before, markup_price_after,
              final_price_before, final_price_after, change_reason, created_by, created_at
       FROM product_price_logs
       WHERE product_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [id, limit]
    );

    return res.json({
      status: 'success',
      data: (rows || []).map(toPriceLogPayload),
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'internal_error',
        message: err.message,
      },
    });
  }
});

router.delete('/:id', (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      status: 'error',
      error: {
        code: 'invalid_id',
        message: 'Invalid product id',
      },
    });
  }

  try {
    const existing = db.get('SELECT id FROM products WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'product_not_found',
          message: 'Product not found',
        },
      });
    }

    db.run('UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?', [new Date().toISOString(), id]);

    return res.json({
      status: 'success',
      message: 'Product archived',
      data: {
        id,
        is_active: false,
      },
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'internal_error',
        message: err.message,
      },
    });
  }
});

module.exports = router;
