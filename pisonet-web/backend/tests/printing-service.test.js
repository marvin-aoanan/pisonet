const test = require('node:test');
const assert = require('node:assert/strict');

const { getConfiguredPrintMode, createReportPrintJob, buildTestPrintDocument } = require('../print-service');

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
