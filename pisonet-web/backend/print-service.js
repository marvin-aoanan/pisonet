const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function normalizePrintSettings(settings = {}) {
  const mode = String(settings.PRINT_MODE || settings.print_mode || '').trim().toLowerCase();
  const printerName = String(settings.PRINT_PRINTER_NAME || settings.print_printer_name || '').trim();

  return {
    mode,
    printer_name: printerName,
  };
}

function getConfiguredPrintMode(env = process.env) {
  const { mode, printer_name } = normalizePrintSettings(env);

  if (mode === 'direct' || mode === 'printer' || mode === 'thermal') {
    return printer_name ? 'direct' : 'browser';
  }

  if (mode === 'browser') {
    return 'browser';
  }

  return printer_name ? 'direct' : 'browser';
}

function getPrinterCommand(filePath, printerName) {
  const normalizedPrinter = String(printerName || '').trim();
  if (!normalizedPrinter) {
    return null;
  }

  const isWindows = process.platform === 'win32';
  const escapedPath = filePath.replace(/'/g, "''");

  if (isWindows) {
    return `powershell -NoProfile -Command "Start-Process -FilePath '${escapedPath}' -Verb PrintTo '\\${normalizedPrinter}'"`;
  }

  return `lpr -P "${normalizedPrinter}" "${filePath}"`;
}

function printFileToDirectPrinter(filePath, printerName) {
  const command = getPrinterCommand(filePath, printerName);
  if (!command) {
    return {
      status: 'skipped',
      reason: 'printer_not_configured',
      printer_name: printerName || null,
    };
  }

  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    timeout: 20000,
  });

  if (result.error) {
    return {
      status: 'failed',
      reason: result.error.message,
      printer_name: printerName,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  }

  return {
    status: result.status === 0 ? 'printed' : 'failed',
    reason: result.status === 0 ? 'print_command_executed' : 'print_command_failed',
    printer_name: printerName,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exit_code: result.status,
    command,
  };
}

function createReportPrintJob({ reportFile, report, baseUrl, mode = 'browser' }) {
  const safeReportFile = String(reportFile || '').trim();
  if (!safeReportFile) {
    throw new Error('reportFile is required');
  }

  const urlRoot = String(baseUrl || '').replace(/\/$/, '');

  return {
    id: `print-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: 'report',
    report_file: safeReportFile,
    mode,
    status: 'ready',
    generated_at: report?.generated_at || new Date().toISOString(),
    html_url: `${urlRoot}/admin/final-reports/${encodeURIComponent(safeReportFile)}/html`,
    pdf_url: `${urlRoot}/admin/final-reports/${encodeURIComponent(safeReportFile)}/pdf`,
    summary: {
      revenue: Number(report?.totals?.estimated_total_revenue || 0),
      transaction_count: Number(report?.transaction_count || 0),
    },
  };
}

function buildTestPrintDocument({ printerName = '', message = 'Test print from Pisonet' } = {}) {
  const safePrinter = String(printerName || '').trim() || 'Not configured';
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Test Print</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
      .card { border: 1px solid #222; padding: 20px; max-width: 520px; }
      h1 { margin-top: 0; }
      .meta { margin-top: 16px; line-height: 1.6; }
      @media print { body { margin: 0; } }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Printer Test</h1>
      <p>${message}</p>
      <div class="meta">
        <div>Printer: ${safePrinter}</div>
        <div>Generated: ${new Date().toISOString()}</div>
      </div>
    </div>
  </body>
</html>`;
}

function sendReportToDirectPrinter({ reportFile, report, htmlContent, printerName, outputDirectory }) {
  if (!printerName) {
    return {
      status: 'skipped',
      reason: 'printer_not_configured',
    };
  }

  const targetDir = outputDirectory || path.join(__dirname, '..', 'tmp', 'print-jobs');
  fs.mkdirSync(targetDir, { recursive: true });

  const fileName = String(reportFile || 'report').replace(/\.json$/i, '.html');
  const outputPath = path.join(targetDir, fileName);
  fs.writeFileSync(outputPath, htmlContent || '', 'utf8');

  const printResult = printFileToDirectPrinter(outputPath, printerName);
  return {
    ...printResult,
    file_path: outputPath,
    file_name: fileName,
    generated_at: report?.generated_at || new Date().toISOString(),
  };
}

module.exports = {
  getConfiguredPrintMode,
  normalizePrintSettings,
  createReportPrintJob,
  sendReportToDirectPrinter,
  printFileToDirectPrinter,
  buildTestPrintDocument,
};
