const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdminAuth } = require('../admin-auth');
const { calculateFlatRateAmountFromMinutes, loadFlatRateSettings } = require('../pricing');

const WRITE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const WRITE_RATE_LIMIT_MAX_REQUESTS = 60;
const ALLOWED_SORT_BY = new Set(['entry_date', 'created_at', 'updated_at', 'amount', 'category', 'direction', 'ledger_group', 'entry_type']);
const ALLOWED_SORT_ORDER = new Set(['asc', 'desc']);
const DEFAULT_CATEGORIES = ['Utilities', 'Rent', 'Supplies', 'Maintenance', 'Salaries', 'Internet', 'Other'];
const DEFAULT_SOURCES = ['Owner Top-up', 'Loan', 'Refund', 'Other'];
const LEDGER_GROUP_OPTIONS = ['operating', 'capital', 'financing', 'asset'];
const ENTRY_TYPE_OPTIONS = {
  operating: ['rent', 'utilities', 'internet', 'salary', 'maintenance', 'supplies', 'inventory_purchase', 'other_opex'],
  capital: ['initial_capital', 'owner_topup', 'partner_investment', 'capital_withdrawal'],
  financing: ['loan_proceeds', 'loan_payment', 'interest_payment', 'other_financing'],
  asset: ['pc_purchase', 'printer_purchase', 'renovation', 'furniture', 'equipment_upgrade', 'other_asset'],
};
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

function toSafeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildMetadata() {
  const entryTypeSetting = readJsonSetting('opex_entry_types', ENTRY_TYPE_OPTIONS);
  const normalizedEntryTypes = LEDGER_GROUP_OPTIONS.reduce((acc, group) => {
    const list = Array.isArray(entryTypeSetting?.[group]) ? entryTypeSetting[group] : ENTRY_TYPE_OPTIONS[group];
    acc[group] = Array.from(new Set((list || []).map((entry) => String(entry || '').trim()).filter(Boolean)));
    return acc;
  }, {});

  return {
    ledger_groups: LEDGER_GROUP_OPTIONS.map((value) => ({ value, label: value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) })),
    entry_type_options: normalizedEntryTypes,
    categories: readStringListSetting('opex_categories', DEFAULT_CATEGORIES),
    fund_sources: readStringListSetting('opex_fund_sources', DEFAULT_SOURCES),
  };
}

function isCogsEntry(row) {
  if (row?.ledger_group !== 'operating') {
    return false;
  }

  const entryType = String(row?.entry_type || '').trim().toLowerCase();
  const category = String(row?.category || '').trim().toLowerCase();

  return entryType === 'inventory_purchase' || category === 'inventory purchase';
}

function getRevenueCategory(row) {
  const transactionType = String(row?.transaction_type || '').trim();

  if (transactionType === 'product_order') {
    return 'store_sales';
  }

  if (transactionType.startsWith('print_')) {
    return 'print_sales';
  }

  if (row?.unit_id != null) {
    return 'pc_rental_sales';
  }

  return null;
}

function getNormalizedRevenueAmount(row, flatRateSettings) {
  const amount = Number(row?.amount || 0);
  const type = row?.transaction_type;

  if (type === 'admin_add' || type === 'admin_deduct') {
    const sign = amount < 0 ? -1 : 1;
    const minutes = Math.abs(amount);
    const converted = calculateFlatRateAmountFromMinutes(minutes, flatRateSettings, { minimumCharge: false });
    return sign * converted;
  }

  return amount;
}

