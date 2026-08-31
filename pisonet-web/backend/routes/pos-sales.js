const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdminAuth } = require('../admin-auth');

const PAYMENT_METHOD_CASH = 'cash';
const WRITE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const WRITE_RATE_LIMIT_MAX_REQUESTS = 60;
const writeBuckets = new Map();

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

function padSaleNumber(id) {
  return String(id).padStart(6, '0');
}

function buildReferenceNumber(soldAtIso, id) {
  const safeDate = new Date(soldAtIso);
  const year = safeDate.getUTCFullYear();
  const month = String(safeDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getUTCDate()).padStart(2, '0');
  return `POS-${year}${month}${day}-${padSaleNumber(id)}`;
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

function parseDateParam(value, fieldName, fieldErrors) {
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

function toSalePayload(row, items = []) {
  return {
    id: row.id,
    reference_no: row.reference_no,
    subtotal: Number(row.subtotal || 0),
    payment_method: row.payment_method,
    notes: row.notes,
    sold_by: row.sold_by,
    sold_at: row.sold_at,
    items,
  };
}

function toReceiptPayload(sale, items) {
  return {
    reference_no: sale.reference_no,
    sold_at: sale.sold_at,
    sold_by: sale.sold_by,
    payment_method: sale.payment_method,
    notes: sale.notes,
    items,
    subtotal: Number(sale.subtotal || 0),
  };
}

router.use(requireAdminAuth);
router.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    return writeRateLimit(req, res, next);
  }
  return next();
});

