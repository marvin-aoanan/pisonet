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

function calculatePosSaleSubtotal({ transactionType, baseSubtotal, amountOverride }) {
  if (transactionType === 'sale') {
    return Number(baseSubtotal) || 0;
  }

  if (transactionType === 'internal_usage' && amountOverride != null && Number.isFinite(Number(amountOverride)) && Number(amountOverride) >= 0) {
    return -Number(amountOverride);
  }

  return Number(baseSubtotal) || 0;
}

function normalizePosTransactionLedgerEntry({ transactionType, totalQuantity, transactionAmount, description }) {
  const safeTransactionType = transactionType === 'internal_usage' ? 'internal_usage' : 'product_order';
  const safeAmount = Number(transactionAmount) || 0;
  const safeDenomination = Number(totalQuantity) || 0;
  const safeDescription = description || null;

  return {
    transaction_type: safeTransactionType,
    amount: safeAmount,
    denomination: safeDenomination,
    description: safeDescription,
  };
}

function normalizePosReportReturnAmount(row) {
  const amount = Number(row?.amount ?? 0);
  const description = String(row?.description || '');
  const transactionType = String(row?.transaction_type || '');

  if (transactionType !== 'product_order') {
    return 0;
  }

  if (amount < 0 || /POS Return/i.test(description)) {
    return Math.abs(amount);
  }

  return 0;
}

