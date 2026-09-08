const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { getConfiguredPrintMode, createReportPrintJob, buildTestPrintDocument } = require('../print-service');
const { calculatePosSaleSubtotal, normalizePosTransactionLedgerEntry, normalizePosReportReturnAmount, normalizePosReportInternalUsageAmount } = require('../routes/pos-sales');

function buildTempDbPath() {
  const target = path.join(__dirname, 'tmp-pos-sales-test.db');
  if (fs.existsSync(target)) {
    fs.rmSync(target, { force: true });
  }
  return target;
}

test('getConfiguredPrintMode falls back to browser when no printer is configured', () => {
  const mode = getConfiguredPrintMode({ PRINT_MODE: '', PRINT_PRINTER_NAME: '' });
  assert.equal(mode, 'browser');
});

test('getConfiguredPrintMode selects direct mode when a printer is configured', () => {
  const mode = getConfiguredPrintMode({ PRINT_MODE: 'direct', PRINT_PRINTER_NAME: 'Test Printer' });
  assert.equal(mode, 'direct');
});

test('buildTestPrintDocument creates a printable HTML page for direct printer tests', () => {
  const html = buildTestPrintDocument({ printerName: 'Test Printer' });
  assert.match(html, /Test Printer/i);
  assert.match(html, /print/i);
  assert.match(html, /<html/i);
});

test('createReportPrintJob builds a usable report job payload', () => {
  const payload = createReportPrintJob({
    reportFile: 'final-report-2026-08-28_12-00-00-UTC.json',
    report: {
      generated_at: '2026-08-28T12:00:00.000Z',
      totals: { estimated_total_revenue: 123.45 },
      transaction_count: 4,
    },
    baseUrl: 'http://localhost:5001/api/settings',
    mode: 'browser',
  });

  assert.equal(payload.type, 'report');
  assert.equal(payload.mode, 'browser');
  assert.equal(payload.report_file, 'final-report-2026-08-28_12-00-00-UTC.json');
  assert.match(payload.html_url, /html$/);
  assert.match(payload.pdf_url, /pdf$/);
  assert.equal(payload.status, 'ready');
});

test('POS return transactions can store negative line totals and subtotal values', async () => {
  const tempDbPath = buildTempDbPath();
  const previousDbPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = tempDbPath;
  delete require.cache[require.resolve('../database')];

  try {
    const db = require('../database');
    await db.ready;

    db.run("INSERT OR IGNORE INTO products (id, sku, name, quantity_in_stock, base_price, markup_price, final_price, is_active) VALUES (1, 'SKU-1', 'Test Product', 5, 10, 2, 12, 1)");
    assert.doesNotThrow(() => {
      db.run(
        'INSERT INTO product_sales (reference_no, subtotal, payment_method, sold_by, sold_at) VALUES (?, ?, ?, ?, ?)',
        ['POS-RETURN-1', -120, 'cash', 'Tester', '2026-09-05T12:00:00.000Z']
      );
      db.run(
        'INSERT INTO product_sale_items (sale_id, product_id, quantity, unit_base_price, unit_markup_price, unit_final_price, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [1, 1, 10, 10, 2, 12, -120]
      );
    });

    const sale = db.get('SELECT subtotal FROM product_sales WHERE reference_no = ?', ['POS-RETURN-1']);
    const item = db.get('SELECT line_total FROM product_sale_items WHERE sale_id = ?', [1]);
    assert.equal(Number(sale.subtotal), -120);
    assert.equal(Number(item.line_total), -120);
  } finally {
    delete require.cache[require.resolve('../database')];
    if (previousDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDbPath;
    }
    if (fs.existsSync(tempDbPath)) {
      fs.rmSync(tempDbPath, { force: true });
    }
  }
});

test('POS return ledger entries are stored as negative product sales, not rental time', () => {
  const subtotal = calculatePosSaleSubtotal({
    transactionType: 'return_invalid',
    baseSubtotal: -120,
    amountOverride: null,
  });

  const entry = normalizePosTransactionLedgerEntry({
    transactionType: 'return_invalid',
    totalQuantity: 8,
    transactionAmount: subtotal,
    description: 'POS Return/Invalid: Test Product, 8',
  });

  assert.equal(subtotal, -120);
  assert.equal(entry.transaction_type, 'product_order');
  assert.equal(entry.amount, -120);
  assert.equal(entry.denomination, 8);
  assert.match(entry.description, /POS Return\/Invalid/i);
});

test('report rollups count legacy positive return values and internal usage without relying on sign only', () => {
  const positiveReturnRow = {
    amount: 120,
    transaction_type: 'product_order',
    description: 'POS Return/Invalid: Test Product, 8',
  };
  const positiveInternalUsageRow = {
    amount: 45,
    transaction_type: 'internal_usage',
    description: 'POS Internal Usage: Test Product',
  };

  assert.equal(normalizePosReportReturnAmount(positiveReturnRow), 120);
  assert.equal(normalizePosReportInternalUsageAmount(positiveInternalUsageRow), 45);
  assert.equal(normalizePosReportReturnAmount({ amount: -120, transaction_type: 'product_order', description: 'POS Sale: Test Product' }), 120);
  assert.equal(normalizePosReportInternalUsageAmount({ amount: -45, transaction_type: 'internal_usage', description: 'POS Internal Usage: Test Product' }), 45);
});
