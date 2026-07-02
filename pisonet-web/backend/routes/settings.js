const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { hashPassword, validateAdminPassword, requireAdminAuth } = require('../admin-auth');
const { calculateFlatRateAmountFromMinutes, normalizeFlatRateSettings } = require('../pricing');

const dbFilePath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'pisonet.db');
const coinsOutDir = path.join(__dirname, '..', 'backups', 'coins-out');

function dbAllAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

function dbRunAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function toSlugTimestamp(dateValue) {
  const year = dateValue.getUTCFullYear();
  const month = String(dateValue.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getUTCDate()).padStart(2, '0');
  const hours = String(dateValue.getUTCHours()).padStart(2, '0');
  const minutes = String(dateValue.getUTCMinutes()).padStart(2, '0');
  const seconds = String(dateValue.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}-UTC`;
}

function computeUsageHours(transaction, pesoToSeconds) {
  const amount = Number(transaction.amount || 0);
  const denomination = Number(transaction.denomination || 0);
  const type = transaction.transaction_type;

  if (type === 'open_time') {
    return Math.max(0, denomination / 60);
  }

  if (type === 'admin_add' || type === 'admin_deduct') {
    return amount / 60;
  }

  return (amount * pesoToSeconds) / 3600;
}

function normalizeRevenueAmount(transaction, flatRateSettings) {
  const amount = Number(transaction?.amount || 0);
  const type = transaction?.transaction_type;

  if (type === 'admin_add' || type === 'admin_deduct') {
    const sign = amount < 0 ? -1 : 1;
    const minutes = Math.abs(amount);
    const priced = calculateFlatRateAmountFromMinutes(minutes, flatRateSettings, { minimumCharge: false });
    return sign * priced;
  }

  return amount;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toSafeNumber(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function formatNumber(value, digits = 2) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function readFinalReportOrThrow(reportFile) {
  const normalizedFile = path.basename(String(reportFile || '').trim());

  if (
    !normalizedFile ||
    normalizedFile !== reportFile ||
    !normalizedFile.startsWith('final-report-') ||
    !normalizedFile.endsWith('.json')
  ) {
    const error = new Error('Invalid report file name');
    error.statusCode = 400;
    throw error;
  }

  const reportPath = path.join(coinsOutDir, normalizedFile);
  const resolvedDir = path.resolve(coinsOutDir);
  const resolvedPath = path.resolve(reportPath);
  if (!resolvedPath.startsWith(resolvedDir + path.sep)) {
    const error = new Error('Report file is outside allowed report directory');
    error.statusCode = 400;
    throw error;
  }

  if (!fs.existsSync(resolvedPath)) {
    const error = new Error('Report file not found');
    error.statusCode = 404;
    throw error;
  }

  try {
    const report = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    return { normalizedFile, resolvedPath, report };
  } catch (parseError) {
    const error = new Error('Failed to parse report file');
    error.statusCode = 500;
    throw error;
  }
}

function buildFinalReportHtml(report, reportFile, printMode = false) {
  const totals = report?.totals || {};
  const electricity = totals?.electricity_consumption || {};
  const breakdown = Array.isArray(report?.revenue_breakdown_by_transaction_type)
    ? report.revenue_breakdown_by_transaction_type
    : [];

  const rows = breakdown
    .map((item) => {
      const type = escapeHtml(item.transaction_type || 'unknown');
      const count = Number(item.count || 0).toLocaleString('en-US');
      const amount = formatNumber(item.total_amount || 0, 2);
      return `
        <tr>
          <td>${type}</td>
          <td class="right">${count}</td>
          <td class="right">PHP ${amount}</td>
        </tr>
      `;
    })
    .join('');

  const generatedAt = escapeHtml(report?.generated_at || 'N/A');
  const periodStart = escapeHtml(report?.period?.start || 'N/A');
  const periodEnd = escapeHtml(report?.period?.end || 'N/A');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PisoNet Final Report - ${escapeHtml(reportFile)}</title>
  <style>
    :root {
      --bg: #f4f6f8;
      --text: #1f2937;
      --muted: #6b7280;
      --card: #ffffff;
      --line: #d1d5db;
      --accent: #0f766e;
      --accent-soft: #ccfbf1;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: radial-gradient(circle at top, #e2e8f0 0%, var(--bg) 42%, #eef2f7 100%);
      color: var(--text);
      font: 15px/1.45 "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
    }
    .sheet {
      max-width: 920px;
      margin: 0 auto;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }
    .hero {
      background: linear-gradient(110deg, var(--accent), #0ea5a4);
      color: #fff;
      padding: 22px 24px;
    }
    .hero h1 {
      margin: 0;
      font-size: 1.4rem;
      letter-spacing: 0.2px;
    }
    .hero p {
      margin: 6px 0 0;
      opacity: 0.9;
      font-size: 0.92rem;
    }
    .content {
      padding: 22px 24px 26px;
      display: grid;
      gap: 16px;
    }
    .meta {
      color: var(--muted);
      font-size: 0.92rem;
      display: grid;
      gap: 4px;
    }
    .cards {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      background: #fff;
    }
    .card .label {
      color: var(--muted);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.35px;
    }
    .card .value {
      margin-top: 4px;
      font-size: 1.05rem;
      font-weight: 700;
      color: #111827;
    }
    .section h2 {
      margin: 0 0 8px;
      font-size: 1.02rem;
      color: #0f172a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
    }
    th, td {
      padding: 10px;
      border-bottom: 1px solid var(--line);
      text-align: left;
    }
    th {
      background: var(--accent-soft);
      color: #0f172a;
      font-size: 0.9rem;
      letter-spacing: 0.2px;
    }
    tr:last-child td { border-bottom: none; }
    .right { text-align: right; }
    .empty {
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 12px;
      color: var(--muted);
    }
    @media print {
      body {
        padding: 0;
        background: #fff;
      }
      .sheet {
        box-shadow: none;
        border-radius: 0;
      }
    }
  </style>
</head>
<body>
  <article class="sheet">
    <header class="hero">
      <h1>PisoNet Final Coins Out Report</h1>
      <p>${escapeHtml(reportFile)}</p>
    </header>

    <section class="content">
      <div class="meta">
        <div><strong>Generated:</strong> ${generatedAt}</div>
        <div><strong>Coverage:</strong> ${periodStart} to ${periodEnd}</div>
      </div>

      <div class="cards">
        <div class="card">
          <div class="label">Total Revenue</div>
          <div class="value">PHP ${formatNumber(totals.estimated_total_revenue || 0, 2)}</div>
        </div>
        <div class="card">
          <div class="label">Transaction Count</div>
          <div class="value">${Number(report?.transaction_count || 0).toLocaleString('en-US')}</div>
        </div>
        <div class="card">
          <div class="label">Estimated Usage Hours</div>
          <div class="value">${formatNumber(electricity.estimated_usage_hours || 0, 2)} h</div>
        </div>
        <div class="card">
          <div class="label">Estimated Electricity</div>
          <div class="value">${formatNumber(electricity.estimated_kwh || 0, 2)} kWh</div>
        </div>
        <div class="card">
          <div class="label">Estimated Power Cost</div>
          <div class="value">PHP ${formatNumber(electricity.estimated_cost || 0, 2)}</div>
        </div>
      </div>

      <div class="section">
        <h2>Revenue Breakdown by Transaction Type</h2>
        ${rows ? `
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th class="right">Count</th>
                <th class="right">Amount</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        ` : '<div class="empty">No transaction entries were captured for this period.</div>'}
      </div>
    </section>
  </article>
  ${printMode ? `
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        window.print();
      }, 120);
    });
  </script>
  ` : ''}
</body>
</html>`;
}