router.post('/', (req, res) => {
  const body = req.body || {};
  const fieldErrors = {};

  const paymentMethod = String(body.payment_method || '').trim().toLowerCase();
  const soldBy = String(body.sold_by || '').trim();
  const notes = body.notes == null ? null : String(body.notes).trim();
  const itemsInput = Array.isArray(body.items) ? body.items : null;

  if (paymentMethod !== PAYMENT_METHOD_CASH) {
    fieldErrors.payment_method = ['payment_method must be cash'];
  }

  if (!soldBy || soldBy.length > 80) {
    fieldErrors.sold_by = ['sold_by is required and must be 1-80 characters'];
  }

  if (notes != null && notes.length > 500) {
    fieldErrors.notes = ['notes max length is 500'];
  }

  if (!itemsInput || itemsInput.length < 1 || itemsInput.length > 100) {
    fieldErrors.items = ['items must contain 1 to 100 entries'];
  }

  const normalizedItems = [];
  if (itemsInput) {
    itemsInput.forEach((item, index) => {
      const productId = parsePositiveInt(item?.product_id);
      const quantity = Number(item?.quantity);

      if (!productId) {
        fieldErrors[`items.${index}.product_id`] = ['product_id must be a positive integer'];
      }

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
        fieldErrors[`items.${index}.quantity`] = ['quantity must be an integer between 1 and 999'];
      }

      if (productId && Number.isInteger(quantity) && quantity >= 1 && quantity <= 999) {
        normalizedItems.push({ product_id: productId, quantity });
      }
    });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return sendValidationError(res, fieldErrors);
  }

  const mergedMap = new Map();
  normalizedItems.forEach((item) => {
    const existingQty = mergedMap.get(item.product_id) || 0;
    mergedMap.set(item.product_id, existingQty + item.quantity);
  });

  const mergedItems = Array.from(mergedMap.entries()).map(([product_id, quantity]) => ({ product_id, quantity }));
  const productIds = mergedItems.map((item) => item.product_id);
  const placeholders = productIds.map(() => '?').join(',');

  try {
    const productRows = db.all(
      `SELECT id, sku, name, size, quantity_in_stock, base_price, markup_price, final_price, is_active
       FROM products
       WHERE id IN (${placeholders})`,
      productIds
    );

    const byId = new Map((productRows || []).map((row) => [Number(row.id), row]));
    const missing = mergedItems.filter((item) => !byId.has(item.product_id)).map((item) => item.product_id);

    if (missing.length > 0) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'product_not_found',
          message: 'Some products were not found',
          details: { missing_product_ids: missing },
        },
      });
    }

    const inactive = mergedItems.filter((item) => Number(byId.get(item.product_id).is_active) !== 1).map((item) => item.product_id);
    if (inactive.length > 0) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'product_not_found',
          message: 'Some products are inactive',
          details: { missing_product_ids: inactive },
        },
      });
    }

    const insufficient = [];
    const pricedItems = mergedItems.map((item) => {
      const product = byId.get(item.product_id);
      const available = Number(product.quantity_in_stock || 0);
      if (item.quantity > available) {
        insufficient.push({
          product_id: item.product_id,
          sku: product.sku,
          name: product.name,
          requested_qty: item.quantity,
          available_qty: available,
        });
      }

      const unitBase = roundMoney(product.base_price || 0);
      const unitMarkup = roundMoney(product.markup_price || 0);
      const unitFinal = roundMoney(product.final_price || 0);
      const lineTotal = roundMoney(unitFinal * item.quantity);

      return {
        product_id: item.product_id,
        sku: product.sku,
        name: product.name,
        size: product.size || null,
        quantity: item.quantity,
        unit_base_price: unitBase,
        unit_markup_price: unitMarkup,
        unit_final_price: unitFinal,
        line_total: lineTotal,
        remaining_stock: available - item.quantity,
      };
    });

    if (insufficient.length > 0) {
      return res.status(409).json({
        status: 'error',
        error: {
          code: 'insufficient_stock',
          message: 'Insufficient stock for one or more items',
          details: { items: insufficient },
        },
      });
    }

    const subtotal = roundMoney(pricedItems.reduce((sum, item) => sum + item.line_total, 0));
    const totalQuantity = pricedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const soldAt = new Date().toISOString();
    const safeNotes = notes || null;

    let saleId;
    let referenceNo;
    let transactionId;

    db.run('BEGIN IMMEDIATE TRANSACTION');

    try {
      const createSale = db.run(
        `INSERT INTO product_sales (reference_no, subtotal, payment_method, notes, sold_by, sold_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`PENDING-${Date.now()}`, subtotal, PAYMENT_METHOD_CASH, safeNotes, soldBy, soldAt]
      );
      saleId = createSale.lastID;
      referenceNo = buildReferenceNumber(soldAt, saleId);

      db.run('UPDATE product_sales SET reference_no = ? WHERE id = ?', [referenceNo, saleId]);

      pricedItems.forEach((item) => {
        db.run(
          `INSERT INTO product_sale_items (
            sale_id, product_id, quantity, unit_base_price, unit_markup_price, unit_final_price, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            saleId,
            item.product_id,
            item.quantity,
            item.unit_base_price,
            item.unit_markup_price,
            item.unit_final_price,
            item.line_total,
          ]
        );

        const stockUpdate = db.run(
          'UPDATE products SET quantity_in_stock = quantity_in_stock - ?, updated_at = ? WHERE id = ? AND quantity_in_stock >= ?',
          [item.quantity, soldAt, item.product_id, item.quantity]
        );

        if (!stockUpdate || Number(stockUpdate.changes || 0) !== 1) {
          throw new Error(`Stock update conflict for product_id ${item.product_id}`);
        }
      });

      const txInsert = db.run(
        `INSERT INTO transactions (unit_id, amount, denomination, timestamp, transaction_type, session_id, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          null,
          subtotal,
          totalQuantity,
          soldAt,
          'product_order',
          null,
          `POS Sale: ${pricedItems
            .map((item) => `${item.sku}, ${item.name}, ${item.size || 'N/A'}, ${item.quantity}`)
            .join(' | ')}${safeNotes ? `, Notes: ${safeNotes}` : ''}`,
        ]
      );

      transactionId = txInsert.lastID;
      db.run('COMMIT');
    } catch (err) {
      try {
        db.run('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Rollback failed:', rollbackErr.message);
      }
      throw err;
    }

    db.saveNow();

    if (global.broadcast) {
      global.broadcast({
        type: 'PRODUCT_STOCK_UPDATED',
        product_ids: pricedItems.map((item) => item.product_id),
        products: pricedItems.map((item) => ({
          product_id: item.product_id,
          remaining_stock: item.remaining_stock,
        })),
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Sale recorded',
      data: {
        sale: {
          id: saleId,
          reference_no: referenceNo,
          subtotal,
          payment_method: PAYMENT_METHOD_CASH,
          notes: safeNotes,
          sold_by: soldBy,
          sold_at: soldAt,
        },
        items: pricedItems.map((item) => ({
          product_id: item.product_id,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unit_final_price: item.unit_final_price,
          line_total: item.line_total,
          remaining_stock: item.remaining_stock,
        })),
        transaction: {
          transaction_id: transactionId,
          transaction_type: 'product_order',
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

router.get('/', (req, res) => {
  const fieldErrors = {};

  const page = Number.parseInt(req.query.page, 10) || 1;
  const limit = Number.parseInt(req.query.limit, 10) || 20;
  const search = String(req.query.search || '').trim();
  const startDate = parseDateParam(req.query.start_date, 'start_date', fieldErrors);
  const endDate = parseDateParam(req.query.end_date, 'end_date', fieldErrors);

  if (!Number.isInteger(page) || page < 1) fieldErrors.page = ['page must be an integer >= 1'];
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fieldErrors.limit = ['limit must be an integer between 1 and 100'];
  if (startDate && endDate && startDate > endDate) fieldErrors.date_range = ['start_date must be <= end_date'];

  if (Object.keys(fieldErrors).length > 0) {
    return sendValidationError(res, fieldErrors);
  }

  const where = [];
  const params = [];

  if (search) {
    where.push('(UPPER(reference_no) LIKE ? OR UPPER(sold_by) LIKE ?)');
    const pattern = `%${search.toUpperCase()}%`;
    params.push(pattern, pattern);
  }
  if (startDate) {
    where.push('sold_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    where.push('sold_at <= ?');
    params.push(endDate);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  try {
    const totalRow = db.get(`SELECT COUNT(*) as total FROM product_sales ${whereSql}`, params);
    const rows = db.all(
      `SELECT id, reference_no, subtotal, payment_method, notes, sold_by, sold_at
       FROM product_sales
       ${whereSql}
       ORDER BY sold_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const total = Number(totalRow?.total || 0);
    return res.json({
      status: 'success',
      data: (rows || []).map((row) => toSalePayload(row)),
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

router.get('/reports/daily', (req, res) => {
  const fieldErrors = {};
  const days = Number.parseInt(req.query.days, 10) || 365;

  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    fieldErrors.days = ['days must be an integer between 1 and 3650'];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return sendValidationError(res, fieldErrors);
  }

  const sinceDate = new Date();
  sinceDate.setUTCDate(sinceDate.getUTCDate() - (days - 1));
  sinceDate.setUTCHours(0, 0, 0, 0);
  const sinceIso = sinceDate.toISOString();

  try {
    const rows = db.all(
      `SELECT
         sales_day.date,
         sales_day.order_count,
         sales_day.total_sales,
         COALESCE(items_day.items_sold, 0) AS items_sold
       FROM (
         SELECT
           substr(ps.sold_at, 1, 10) AS date,
           COUNT(*) AS order_count,
           COALESCE(SUM(ps.subtotal), 0) AS total_sales
         FROM product_sales ps
         WHERE ps.sold_at >= ?
         GROUP BY substr(ps.sold_at, 1, 10)
       ) AS sales_day
       LEFT JOIN (
         SELECT
           substr(ps.sold_at, 1, 10) AS date,
           COALESCE(SUM(psi.quantity), 0) AS items_sold
         FROM product_sales ps
         JOIN product_sale_items psi ON psi.sale_id = ps.id
         WHERE ps.sold_at >= ?
         GROUP BY substr(ps.sold_at, 1, 10)
       ) AS items_day ON items_day.date = sales_day.date
       ORDER BY sales_day.date ASC`,
      [sinceIso, sinceIso]
    );

    return res.json({
      status: 'success',
      data: (rows || []).map((row) => ({
        date: row.date,
        order_count: Number(row.order_count || 0),
        items_sold: Number(row.items_sold || 0),
        total_sales: Number(row.total_sales || 0),
      })),
      meta: {
        days,
        since: sinceIso,
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

router.get('/:id', (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      status: 'error',
      error: {
        code: 'invalid_id',
        message: 'Invalid sale id',
      },
    });
  }

  try {
    const sale = db.get(
      'SELECT id, reference_no, subtotal, payment_method, notes, sold_by, sold_at FROM product_sales WHERE id = ?',
      [id]
    );
    if (!sale) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'sale_not_found',
          message: 'Sale not found',
        },
      });
    }

    const items = db.all(
      `SELECT
         i.id,
         i.product_id,
         p.sku,
         p.name,
         i.quantity,
         i.unit_base_price,
         i.unit_markup_price,
         i.unit_final_price,
         i.line_total
       FROM product_sale_items i
       JOIN products p ON p.id = i.product_id
       WHERE i.sale_id = ?
       ORDER BY i.id ASC`,
      [id]
    ).map((row) => ({
      id: row.id,
      product_id: row.product_id,
      sku: row.sku,
      name: row.name,
      quantity: Number(row.quantity || 0),
      unit_base_price: Number(row.unit_base_price || 0),
      unit_markup_price: Number(row.unit_markup_price || 0),
      unit_final_price: Number(row.unit_final_price || 0),
      line_total: Number(row.line_total || 0),
    }));

    return res.json({
      status: 'success',
      data: toSalePayload(sale, items),
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

router.get('/:id/receipt', (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({
      status: 'error',
      error: {
        code: 'invalid_id',
        message: 'Invalid sale id',
      },
    });
  }

  try {
    const sale = db.get(
      'SELECT id, reference_no, subtotal, payment_method, notes, sold_by, sold_at FROM product_sales WHERE id = ?',
      [id]
    );

    if (!sale) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'sale_not_found',
          message: 'Sale not found',
        },
      });
    }

    const items = db.all(
      `SELECT
         i.product_id,
         p.sku,
         p.name,
         i.quantity,
         i.unit_final_price,
         i.line_total
       FROM product_sale_items i
       JOIN products p ON p.id = i.product_id
       WHERE i.sale_id = ?
       ORDER BY i.id ASC`,
      [id]
    ).map((row) => ({
      product_id: row.product_id,
      sku: row.sku,
      name: row.name,
      quantity: Number(row.quantity || 0),
      unit_final_price: Number(row.unit_final_price || 0),
      line_total: Number(row.line_total || 0),
    }));

    return res.json({
      status: 'success',
      data: toReceiptPayload(sale, items),
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