function loadRevenueRows(startDate, endDate, callback) {
  loadFlatRateSettings(db, (settingsErr, flatRateSettings) => {
    if (settingsErr) {
      callback(settingsErr);
      return;
    }

    let query = `
      SELECT DATE(timestamp, 'localtime') AS date, amount, denomination, transaction_type, unit_id
      FROM transactions
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY timestamp ASC, id ASC';

    db.all(query, params, (err, rows) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, rows || [], flatRateSettings);
    });
  });
}

function applyTimeRangeFilters(queryParts, params, columnName, startDate, endDate) {
  if (startDate) {
    queryParts.push(`${columnName} >= ?`);
    params.push(startDate);
  }

  if (endDate) {
    queryParts.push(`${columnName} <= ?`);
    params.push(endDate);
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

function readStringListSetting(key, fallback) {
  const row = db.get('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row?.value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) {
      return fallback;
    }

    const cleaned = parsed
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);

    return cleaned.length > 0 ? cleaned : fallback;
  } catch {
    return fallback;
  }
}

function writeStringListSetting(key, list) {
  const uniqueCleaned = Array.from(new Set(
    (Array.isArray(list) ? list : [])
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
  ));

  const serialized = JSON.stringify(uniqueCleaned);
  const nowIso = new Date().toISOString();
  const updateInfo = db.run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [serialized, nowIso, key]);
  if (Number(updateInfo?.changes || 0) === 0) {
    db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, serialized]);
  }

  return uniqueCleaned;
}

function readJsonSetting(key, fallback) {
  const row = db.get('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row?.value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(row.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fallback;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function writeJsonSetting(key, value) {
  const serialized = JSON.stringify(value);
  const nowIso = new Date().toISOString();
  const updateInfo = db.run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [serialized, nowIso, key]);
  if (Number(updateInfo?.changes || 0) === 0) {
    db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, serialized]);
  }

  return value;
}

function validateIsoDate(value, fieldName, fieldErrors) {
  const safe = toSafeString(value);
  if (!safe) {
    fieldErrors[fieldName] = [`${fieldName} is required`];
    return null;
  }

  const parsed = new Date(safe);
  if (Number.isNaN(parsed.getTime())) {
    fieldErrors[fieldName] = [`${fieldName} must be a valid ISO datetime`];
    return null;
  }

  return parsed.toISOString();
}

function validateInput(body, { isUpdate = false } = {}) {
  const fieldErrors = {};

  const direction = body.direction == null ? undefined : toSafeString(body.direction).toLowerCase();
  const ledgerGroup = body.ledger_group == null ? undefined : toSafeString(body.ledger_group).toLowerCase();
  const entryType = body.entry_type == null ? undefined : toSafeString(body.entry_type).toLowerCase();
  const category = body.category == null ? undefined : toSafeString(body.category);
  const sourceType = body.source_type == null ? null : toSafeString(body.source_type);
  const sourceOrPayee = body.source_or_payee == null ? null : toSafeString(body.source_or_payee);
  const description = body.description == null ? null : toSafeString(body.description);
  const amount = body.amount == null ? undefined : Number(body.amount);
  const entryDate = body.entry_date == null ? undefined : validateIsoDate(body.entry_date, 'entry_date', fieldErrors);

  if (!isUpdate || direction !== undefined) {
    if (!direction || (direction !== 'expense' && direction !== 'fund_in')) {
      fieldErrors.direction = ['direction must be either expense or fund_in'];
    }
  }

  if (!isUpdate || ledgerGroup !== undefined) {
    if (!ledgerGroup || !LEDGER_GROUP_OPTIONS.includes(ledgerGroup)) {
      fieldErrors.ledger_group = [`ledger_group must be one of: ${LEDGER_GROUP_OPTIONS.join(', ')}`];
    }
  }

  if (!isUpdate || entryType !== undefined) {
    if (!entryType) {
      fieldErrors.entry_type = ['entry_type is required'];
    } else if (entryType.length > 80) {
      fieldErrors.entry_type = ['entry_type max length is 80'];
    }
  }

  if (!isUpdate || category !== undefined) {
    if (!category) {
      fieldErrors.category = ['category is required'];
    } else if (category.length > 80) {
      fieldErrors.category = ['category max length is 80'];
    }
  }

  if (sourceType != null && sourceType.length > 80) {
    fieldErrors.source_type = ['source_type max length is 80'];
  }

  if (sourceOrPayee != null && sourceOrPayee.length > 120) {
    fieldErrors.source_or_payee = ['source_or_payee max length is 120'];
  }

  if (description != null && description.length > 600) {
    fieldErrors.description = ['description max length is 600'];
  }

  if (!isUpdate || amount !== undefined) {
    if (!Number.isFinite(amount) || amount <= 0) {
      fieldErrors.amount = ['amount must be a positive number'];
    }
  }

  if (!isUpdate || entryDate !== undefined) {
    if (!isUpdate && entryDate === undefined) {
      fieldErrors.entry_date = ['entry_date is required'];
    } else if (entryDate === null) {
      if (!fieldErrors.entry_date) {
        fieldErrors.entry_date = ['entry_date is required'];
      }
    }
  }

  return {
    fieldErrors,
    value: {
      direction,
      ledger_group: ledgerGroup,
      entry_type: entryType,
      category,
      source_type: sourceType,
      source_or_payee: sourceOrPayee,
      description,
      amount: amount == null ? undefined : roundMoney(amount),
      entry_date: entryDate,
    },
  };
}

function toOpexPayload(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    reference_no: row.reference_no,
    direction: row.direction,
    ledger_group: row.ledger_group,
    entry_type: row.entry_type,
    category: row.category,
    source_type: row.source_type,
    source_or_payee: row.source_or_payee,
    description: row.description,
    amount: Number(row.amount || 0),
    entry_date: row.entry_date,
    status: row.status,
    void_reason: row.void_reason,
    voided_at: row.voided_at,
    voided_by: row.voided_by,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createLog(entryId, eventType, changedBy, reason = null, fields = []) {
  const nowIso = new Date().toISOString();
  if (!Array.isArray(fields) || fields.length === 0) {
    db.run(
      `INSERT INTO opex_logs (entry_id, event_type, reason, changed_by, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [entryId, eventType, reason, changedBy || null, nowIso]
    );
    return;
  }

  fields.forEach((field) => {
    db.run(
      `INSERT INTO opex_logs (entry_id, event_type, field_name, value_before, value_after, reason, changed_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entryId,
        eventType,
        field.field_name,
        field.value_before == null ? null : String(field.value_before),
        field.value_after == null ? null : String(field.value_after),
        reason,
        changedBy || null,
        nowIso,
      ]
    );
  });
}

function getNextReference(entryDateIso, id) {
  const safeDate = new Date(entryDateIso);
  const year = safeDate.getUTCFullYear();
  const month = String(safeDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getUTCDate()).padStart(2, '0');
  return `OPEX-${year}${month}${day}-${String(id).padStart(6, '0')}`;
}

function getPendingReference() {
  return `PENDING-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

router.use(requireAdminAuth);
router.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    return writeRateLimit(req, res, next);
  }
  return next();
});

router.get('/metadata', (req, res) => {
  return res.json({ data: buildMetadata() });
});

router.put('/metadata', (req, res) => {
  const body = req.body || {};
  const fieldErrors = {};

  const categories = Array.isArray(body.categories) ? body.categories : null;
  const fundSources = Array.isArray(body.fund_sources) ? body.fund_sources : null;
  const entryTypeOptions = body.entry_type_options && typeof body.entry_type_options === 'object' && !Array.isArray(body.entry_type_options)
    ? body.entry_type_options
    : null;

  if (!categories) {
    fieldErrors.categories = ['categories must be an array of strings'];
  }

  if (!fundSources) {
    fieldErrors.fund_sources = ['fund_sources must be an array of strings'];
  }

  if (!entryTypeOptions) {
    fieldErrors.entry_type_options = ['entry_type_options must be an object keyed by ledger group'];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return sendValidationError(res, fieldErrors);
  }

  const cleanedCategories = writeStringListSetting('opex_categories', categories);
  const cleanedFundSources = writeStringListSetting('opex_fund_sources', fundSources);

  const cleanedEntryTypes = LEDGER_GROUP_OPTIONS.reduce((acc, group) => {
    const groupValues = Array.isArray(entryTypeOptions[group]) ? entryTypeOptions[group] : ENTRY_TYPE_OPTIONS[group];
    acc[group] = Array.from(new Set((groupValues || []).map((entry) => String(entry || '').trim()).filter(Boolean)));
    return acc;
  }, {});

  writeJsonSetting('opex_entry_types', cleanedEntryTypes);

  return res.json({
    data: {
      categories: cleanedCategories,
      fund_sources: cleanedFundSources,
      entry_type_options: cleanedEntryTypes,
    },
  });
});

router.get('/categories', (req, res) => {
  const categories = readStringListSetting('opex_categories', DEFAULT_CATEGORIES);
  return res.json({ data: categories });
});

router.put('/categories', (req, res) => {
  const categories = req.body?.categories;
  if (!Array.isArray(categories)) {
    return sendValidationError(res, { categories: ['categories must be an array of strings'] });
  }

  const saved = writeStringListSetting('opex_categories', categories);
  return res.json({ data: saved });
});

router.get('/fund-sources', (req, res) => {
  const sources = readStringListSetting('opex_fund_sources', DEFAULT_SOURCES);
  return res.json({ data: sources });
});

router.put('/fund-sources', (req, res) => {
  const sources = req.body?.sources;
  if (!Array.isArray(sources)) {
    return sendValidationError(res, { sources: ['sources must be an array of strings'] });
  }

  const saved = writeStringListSetting('opex_fund_sources', sources);
  return res.json({ data: saved });
});

router.get('/', (req, res) => {
  const limitRaw = Number.parseInt(req.query.limit, 10);
  const offsetRaw = Number.parseInt(req.query.offset, 10);
  const sortByRaw = toSafeString(req.query.sort_by || 'entry_date');
  const sortOrderRaw = toSafeString(req.query.sort_order || 'desc').toLowerCase();

  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const sortBy = ALLOWED_SORT_BY.has(sortByRaw) ? sortByRaw : 'entry_date';
  const sortOrder = ALLOWED_SORT_ORDER.has(sortOrderRaw) ? sortOrderRaw : 'desc';

  const direction = toSafeString(req.query.direction).toLowerCase();
  const ledgerGroup = toSafeString(req.query.ledger_group).toLowerCase();
  const entryType = toSafeString(req.query.entry_type).toLowerCase();
  const category = toSafeString(req.query.category);
  const status = toSafeString(req.query.status).toLowerCase();
  const search = toSafeString(req.query.q);
  const startDate = toSafeString(req.query.start_date);
  const endDate = toSafeString(req.query.end_date);

  const where = [];
  const params = [];

  if (direction === 'expense' || direction === 'fund_in') {
    where.push('direction = ?');
    params.push(direction);
  }

  if (LEDGER_GROUP_OPTIONS.includes(ledgerGroup)) {
    where.push('ledger_group = ?');
    params.push(ledgerGroup);
  }

  if (entryType) {
    where.push('entry_type = ?');
    params.push(entryType);
  }

  if (category) {
    where.push('category = ?');
    params.push(category);
  }

  if (status === 'active' || status === 'voided') {
    where.push('status = ?');
    params.push(status);
  }

  if (startDate) {
    where.push('entry_date >= ?');
    params.push(startDate);
  }

  if (endDate) {
    where.push('entry_date <= ?');
    params.push(endDate);
  }

  if (search) {
    where.push('(reference_no LIKE ? OR description LIKE ? OR source_or_payee LIKE ? OR entry_type LIKE ?)');
    const wildcard = `%${search}%`;
    params.push(wildcard, wildcard, wildcard, wildcard);
  }

  let query = 'SELECT * FROM opex_entries';
  if (where.length > 0) {
    query += ` WHERE ${where.join(' AND ')}`;
  }

  query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}, id DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  try {
    const rows = db.all(query, params);
    return res.json({ data: rows.map(toOpexPayload) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/summary', (req, res) => {
  const includeVoided = String(req.query.include_voided || '').toLowerCase() === 'true';
  const startDate = toSafeString(req.query.start_date);
  const endDate = toSafeString(req.query.end_date);

  const where = [];
  const params = [];

  if (!includeVoided) {
    where.push("status = 'active'");
  }

  applyTimeRangeFilters(where, params, 'entry_date', startDate, endDate);

  let query = 'SELECT direction, ledger_group, entry_type, category, amount FROM opex_entries';
  if (where.length > 0) {
    query += ` WHERE ${where.join(' AND ')}`;
  }

  let rows;
  try {
    rows = db.all(query, params);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  loadRevenueRows(startDate, endDate, (revenueErr, revenueRows, flatRateSettings) => {
    if (revenueErr) {
      return res.status(500).json({ error: revenueErr.message });
    }

    const totalIncoming = rows
      .filter((row) => row.direction === 'fund_in')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalExpense = rows
      .filter((row) => row.direction === 'expense')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const investedCapital = rows
      .filter((row) => row.direction === 'fund_in' && row.ledger_group === 'capital')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const capitalOutflow = rows
      .filter((row) => row.direction === 'expense' && row.ledger_group === 'capital')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const financingInflow = rows
      .filter((row) => row.direction === 'fund_in' && row.ledger_group === 'financing')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const financingOutflow = rows
      .filter((row) => row.direction === 'expense' && row.ledger_group === 'financing')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const cogs = rows
      .filter((row) => row.direction === 'expense' && isCogsEntry(row))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const operatingExpense = rows
      .filter((row) => row.direction === 'expense' && row.ledger_group === 'operating' && !isCogsEntry(row))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const assetExpense = rows
      .filter((row) => row.direction === 'expense' && row.ledger_group === 'asset')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const operatingRevenue = (revenueRows || []).reduce((sum, row) => {
      const category = getRevenueCategory(row);
      if (!category) {
        return sum;
      }
      return sum + getNormalizedRevenueAmount(row, flatRateSettings);
    }, 0);

    const grossProfit = operatingRevenue - cogs;
    const operatingProfit = grossProfit - operatingExpense;
    const roiPercent = investedCapital > 0 ? (operatingProfit / investedCapital) * 100 : null;
    const paybackProgressPercent = investedCapital > 0 ? (operatingProfit / investedCapital) * 100 : null;

    const byCategoryMap = new Map();
    const byEntryTypeMap = new Map();
    rows.forEach((row) => {
      const categoryKey = String(row.category || 'Uncategorized').trim() || 'Uncategorized';
      const entryTypeKey = String(row.entry_type || 'other').trim() || 'other';
      const categoryCurrent = byCategoryMap.get(categoryKey) || {
        category: categoryKey,
        incoming: 0,
        expense: 0,
        cogs: 0,
        operating_expense: 0,
      };
      const entryTypeCurrent = byEntryTypeMap.get(entryTypeKey) || {
        entry_type: entryTypeKey,
        ledger_group: row.ledger_group || 'operating',
        incoming: 0,
        expense: 0,
      };
      const amount = Number(row.amount || 0);

      if (row.direction === 'fund_in') {
        categoryCurrent.incoming += amount;
        entryTypeCurrent.incoming += amount;
      } else {
        categoryCurrent.expense += amount;
        entryTypeCurrent.expense += amount;
        if (row.ledger_group === 'operating') {
          if (isCogsEntry(row)) {
            categoryCurrent.cogs += amount;
          } else {
            categoryCurrent.operating_expense += amount;
          }
        }
      }

      byCategoryMap.set(categoryKey, categoryCurrent);
      byEntryTypeMap.set(entryTypeKey, entryTypeCurrent);
    });

    const byCategory = Array.from(byCategoryMap.values())
      .map((entry) => ({
        category: entry.category,
        incoming: roundMoney(entry.incoming),
        expense: roundMoney(entry.expense),
        cogs: roundMoney(entry.cogs),
        operating_expense: roundMoney(entry.operating_expense),
        net_cashflow: roundMoney(entry.incoming - entry.expense),
      }))
      .sort((a, b) => Math.abs(b.net_cashflow) - Math.abs(a.net_cashflow));

    const byEntryType = Array.from(byEntryTypeMap.values())
      .map((entry) => ({
        entry_type: entry.entry_type,
        ledger_group: entry.ledger_group,
        incoming: roundMoney(entry.incoming),
        expense: roundMoney(entry.expense),
        net_cashflow: roundMoney(entry.incoming - entry.expense),
      }))
      .sort((a, b) => Math.abs(b.net_cashflow) - Math.abs(a.net_cashflow));

    return res.json({
      data: {
        total_incoming: roundMoney(totalIncoming),
        total_expense: roundMoney(totalExpense),
        net_cashflow: roundMoney(totalIncoming - totalExpense),
        operating_revenue: roundMoney(operatingRevenue),
        cogs: roundMoney(cogs),
        gross_profit: roundMoney(grossProfit),
        operating_expense: roundMoney(operatingExpense),
        operating_profit: roundMoney(operatingProfit),
        invested_capital: roundMoney(investedCapital),
        capital_outflow: roundMoney(capitalOutflow),
        financing_inflow: roundMoney(financingInflow),
        financing_outflow: roundMoney(financingOutflow),
        asset_expense: roundMoney(assetExpense),
        roi_percent: roiPercent == null ? null : roundMoney(roiPercent),
        payback_progress_percent: paybackProgressPercent == null ? null : roundMoney(paybackProgressPercent),
        by_category: byCategory,
        by_entry_type: byEntryType,
      },
    });
  });
});

router.get('/timeline', (req, res) => {
  const daysRaw = Number.parseInt(req.query.days, 10);
  const includeVoided = String(req.query.include_voided || '').toLowerCase() === 'true';
  const days = Number.isInteger(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 3650) : 30;

  let query = `
    SELECT DATE(entry_date, 'localtime') as date, direction, ledger_group, entry_type, amount
    FROM opex_entries
    WHERE datetime(entry_date, 'localtime') >= datetime('now', 'localtime', '-${days} days')
  `;

  if (!includeVoided) {
    query += " AND status = 'active'";
  }

  query += " ORDER BY date ASC, id ASC";

  let rows;
  try {
    rows = db.all(query);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const revenueStart = new Date();
  revenueStart.setHours(0, 0, 0, 0);
  revenueStart.setDate(revenueStart.getDate() - (days - 1));

  loadRevenueRows(revenueStart.toISOString(), null, (revenueErr, revenueRows, flatRateSettings) => {
    if (revenueErr) {
      return res.status(500).json({ error: revenueErr.message });
    }

    const bucket = new Map();

    rows.forEach((row) => {
      const key = String(row.date || '');
      if (!key) {
        return;
      }

      const current = bucket.get(key) || {
        date: key,
        total_incoming: 0,
        total_expense: 0,
        net_cashflow: 0,
        capital_incoming: 0,
        financing_incoming: 0,
        operating_expense: 0,
        asset_expense: 0,
        operating_revenue: 0,
        operating_profit: 0,
      };
      const amount = Number(row.amount || 0);

      if (row.direction === 'fund_in') {
        current.total_incoming += amount;
        if (row.ledger_group === 'capital') {
          current.capital_incoming += amount;
        }
        if (row.ledger_group === 'financing') {
          current.financing_incoming += amount;
        }
      } else {
        current.total_expense += amount;
        if (row.ledger_group === 'operating') {
          if (isCogsEntry(row)) {
            current.cogs += amount;
          } else {
            current.operating_expense += amount;
          }
        }
        if (row.ledger_group === 'asset') {
          current.asset_expense += amount;
        }
      }

      current.net_cashflow = current.total_incoming - current.total_expense;
      current.gross_profit = current.operating_revenue - current.cogs;
      current.operating_profit = current.gross_profit - current.operating_expense;
      bucket.set(key, current);
    });

    (revenueRows || []).forEach((row) => {
      const key = String(row.date || '');
      if (!key) {
        return;
      }

      const category = getRevenueCategory(row);
      if (!category) {
        return;
      }

      const current = bucket.get(key) || {
        date: key,
        total_incoming: 0,
        total_expense: 0,
        net_cashflow: 0,
        capital_incoming: 0,
        financing_incoming: 0,
        cogs: 0,
        operating_expense: 0,
        asset_expense: 0,
        operating_revenue: 0,
        gross_profit: 0,
        operating_profit: 0,
      };

      current.operating_revenue += getNormalizedRevenueAmount(row, flatRateSettings);
      current.gross_profit = current.operating_revenue - current.cogs;
      current.operating_profit = current.gross_profit - current.operating_expense;
      bucket.set(key, current);
    });

    const data = Array.from(bucket.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => ({
        date: entry.date,
        total_incoming: roundMoney(entry.total_incoming),
        total_expense: roundMoney(entry.total_expense),
        net_cashflow: roundMoney(entry.net_cashflow),
        capital_incoming: roundMoney(entry.capital_incoming),
        financing_incoming: roundMoney(entry.financing_incoming),
        cogs: roundMoney(entry.cogs),
        operating_expense: roundMoney(entry.operating_expense),
        asset_expense: roundMoney(entry.asset_expense),
        operating_revenue: roundMoney(entry.operating_revenue),
        gross_profit: roundMoney(entry.gross_profit),
        operating_profit: roundMoney(entry.operating_profit),
      }));

    return res.json({ data });
  });
});

router.get('/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    const row = db.get('SELECT * FROM opex_entries WHERE id = ?', [id]);
    if (!row) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'not_found',
          message: 'OPEX entry not found',
        },
      });
    }

    return res.json({ data: toOpexPayload(row) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  const { fieldErrors, value } = validateInput(req.body || {});
  if (Object.keys(fieldErrors).length > 0) {
    return sendValidationError(res, fieldErrors);
  }

  try {
    const nowIso = new Date().toISOString();
    const createdBy = toSafeString(req.body?.created_by) || 'Admin';
    const insertInfo = db.run(
      `INSERT INTO opex_entries (
        reference_no, direction, ledger_group, entry_type, category, source_type, source_or_payee, description, amount,
        entry_date, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [
        getPendingReference(),
        value.direction,
        value.ledger_group,
        value.entry_type,
        value.category,
        value.source_type,
        value.source_or_payee,
        value.description,
        value.amount,
        value.entry_date,
        createdBy,
        nowIso,
        nowIso,
      ]
    );

    const fallbackRowId = db.get('SELECT MAX(id) AS max_id FROM opex_entries')?.max_id || 0;
    const newId = Number(insertInfo?.lastID || fallbackRowId || 0);
    const referenceNo = getNextReference(value.entry_date, newId);
    db.run('UPDATE opex_entries SET reference_no = ? WHERE id = ?', [referenceNo, newId]);

    createLog(newId, 'created', createdBy, null, [
      { field_name: 'direction', value_before: null, value_after: value.direction },
      { field_name: 'ledger_group', value_before: null, value_after: value.ledger_group },
      { field_name: 'entry_type', value_before: null, value_after: value.entry_type },
      { field_name: 'category', value_before: null, value_after: value.category },
      { field_name: 'amount', value_before: null, value_after: value.amount },
      { field_name: 'entry_date', value_before: null, value_after: value.entry_date },
    ]);

    const saved = db.get('SELECT * FROM opex_entries WHERE id = ?', [newId]);
    if (!saved) {
      throw new Error(`Failed to load created OPEX entry for id ${newId}`);
    }

    return res.status(201).json({ data: toOpexPayload(saved) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const existing = db.get('SELECT * FROM opex_entries WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({
      status: 'error',
      error: {
        code: 'not_found',
        message: 'OPEX entry not found',
      },
    });
  }

  if (existing.status === 'voided') {
    return res.status(409).json({
      status: 'error',
      error: {
        code: 'conflict',
        message: 'Voided entries cannot be edited',
      },
    });
  }

  const { fieldErrors, value } = validateInput(req.body || {}, { isUpdate: true });
  if (Object.keys(fieldErrors).length > 0) {
    return sendValidationError(res, fieldErrors);
  }

  const next = {
    direction: value.direction == null ? existing.direction : value.direction,
    ledger_group: value.ledger_group == null ? existing.ledger_group : value.ledger_group,
    entry_type: value.entry_type == null ? existing.entry_type : value.entry_type,
    category: value.category == null ? existing.category : value.category,
    source_type: value.source_type == null ? existing.source_type : value.source_type,
    source_or_payee: value.source_or_payee == null ? existing.source_or_payee : value.source_or_payee,
    description: value.description == null ? existing.description : value.description,
    amount: value.amount == null ? Number(existing.amount || 0) : value.amount,
    entry_date: value.entry_date == null ? existing.entry_date : value.entry_date,
  };

  const changedBy = toSafeString(req.body?.changed_by) || 'Admin';
  const reason = toSafeString(req.body?.change_reason) || null;

  const fieldChanges = [];
  ['direction', 'ledger_group', 'entry_type', 'category', 'source_type', 'source_or_payee', 'description', 'amount', 'entry_date'].forEach((key) => {
    const before = existing[key] == null ? null : String(existing[key]);
    const after = next[key] == null ? null : String(next[key]);
    if (before !== after) {
      fieldChanges.push({ field_name: key, value_before: before, value_after: after });
    }
  });

  if (fieldChanges.length === 0) {
    return res.json({ data: toOpexPayload(existing) });
  }

  try {
    db.run(
      `UPDATE opex_entries
       SET direction = ?, ledger_group = ?, entry_type = ?, category = ?, source_type = ?, source_or_payee = ?, description = ?, amount = ?, entry_date = ?, updated_at = ?
       WHERE id = ?`,
      [
        next.direction,
        next.ledger_group,
        next.entry_type,
        next.category,
        next.source_type,
        next.source_or_payee,
        next.description,
        roundMoney(next.amount),
        next.entry_date,
        new Date().toISOString(),
        id,
      ]
    );

    createLog(id, 'updated', changedBy, reason, fieldChanges);

    const updated = db.get('SELECT * FROM opex_entries WHERE id = ?', [id]);
    return res.json({ data: toOpexPayload(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/void', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const reason = toSafeString(req.body?.reason);
  if (!reason) {
    return sendValidationError(res, { reason: ['reason is required to void an entry'] });
  }

  const existing = db.get('SELECT * FROM opex_entries WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({
      status: 'error',
      error: {
        code: 'not_found',
        message: 'OPEX entry not found',
      },
    });
  }

  if (existing.status === 'voided') {
    return res.status(409).json({
      status: 'error',
      error: {
        code: 'conflict',
        message: 'Entry is already voided',
      },
    });
  }

  const voidedBy = toSafeString(req.body?.voided_by) || 'Admin';
  const voidedAt = new Date().toISOString();

  try {
    db.run(
      `UPDATE opex_entries
       SET status = 'voided', void_reason = ?, voided_at = ?, voided_by = ?, updated_at = ?
       WHERE id = ?`,
      [reason, voidedAt, voidedBy, voidedAt, id]
    );

    createLog(id, 'voided', voidedBy, reason, [
      { field_name: 'status', value_before: 'active', value_after: 'voided' },
    ]);

    const updated = db.get('SELECT * FROM opex_entries WHERE id = ?', [id]);
    return res.json({ data: toOpexPayload(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id/logs', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    const rows = db.all(
      `SELECT id, entry_id, event_type, field_name, value_before, value_after, reason, changed_by, created_at
       FROM opex_logs
       WHERE entry_id = ?
       ORDER BY created_at DESC, id DESC`,
      [id]
    );

    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