function toPdfText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '');
}

function buildSimplePdfBuffer(lines) {
  const pageLineLimit = 44;
  const pages = [];
  for (let i = 0; i < lines.length; i += pageLineLimit) {
    pages.push(lines.slice(i, i + pageLineLimit));
  }

  if (pages.length === 0) {
    pages.push(['PisoNet Final Report']);
  }

  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '';

  let nextId = 3;
  const fontObjectId = nextId;
  objects[fontObjectId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  nextId += 1;

  const pageObjectIds = [];
  for (const pageLines of pages) {
    const yStart = 790;
    const escapedLines = pageLines.map((line) => toPdfText(line));
    const textOps = escapedLines
      .map((line, idx) => {
        if (idx === 0) {
          return `${50} ${yStart} Td (${line}) Tj`;
        }
        return 'T* (' + line + ') Tj';
      })
      .join('\n');
    const stream = `BT\n/F1 11 Tf\n14 TL\n${textOps}\nET`;

    const contentObjectId = nextId;
    objects[contentObjectId] = `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`;
    nextId += 1;

    const pageObjectId = nextId;
    objects[pageObjectId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    pageObjectIds.push(pageObjectId);
    nextId += 1;
  }

  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

function buildFinalReportPdf(report, reportFile) {
  const totals = report?.totals || {};
  const electricity = totals?.electricity_consumption || {};
  const breakdown = Array.isArray(report?.revenue_breakdown_by_transaction_type)
    ? report.revenue_breakdown_by_transaction_type
    : [];

  const lines = [
    'PisoNet Final Coins Out Report',
    `File: ${reportFile}`,
    `Generated: ${report?.generated_at || 'N/A'}`,
    `Coverage: ${report?.period?.start || 'N/A'} to ${report?.period?.end || 'N/A'}`,
    '',
    `Total Revenue: PHP ${formatNumber(toSafeNumber(totals.estimated_total_revenue || 0, 2), 2)}`,
    `Transaction Count: ${Number(report?.transaction_count || 0).toLocaleString('en-US')}`,
    `Estimated Usage Hours: ${formatNumber(toSafeNumber(electricity.estimated_usage_hours || 0, 2), 2)} h`,
    `Estimated kWh: ${formatNumber(toSafeNumber(electricity.estimated_kwh || 0, 2), 2)} kWh`,
    `Estimated Electricity Cost: PHP ${formatNumber(toSafeNumber(electricity.estimated_cost || 0, 2), 2)}`,
    '',
    'Revenue Breakdown by Transaction Type',
    '------------------------------------',
  ];

  if (breakdown.length === 0) {
    lines.push('No transactions captured in this report.');
  } else {
    breakdown.forEach((item, idx) => {
      lines.push(
        `${idx + 1}. ${String(item.transaction_type || 'unknown')} | Count: ${Number(item.count || 0)} | Amount: PHP ${formatNumber(item.total_amount || 0, 2)}`
      );
    });
  }

  return buildSimplePdfBuffer(lines);
}

router.post('/admin/auth', (req, res) => {
  const password = req.body?.password;

  validateAdminPassword(password, (err, valid) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to validate admin password' });
    }

    return res.json({ valid });
  });
});

router.put('/admin/password', (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  validateAdminPassword(currentPassword, (err, valid) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to validate current password' });
    }

    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = hashPassword(newPassword);

    db.run(
      'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?',
      [hashedPassword, new Date().toISOString(), 'admin_password_hash'],
      function(updateErr) {
        if (updateErr) {
          return res.status(500).json({ error: updateErr.message });
        }

        if (this.changes === 0) {
          db.run(
            'INSERT INTO settings (key, value) VALUES (?, ?)',
            ['admin_password_hash', hashedPassword],
            (insertErr) => {
              if (insertErr) {
                return res.status(500).json({ error: insertErr.message });
              }

              return res.json({ message: 'Admin password updated successfully' });
            }
          );
          return;
        }

        return res.json({ message: 'Admin password updated successfully' });
      }
    );
  });
});