function normalizePosReportInternalUsageAmount(row) {
  const amount = Number(row?.amount ?? 0);
  const transactionType = String(row?.transaction_type || '');

  if (transactionType !== 'internal_usage') {
    return 0;
  }

  return Math.abs(amount);
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
  const explicitTransactionType = String(body.transaction_type || '').trim().toLowerCase();
  const allowedTransactionTypes = new Set(['sale', 'return_invalid', 'internal_usage']);
  const transactionType = allowedTransactionTypes.has(explicitTransactionType)
    ? explicitTransactionType
    : (body?.is_deduction === true || body?.is_deduction === 'true' || body?.is_deduction === 1 ? 'return_invalid' : 'sale');
  const isDeduction = transactionType !== 'sale';

  const paymentMethod = String(body.payment_method || '').trim().toLowerCase();
  const soldBy = String(body.sold_by || '').trim();
  const notes = body.notes == null ? null : String(body.notes).trim();
  const itemsInput = Array.isArray(body.items) ? body.items : null;
  const amountOverride = body.amount_override == null ? null : Number(body.amount_override);

  if (paymentMethod !== PAYMENT_METHOD_CASH) {
    fieldErrors.payment_method = ['payment_method must be cash'];
  }

  if (!soldBy || soldBy.length > 80) {
    fieldErrors.sold_by = ['sold_by is required and must be 1-80 characters'];
  }

  if (notes != null && notes.length > 500) {
    fieldErrors.notes = ['notes max length is 500'];
  }

  if (transactionType === 'internal_usage' && amountOverride != null && (!Number.isFinite(amountOverride) || amountOverride < 0)) {
    fieldErrors.amount_override = ['amount_override must be a non-negative number'];
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
    const totalQuantity = mergedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const pricedItems = mergedItems.map((item) => {
      const product = byId.get(item.product_id);
      const available = Number(product.quantity_in_stock || 0);
      const unitBase = roundMoney(product.base_price || 0);
      const unitMarkup = roundMoney(product.markup_price || 0);
      const unitFinal = roundMoney(product.final_price || 0);
      const baseLineTotal = roundMoney(unitFinal * item.quantity);
      const effectiveLineTotal = transactionType === 'sale'
        ? baseLineTotal
        : transactionType === 'internal_usage' && amountOverride != null && Number.isFinite(amountOverride)
          ? roundMoney(-(amountOverride / totalQuantity) * item.quantity)
          : -baseLineTotal;

      if (transactionType !== 'return_invalid' && item.quantity > available) {
        insufficient.push({
          product_id: item.product_id,
          sku: product.sku,
          name: product.name,
          requested_qty: item.quantity,
          available_qty: available,
        });
      }

      return {
        product_id: item.product_id,
        sku: product.sku,
        name: product.name,
        size: product.size || null,
        quantity: item.quantity,
        unit_base_price: unitBase,
        unit_markup_price: unitMarkup,
        unit_final_price: unitFinal,
        line_total: effectiveLineTotal,
        remaining_stock: transactionType === 'return_invalid' ? available + item.quantity : available - item.quantity,
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

    const baseSubtotal = roundMoney(pricedItems.reduce((sum, item) => sum + item.line_total, 0));
    const subtotal = calculatePosSaleSubtotal({
      transactionType,
      baseSubtotal,
      amountOverride,
    });
    const transactionAmount = subtotal;
    const soldAt = new Date().toISOString();
    const safeNotes = notes || null;

    let saleId;
    let referenceNo;
    let transactionId;
    const pendingReferenceNo = `PENDING-${Date.now()}`;

    db.run('BEGIN IMMEDIATE TRANSACTION');

    try {
      db.run(
        `INSERT INTO product_sales (reference_no, subtotal, payment_method, notes, sold_by, sold_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [pendingReferenceNo, subtotal, PAYMENT_METHOD_CASH, safeNotes, soldBy, soldAt]
      );
      const saleIdRow = db.get('SELECT id FROM product_sales WHERE reference_no = ?', [pendingReferenceNo]);
      saleId = Number(saleIdRow?.id || 0);

      if (!saleId) {
        throw new Error('Failed to resolve inserted sale id');
      }

      referenceNo = buildReferenceNumber(soldAt, saleId);

      db.run('UPDATE product_sales SET reference_no = ? WHERE id = ?', [referenceNo, saleId]);

      pricedItems.forEach((item) => {
        const basePrice = item.unit_final_price;
        const effectiveLineTotal = item.line_total;

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
            effectiveLineTotal,
          ]
        );

        const stockDelta = transactionType === 'return_invalid' ? item.quantity : -item.quantity;
        const stockUpdate = db.run(
          transactionType === 'return_invalid'
            ? 'UPDATE products SET quantity_in_stock = quantity_in_stock + ?, updated_at = ? WHERE id = ?'
            : 'UPDATE products SET quantity_in_stock = quantity_in_stock - ?, updated_at = ? WHERE id = ? AND quantity_in_stock >= ?',
          transactionType === 'return_invalid'
            ? [item.quantity, soldAt, item.product_id]
            : [item.quantity, soldAt, item.product_id, item.quantity]
        );

        if (!stockUpdate || Number(stockUpdate.changes || 0) !== 1) {
          throw new Error(`Stock update conflict for product_id ${item.product_id}`);
        }

        db.run(
          `INSERT INTO product_inventory_logs (
            product_id, event_type, quantity_delta, quantity_before, quantity_after, unit_cost, notes, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.product_id,
            transactionType === 'return_invalid' ? 'POS_RETURN_INVALID' : 'POS_INTERNAL_USAGE',
            stockDelta,
            Number(byId.get(item.product_id).quantity_in_stock || 0),
            Number(byId.get(item.product_id).quantity_in_stock || 0) + stockDelta,
            basePrice,
            safeNotes || null,
            soldBy,
            soldAt,
          ]
        );
      });

      const ledgerEntry = normalizePosTransactionLedgerEntry({
        transactionType,
        totalQuantity,
        transactionAmount,
        description: `${transactionType === 'return_invalid' ? 'POS Return/Invalid' : transactionType === 'internal_usage' ? 'POS Internal Usage' : 'POS Sale'}: ${pricedItems
          .map((item) => `${item.sku}, ${item.name}, ${item.size || 'N/A'}, ${item.quantity}`)
          .join(' | ')}${safeNotes ? `, Notes: ${safeNotes}` : ''}`,
      });

      const txInsert = db.run(
        `INSERT INTO transactions (unit_id, amount, denomination, timestamp, transaction_type, session_id, description, sold_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          null,
          ledgerEntry.amount,
          ledgerEntry.denomination,
          soldAt,
          ledgerEntry.transaction_type,
          null,
          ledgerEntry.description,
          soldBy,
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
          remaining_stock: transactionType === 'return_invalid' ? Number(byId.get(item.product_id).quantity_in_stock || 0) + item.quantity : Number(byId.get(item.product_id).quantity_in_stock || 0) - item.quantity,
        })),
      });
    }

    return res.status(201).json({
      status: 'success',
      message: transactionType === 'return_invalid' ? 'Return/Invalid recorded' : transactionType === 'internal_usage' ? 'Internal usage recorded' : 'Sale recorded',
      data: {
        sale: {
          id: saleId,
          reference_no: referenceNo,
          subtotal,
          payment_method: PAYMENT_METHOD_CASH,
          notes: safeNotes,
          sold_by: soldBy,
          sold_at: soldAt,
          transaction_type: transactionType,
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
          transaction_type: normalizePosTransactionLedgerEntry({
            transactionType,
            totalQuantity,
            transactionAmount,
          }).transaction_type,
          is_deduction: isDeduction,
          amount: transactionAmount,
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

  const sinceModifier = `-${days - 1} days`;

  try {
    const rows = db.all(
      `WITH
         sales_day AS (
           SELECT
             DATE(ps.sold_at, 'localtime') AS date,
             COALESCE(SUM(CASE WHEN ps.subtotal > 0 THEN 1 ELSE 0 END), 0) AS order_count,
             COALESCE(SUM(CASE WHEN ps.subtotal > 0 THEN ps.subtotal ELSE 0 END), 0) AS gross_sales
           FROM product_sales ps
           WHERE datetime(ps.sold_at, 'localtime') >= datetime('now', 'localtime', 'start of day', ?)
           GROUP BY DATE(ps.sold_at, 'localtime')
         ),
         items_day AS (
           SELECT
             DATE(psi.created_at, 'localtime') AS date,
             COALESCE(SUM(CASE WHEN psi.line_total > 0 THEN psi.quantity ELSE 0 END), 0) AS items_sold,
             COALESCE(SUM(CASE WHEN psi.line_total > 0 THEN psi.line_total - (psi.unit_base_price * psi.quantity) ELSE 0 END), 0) AS total_profit,
             COALESCE(SUM(CASE WHEN psi.line_total > 0 THEN psi.quantity ELSE 0 END), 0) AS sales_quantity
           FROM product_sale_items psi
           WHERE datetime(psi.created_at, 'localtime') >= datetime('now', 'localtime', 'start of day', ?)
           GROUP BY DATE(psi.created_at, 'localtime')
         ),
         net_store_day AS (
           SELECT
             DATE(t.timestamp, 'localtime') AS date,
             COALESCE(SUM(CAST(t.amount AS REAL)), 0) AS net_store_sales
           FROM transactions t
           WHERE datetime(t.timestamp, 'localtime') >= datetime('now', 'localtime', 'start of day', ?)
             AND t.transaction_type = 'product_order'
           GROUP BY DATE(t.timestamp, 'localtime')
         ),
         returns_day AS (
           SELECT
             DATE(t.timestamp, 'localtime') AS date,
             COALESCE(SUM(CASE WHEN t.amount < 0 OR instr(COALESCE(t.description, ''), 'POS Return') > 0 THEN ABS(CAST(t.denomination AS REAL)) ELSE 0 END), 0) AS total_return_quantity,
             COALESCE(SUM(CASE WHEN t.amount < 0 OR instr(COALESCE(t.description, ''), 'POS Return') > 0 THEN ABS(CAST(t.amount AS REAL)) ELSE 0 END), 0) AS total_returns
           FROM transactions t
           WHERE datetime(t.timestamp, 'localtime') >= datetime('now', 'localtime', 'start of day', ?)
             AND t.transaction_type = 'product_order'
           GROUP BY DATE(t.timestamp, 'localtime')
         ),
         internal_usage_day AS (
           SELECT
             DATE(t.timestamp, 'localtime') AS date,
             COALESCE(SUM(CASE WHEN t.transaction_type = 'internal_usage' THEN ABS(CAST(t.denomination AS REAL)) ELSE 0 END), 0) AS total_internal_usage_quantity,
             COALESCE(SUM(CASE WHEN t.transaction_type = 'internal_usage' THEN ABS(CAST(t.amount AS REAL)) ELSE 0 END), 0) AS total_internal_usage
           FROM transactions t
           WHERE datetime(t.timestamp, 'localtime') >= datetime('now', 'localtime', 'start of day', ?)
             AND t.transaction_type = 'internal_usage'
           GROUP BY DATE(t.timestamp, 'localtime')
         ),
         all_days AS (
           SELECT date FROM sales_day
           UNION
           SELECT date FROM items_day
           UNION
           SELECT date FROM net_store_day
           UNION
           SELECT date FROM returns_day
           UNION
           SELECT date FROM internal_usage_day
         )
       SELECT
         d.date,
         COALESCE(sales_day.order_count, 0) AS order_count,
         COALESCE(net_store_day.net_store_sales, 0) AS total_sales,
         COALESCE(sales_day.gross_sales, 0) AS gross_sales,
         COALESCE(net_store_day.net_store_sales, 0) AS net_store_sales,
         COALESCE(items_day.items_sold, 0) AS items_sold,
         COALESCE(items_day.total_profit, 0) AS total_profit,
         COALESCE(items_day.sales_quantity, 0) AS sales_quantity,
         COALESCE(returns_day.total_returns, 0) AS total_returns,
         COALESCE(returns_day.total_return_quantity, 0) AS total_return_quantity,
         COALESCE(internal_usage_day.total_internal_usage, 0) AS total_internal_usage,
         COALESCE(internal_usage_day.total_internal_usage_quantity, 0) AS total_internal_usage_quantity
       FROM all_days d
       LEFT JOIN sales_day ON sales_day.date = d.date
       LEFT JOIN items_day ON items_day.date = d.date
       LEFT JOIN net_store_day ON net_store_day.date = d.date
       LEFT JOIN returns_day ON returns_day.date = d.date
       LEFT JOIN internal_usage_day ON internal_usage_day.date = d.date
       ORDER BY d.date ASC`,
      [sinceModifier, sinceModifier, sinceModifier, sinceModifier, sinceModifier]
    );

    return res.json({
      status: 'success',
      data: (rows || []).map((row) => ({
        date: row.date,
        order_count: Number(row.order_count || 0),
        items_sold: Number(row.items_sold || 0),
        sales_quantity: Number(row.sales_quantity || row.items_sold || 0),
        total_sales: Number(row.total_sales || 0),
        gross_sales: Number(row.gross_sales || 0),
        net_store_sales: Number(row.net_store_sales || row.total_sales || 0),
        total_profit: Number(row.total_profit || 0),
        total_returns: Number(row.total_returns || 0),
        total_return_quantity: Number(row.total_return_quantity || 0),
        total_internal_usage: Number(row.total_internal_usage || 0),
        total_internal_usage_quantity: Number(row.total_internal_usage_quantity || 0),
      })),
      meta: {
        days,
        since: sinceModifier,
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
module.exports.calculatePosSaleSubtotal = calculatePosSaleSubtotal;
module.exports.normalizePosTransactionLedgerEntry = normalizePosTransactionLedgerEntry;