router.use(requireAdminAuth);

// POST Coins Out
// 1) Generate final report
// 2) Backup database file
// 3) Clear operational data for a fresh cycle
router.post('/admin/coins-out', async (req, res) => {
  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const slug = toSlugTimestamp(now);

    const [transactions, settingsRows] = await Promise.all([
      dbAllAsync('SELECT unit_id, amount, denomination, timestamp, transaction_type FROM transactions ORDER BY timestamp ASC'),
      dbAllAsync("SELECT key, value FROM settings WHERE key IN ('peso_to_seconds', 'estimated_pc_wattage', 'estimated_kwh_rate', 'flat_rate_tier1_minutes', 'flat_rate_tier1_price', 'flat_rate_tier2_minutes', 'flat_rate_tier2_price', 'flat_rate_tier3_minutes', 'flat_rate_tier3_price')")
    ]);

    const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
    const pesoToSeconds = Number(settings.peso_to_seconds || 60);
    const wattage = Number(settings.estimated_pc_wattage || 200);
    const ratePerKwh = Number(settings.estimated_kwh_rate || 12);
    const flatRateSettings = normalizeFlatRateSettings(settings);

    const totalRevenue = transactions.reduce((sum, tx) => sum + normalizeRevenueAmount(tx, flatRateSettings), 0);
    const totalUsageHours = transactions.reduce((sum, tx) => sum + computeUsageHours(tx, pesoToSeconds), 0);
    const estimatedKwh = (totalUsageHours * wattage) / 1000;
    const estimatedCost = estimatedKwh * ratePerKwh;

    const breakdownMap = new Map();
    for (const tx of transactions) {
      const type = tx.transaction_type || 'unknown';
      const entry = breakdownMap.get(type) || { transaction_type: type, count: 0, total_amount: 0 };
      entry.count += 1;
      entry.total_amount += normalizeRevenueAmount(tx, flatRateSettings);
      breakdownMap.set(type, entry);
    }

    const revenueBreakdown = Array.from(breakdownMap.values())
      .map((entry) => ({
        ...entry,
        total_amount: Number(entry.total_amount.toFixed(4)),
      }))
      .sort((a, b) => b.total_amount - a.total_amount);

    const finalReport = {
      generated_at: nowIso,
      totals: {
        estimated_total_revenue: Number(totalRevenue.toFixed(4)),
        electricity_consumption: {
          estimated_usage_hours: Number(totalUsageHours.toFixed(4)),
          estimated_kwh: Number(estimatedKwh.toFixed(4)),
          estimated_cost: Number(estimatedCost.toFixed(4)),
          estimated_pc_wattage: wattage,
          estimated_kwh_rate: ratePerKwh,
        },
      },
      revenue_breakdown_by_transaction_type: revenueBreakdown,
      transaction_count: transactions.length,
      period: {
        start: transactions[0]?.timestamp || null,
        end: transactions[transactions.length - 1]?.timestamp || null,
      },
    };

    fs.mkdirSync(coinsOutDir, { recursive: true });

    const reportFileName = `final-report-${slug}.json`;
    const reportFilePath = path.join(coinsOutDir, reportFileName);
    fs.writeFileSync(reportFilePath, JSON.stringify(finalReport, null, 2), 'utf8');

    // Allow pending sql.js autosave timer to flush before copying file.
    await new Promise((resolve) => setTimeout(resolve, 2300));

    const backupFileName = `backup-${slug}.db`;
    const backupFilePath = path.join(coinsOutDir, backupFileName);
    fs.copyFileSync(dbFilePath, backupFilePath);

    // Clear operational data and reset units for fresh DB state while keeping settings/users.
    await dbRunAsync('DELETE FROM transactions');
    await dbRunAsync('DELETE FROM sessions');
    await dbRunAsync('DELETE FROM hardware_log');
    await dbRunAsync(
      "UPDATE units SET status = 'Idle', remaining_seconds = 0, total_revenue = 0, timer_paused = 0, open_time = 0, open_time_start = NULL, open_time_paused = 0, open_time_paused_at = NULL, open_time_elapsed_base_seconds = 0, last_status_update = ?",
      [nowIso]
    );

    const resetUnits = await dbAllAsync('SELECT id, status, remaining_seconds, total_revenue, timer_paused, open_time, open_time_start, open_time_paused, open_time_paused_at, open_time_elapsed_base_seconds FROM units ORDER BY id ASC');
    if (global.broadcast) {
      resetUnits.forEach((unit) => {
        global.broadcast({
          type: 'UNIT_UPDATE',
          unit: {
            id: unit.id,
            status: unit.status,
            remaining_seconds: unit.remaining_seconds,
            total_revenue: unit.total_revenue,
            timer_paused: unit.timer_paused,
            open_time: unit.open_time,
            open_time_start: unit.open_time_start,
            open_time_paused: unit.open_time_paused,
            open_time_paused_at: unit.open_time_paused_at,
            open_time_elapsed_base_seconds: unit.open_time_elapsed_base_seconds,
            open_time_elapsed: 0,
            open_time_amount: 0,
          }
        });
      });
    }

    res.json({
      message: 'Coins out completed successfully',
      report: finalReport,
      files: {
        report_file: reportFileName,
        report_path: reportFilePath,
        backup_file: backupFileName,
        backup_path: backupFilePath,
      },
      db_reset: true,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Coins out failed' });
  }
});

// GET list of generated final report files
router.get('/admin/final-reports', (req, res) => {
  try {
    fs.mkdirSync(coinsOutDir, { recursive: true });
    const entries = fs.readdirSync(coinsOutDir, { withFileTypes: true });

    const reports = entries
      .filter((entry) => entry.isFile() && entry.name.startsWith('final-report-') && entry.name.endsWith('.json'))
      .map((entry) => {
        const fullPath = path.join(coinsOutDir, entry.name);
        const stats = fs.statSync(fullPath);
        return {
          file: entry.name,
          size_bytes: stats.size,
          modified_at: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());

    return res.json({ reports });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list final reports' });
  }
});

// GET final report rendered as HTML for easy viewing/printing
router.get('/admin/final-reports/:reportFile/html', (req, res) => {
  try {
    const { normalizedFile, report } = readFinalReportOrThrow(req.params.reportFile);
    const printMode = String(req.query?.print || '0') === '1';
    const html = buildFinalReportHtml(report, normalizedFile, printMode);
    return res.type('html').send(html);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to render final report HTML' });
  }
});

// GET final report as downloadable PDF
router.get('/admin/final-reports/:reportFile/pdf', (req, res) => {
  try {
    const { normalizedFile, report } = readFinalReportOrThrow(req.params.reportFile);
    const pdfBuffer = buildFinalReportPdf(report, normalizedFile);
    const pdfName = normalizedFile.replace(/\.json$/i, '.pdf');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to generate final report PDF' });
  }
});

// POST restore a DB backup safely
// Body: { backup_file: 'pisonet-backup-YYYY-MM-DDTHH-mm-ss-sssZ.db' }
router.post('/admin/restore-backup', async (req, res) => {
  try {
    const backupFile = String(req.body?.backup_file || '').trim();
    if (!backupFile) {
      return res.status(400).json({ error: 'backup_file is required' });
    }

    const normalizedFile = path.basename(backupFile);
    if (normalizedFile !== backupFile || !normalizedFile.endsWith('.db')) {
      return res.status(400).json({ error: 'Invalid backup_file name' });
    }

    const sourcePath = path.join(coinsOutDir, normalizedFile);
    const resolvedCoinsOutDir = path.resolve(coinsOutDir);
    const resolvedSourcePath = path.resolve(sourcePath);
    if (!resolvedSourcePath.startsWith(resolvedCoinsOutDir + path.sep)) {
      return res.status(400).json({ error: 'backup_file is outside allowed backup directory' });
    }

    if (!fs.existsSync(resolvedSourcePath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    fs.mkdirSync(coinsOutDir, { recursive: true });

    let preRestoreBackupFile = null;

    if (!normalizedFile.startsWith('pre-restore-')) {
      const now = new Date();
      const slug = toSlugTimestamp(now);
      preRestoreBackupFile = `pre-restore-${slug}.db`;
      const preRestoreBackupPath = path.join(coinsOutDir, preRestoreBackupFile);

      // Keep a rollback point before restoring a regular backup.
      db.snapshotToFile(preRestoreBackupPath);
    }

    // Restore runtime/in-memory DB, then persist to the default DB path.
    db.restoreFromFile(resolvedSourcePath);

    const restoredUnits = await dbAllAsync('SELECT id, status, remaining_seconds, total_revenue, timer_paused, open_time, open_time_start, open_time_paused, open_time_paused_at, open_time_elapsed_base_seconds FROM units ORDER BY id ASC');
    if (global.broadcast) {
      restoredUnits.forEach((unit) => {
        global.broadcast({
          type: 'UNIT_UPDATE',
          unit: {
            id: unit.id,
            status: unit.status,
            remaining_seconds: unit.remaining_seconds,
            total_revenue: unit.total_revenue,
            timer_paused: unit.timer_paused,
            open_time: unit.open_time,
            open_time_start: unit.open_time_start,
            open_time_paused: unit.open_time_paused,
            open_time_paused_at: unit.open_time_paused_at,
            open_time_elapsed_base_seconds: unit.open_time_elapsed_base_seconds,
          }
        });
      });
    }

    return res.json({
      message: 'Backup restored successfully',
      restored_backup_file: normalizedFile,
      pre_restore_backup_file: preRestoreBackupFile,
      skipped_pre_restore_snapshot: normalizedFile.startsWith('pre-restore-'),
      restored_units: restoredUnits.length,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to restore backup' });
  }
});

// GET available backup files for restore
router.get('/admin/backups', (req, res) => {
  try {
    fs.mkdirSync(coinsOutDir, { recursive: true });
    const entries = fs.readdirSync(coinsOutDir, { withFileTypes: true });

    const backups = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.db'))
      .map((entry) => {
        const fullPath = path.join(coinsOutDir, entry.name);
        const stats = fs.statSync(fullPath);
        return {
          file: entry.name,
          size_bytes: stats.size,
          modified_at: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());

    return res.json({ backups });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list backups' });
  }
});

// GET all settings
router.get('/', (req, res) => {
  db.all('SELECT * FROM settings', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Convert array to object for easier access
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });

    delete settings.admin_password_hash;
    
    res.json(settings);
  });
});

// GET single setting
router.get('/:key', (req, res) => {
  const key = req.params.key;

  if (key === 'admin_password_hash') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  db.get('SELECT * FROM settings WHERE key = ?', [key], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json(row);
  });
});

// PUT update setting
router.put('/:key', (req, res) => {
  const { value } = req.body;
  const key = req.params.key;

  if (key === 'admin_password_hash') {
    return res.status(403).json({ error: 'Use /api/settings/admin/password to update admin password' });
  }

  if (!value) {
    return res.status(400).json({ error: 'Value is required' });
  }

  db.run(
    'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?',
    [value, new Date().toISOString(), key],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        // Setting doesn't exist, insert it
        db.run(
          'INSERT INTO settings (key, value) VALUES (?, ?)',
          [key, value],
          (err) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Setting created', key, value });
          }
        );
      } else {
        res.json({ message: 'Setting updated', key, value });
      }
    }
  );
});

// PUT bulk update settings
router.put('/', (req, res) => {
  const settings = req.body;
  const timestamp = new Date().toISOString();
  let completed = 0;
  let errors = [];

  if (Object.prototype.hasOwnProperty.call(settings, 'admin_password_hash')) {
    return res.status(403).json({ error: 'Use /api/settings/admin/password to update admin password' });
  }

  Object.entries(settings).forEach(([key, value]) => {
    db.run(
      'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?',
      [value, timestamp, key],
      function(err) {
        if (err) {
          errors.push({ key, error: err.message });
        } else if (this.changes === 0) {
          // Insert if doesn't exist
          db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value], (err) => {
            if (err) errors.push({ key, error: err.message });
            completed++;
          });
        } else {
          completed++;
        }
      }
    );
  });

  setTimeout(() => {
    if (errors.length > 0) {
      res.status(400).json({ message: 'Some settings updated with errors', errors });
    } else {
      res.json({ message: 'All settings updated', count: Object.keys(settings).length });
    }
  }, 100);
});

module.exports = router;
