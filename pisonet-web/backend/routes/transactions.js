const express = require('express');
const router = express.Router();
const db = require('../database');
const { calculateFlatRateAmountFromMinutes, loadFlatRateSettings } = require('../pricing');

// Print service definitions
const PRINT_SERVICES = {
  print_document_short_bw: { label: 'Document Short (A4/Letter) - B&W', settingKey: 'document_short_bw', defaultPrice: 3 },
  print_document_short_color: { label: 'Document Short (A4/Letter) - Color', settingKey: 'document_short_color', defaultPrice: 5 },
  print_document_long_bw: { label: 'Document Long (Legal) - B&W', settingKey: 'document_long_bw', defaultPrice: 5 },
  print_document_long_color: { label: 'Document Long (Legal) - Color', settingKey: 'document_long_color', defaultPrice: 7 },
  print_photo_short_bw: { label: 'Photo Short (A4/Letter) - B&W', settingKey: 'photo_short_bw', defaultPrice: 5 },
  print_photo_short_color: { label: 'Photo Short (A4/Letter) - Color', settingKey: 'photo_short_color', defaultPrice: 10 },
  print_photo_long_bw: { label: 'Photo Long (Legal) - B&W', settingKey: 'photo_long_bw', defaultPrice: 10 },
  print_photo_long_color: { label: 'Photo Long (Legal) - Color', settingKey: 'photo_long_color', defaultPrice: 15 },
  print_photo_short_special: { label: 'Photo Short (A4/Letter) - Special Paper', settingKey: 'photo_short_special', defaultPrice: 20 },
  print_photo_long_special: { label: 'Photo Long (Legal) - Special Paper', settingKey: 'photo_long_special', defaultPrice: 30 },
};

function loadPrintServicePrices(callback) {
  db.get('SELECT value FROM settings WHERE key = ?', ['print_service_prices'], (err, row) => {
    if (err) {
      return callback(err);
    }

    let configuredPrices = {};
    if (row && row.value) {
      try {
        configuredPrices = JSON.parse(row.value) || {};
      } catch (parseError) {
        configuredPrices = {};
      }
    }

    const pricesByServiceType = {};
    Object.entries(PRINT_SERVICES).forEach(([serviceType, metadata]) => {
      const rawValue = configuredPrices[metadata.settingKey];
      const numericValue = Number(rawValue);
      const fallbackPrice = Number(metadata.defaultPrice || 0);
      const resolvedPrice = Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : fallbackPrice;
      pricesByServiceType[serviceType] = resolvedPrice;
    });

    return callback(null, pricesByServiceType);
  });
}

function getElectricityUsageHours(row, pesoToSeconds) {
  const amount = Number(row?.amount || 0);
  const denomination = Number(row?.denomination || 0);
  const type = row?.transaction_type;

  if (type === 'open_time') {
    return Math.max(0, denomination / 60);
  }

  if (type === 'admin_add' || type === 'admin_deduct') {
    return amount / 60;
  }

  return (amount * pesoToSeconds) / 3600;
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

function getElectricityMetrics(row, pesoToSeconds, wattage, ratePerKwh) {
  const usageHours = getElectricityUsageHours(row, pesoToSeconds);
  const estimatedKwh = (usageHours * wattage) / 1000;
  const estimatedCost = estimatedKwh * ratePerKwh;

  return {
    usageHours,
    estimatedKwh,
    estimatedCost,
  };
}

function loadElectricitySettings(callback) {
  loadFlatRateSettings(db, (flatRateErr, flatRateSettings) => {
    if (flatRateErr) {
      return callback(flatRateErr);
    }

    db.all(
      `SELECT key, value FROM settings WHERE key IN ('peso_to_seconds', 'estimated_pc_wattage', 'estimated_kwh_rate')`,
      [],
      (settingsErr, settingRows) => {
        if (settingsErr) {
          return callback(settingsErr);
        }

        const settings = Object.fromEntries((settingRows || []).map((row) => [row.key, row.value]));
        return callback(null, {
          pesoToSeconds: Number(settings.peso_to_seconds || 60),
          wattage: Number(settings.estimated_pc_wattage || 200),
          ratePerKwh: Number(settings.estimated_kwh_rate || 12),
          flatRateSettings,
        });
      }
    );
  });
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfLocalWeek(date) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value;
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

// GET all transactions with pagination
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const unitId = req.query.unit_id;
  
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const params = [];

  if (unitId) {
    query += ' AND unit_id = ?';
    params.push(unitId);
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// GET total revenue
router.get('/revenue/total', (req, res) => {
  loadElectricitySettings((settingsErr, { flatRateSettings } = {}) => {
    if (settingsErr) {
      return res.status(500).json({ error: settingsErr.message });
    }

    db.all('SELECT amount, transaction_type FROM transactions', [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const totalRevenue = (rows || []).reduce((sum, row) => {
        return sum + getNormalizedRevenueAmount(row, flatRateSettings);
      }, 0);

      res.json({ total_revenue: Number(totalRevenue.toFixed(4)) });
    });
  });
});

// GET revenue by unit
router.get('/revenue/by-unit', (req, res) => {
  loadElectricitySettings((settingsErr, { pesoToSeconds, flatRateSettings } = {}) => {
    if (settingsErr) {
      return res.status(500).json({ error: settingsErr.message });
    }

    db.all(`
      SELECT 
        u.id,
        u.name,
        t.amount,
        t.denomination,
        t.transaction_type,
        t.id as transaction_id
      FROM units u
      LEFT JOIN transactions t ON u.id = t.unit_id
      ORDER BY u.id ASC
    `, [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const unitMap = new Map();

      for (const row of rows) {
        const existing = unitMap.get(row.id) || {
          id: row.id,
          name: row.name,
          revenue: 0,
          usage_hours: 0,
          transaction_count: 0,
        };

        if (row.transaction_id) {
          existing.revenue += getNormalizedRevenueAmount(row, flatRateSettings);
          existing.usage_hours += getElectricityUsageHours(row, pesoToSeconds);
          existing.transaction_count += 1;
        }

        unitMap.set(row.id, existing);
      }

      const result = Array.from(unitMap.values())
        .map((row) => ({
          ...row,
          revenue: Number(row.revenue.toFixed(4)),
          usage_hours: Number(row.usage_hours.toFixed(4)),
        }))
        .sort((a, b) => b.revenue - a.revenue);

      res.json(result);
    });
  });
});

// GET revenue over time (daily)
router.get('/revenue/daily', (req, res) => {
  const days = parseInt(req.query.days) || 30;

  loadElectricitySettings((settingsErr, { pesoToSeconds, flatRateSettings } = {}) => {
    if (settingsErr) {
      return res.status(500).json({ error: settingsErr.message });
    }

    db.all(`
      SELECT 
        DATE(timestamp, 'localtime') as date,
        amount,
        denomination,
        transaction_type
      FROM transactions
      WHERE datetime(timestamp, 'localtime') >= datetime('now', 'localtime', '-${days} days')
      ORDER BY date DESC
    `, [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const dailyMap = new Map();

      for (const row of rows) {
        const existing = dailyMap.get(row.date) || {
          date: row.date,
          daily_revenue: 0,
          daily_hours: 0,
          transaction_count: 0,
        };

        existing.daily_revenue += getNormalizedRevenueAmount(row, flatRateSettings);
        existing.daily_hours += getElectricityUsageHours(row, pesoToSeconds);
        existing.transaction_count += 1;
        dailyMap.set(row.date, existing);
      }

      const result = Array.from(dailyMap.values())
        .map((row) => ({
          ...row,
          daily_revenue: Number(row.daily_revenue.toFixed(4)),
          daily_hours: Number(row.daily_hours.toFixed(4)),
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      res.json(result);
    });
  });
});

// GET revenue breakdown over time by category for charting
router.get('/revenue/daily-breakdown', (req, res) => {
  const days = Number.parseInt(req.query.days, 10) || 365;

  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    return res.status(400).json({
      status: 'error',
      error: {
        code: 'invalid_days',
        message: 'days must be an integer between 1 and 3650',
      },
    });
  }

  loadElectricitySettings((settingsErr, { flatRateSettings } = {}) => {
    if (settingsErr) {
      return res.status(500).json({ error: settingsErr.message });
    }

    const sinceCutoff = new Date();
    sinceCutoff.setUTCDate(sinceCutoff.getUTCDate() - (days - 1));
    sinceCutoff.setUTCHours(0, 0, 0, 0);
    const sinceIso = sinceCutoff.toISOString();

    db.all(
      `
        SELECT
          DATE(timestamp, 'localtime') AS date,
          amount,
          denomination,
          transaction_type,
          unit_id
        FROM transactions
        WHERE timestamp >= ?
        ORDER BY timestamp ASC
      `,
      [sinceIso],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const buckets = new Map();

        (rows || []).forEach((row) => {
          const category = getRevenueCategory(row);
          if (!category) {
            return;
          }

          const rowDate = String(row.date || '').slice(0, 10);
          if (!rowDate) {
            return;
          }

          const existing = buckets.get(rowDate) || {
            date: rowDate,
            pc_rental_sales: 0,
            print_sales: 0,
            store_sales: 0,
          };

          const revenue = getNormalizedRevenueAmount(row, flatRateSettings);
          existing[category] += revenue;
          buckets.set(rowDate, existing);
        });

        const result = Array.from(buckets.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((entry) => ({
            date: entry.date,
            pc_rental_sales: Number(entry.pc_rental_sales.toFixed(4)),
            print_sales: Number(entry.print_sales.toFixed(4)),
            store_sales: Number(entry.store_sales.toFixed(4)),
          }));

        return res.json({ status: 'success', data: result, meta: { days, since: sinceIso } });
      }
    );
  });
});

// GET revenue summary for dashboard cards
router.get('/revenue/summary', (req, res) => {
  loadElectricitySettings((settingsErr, { flatRateSettings } = {}) => {
    if (settingsErr) {
      return res.status(500).json({ error: settingsErr.message });
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const weekStart = startOfLocalWeek(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);

    const effectiveWeekStart = new Date(Math.max(weekStart.getTime(), monthStart.getTime()));

    const earliestStart = new Date(Math.min(yesterday.getTime(), effectiveWeekStart.getTime(), monthStart.getTime()));
    const earliestStartIso = earliestStart.toISOString();

    db.all(
      `
        SELECT
          DATE(timestamp, 'localtime') AS date,
          amount,
          denomination,
          transaction_type,
          unit_id
        FROM transactions
        WHERE timestamp >= ?
        ORDER BY date ASC
      `,
      [earliestStartIso],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const todayKey = getLocalDateKey(now);
        const yesterdayKey = getLocalDateKey(yesterday);
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const weekStartKey = getLocalDateKey(effectiveWeekStart);

        const summary = {
          yesterday: { pc_rental_sales: 0, print_sales: 0, store_sales: 0 },
          today: { pc_rental_sales: 0, print_sales: 0, store_sales: 0 },
          week: { pc_rental_sales: 0, print_sales: 0, store_sales: 0 },
          month: { pc_rental_sales: 0, print_sales: 0, store_sales: 0 },
        };

        (rows || []).forEach((row) => {
          if (!row?.date) {
            return;
          }

          const category = getRevenueCategory(row);
          if (!category) {
            return;
          }

          const revenue = getNormalizedRevenueAmount(row, flatRateSettings);
          const rowDate = String(row.date).slice(0, 10);

          if (rowDate === yesterdayKey) {
            summary.yesterday[category] += revenue;
          }

          if (rowDate === todayKey) {
            summary.today[category] += revenue;
          }

          if (rowDate >= weekStartKey && rowDate <= todayKey) {
            summary.week[category] += revenue;
          }

          if (rowDate.startsWith(monthKey)) {
            summary.month[category] += revenue;
          }
        });

        return res.json({
          status: 'success',
          data: {
            yesterday: {
              pc_rental_sales: Number(summary.yesterday.pc_rental_sales.toFixed(4)),
              print_sales: Number(summary.yesterday.print_sales.toFixed(4)),
              store_sales: Number(summary.yesterday.store_sales.toFixed(4)),
            },
            today: {
              pc_rental_sales: Number(summary.today.pc_rental_sales.toFixed(4)),
              print_sales: Number(summary.today.print_sales.toFixed(4)),
              store_sales: Number(summary.today.store_sales.toFixed(4)),
            },
            week: {
              pc_rental_sales: Number(summary.week.pc_rental_sales.toFixed(4)),
              print_sales: Number(summary.week.print_sales.toFixed(4)),
              store_sales: Number(summary.week.store_sales.toFixed(4)),
            },
            month: {
              pc_rental_sales: Number(summary.month.pc_rental_sales.toFixed(4)),
              print_sales: Number(summary.month.print_sales.toFixed(4)),
              store_sales: Number(summary.month.store_sales.toFixed(4)),
            },
          },
        });
      }
    );
  });
});

// GET monthly revenue breakdown for yearly stacked chart
router.get('/revenue/monthly-breakdown', (req, res) => {
  const requestedYear = Number.parseInt(req.query.year, 10);
  const now = new Date();
  const year = Number.isInteger(requestedYear) ? requestedYear : now.getFullYear();

  loadElectricitySettings((settingsErr, { flatRateSettings } = {}) => {
    if (settingsErr) {
      return res.status(500).json({ error: settingsErr.message });
    }

    db.all(
      `
        SELECT
          strftime('%Y-%m', timestamp, 'localtime') AS month_key,
          amount,
          denomination,
          transaction_type,
          unit_id
        FROM transactions
        WHERE strftime('%Y', timestamp, 'localtime') = ?
        ORDER BY month_key ASC
      `,
      [String(year)],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const monthMap = new Map();
        for (let month = 1; month <= 12; month += 1) {
          const monthKey = `${year}-${String(month).padStart(2, '0')}`;
          monthMap.set(monthKey, {
            total_sales: 0,
            pc_rental_sales: 0,
            print_sales: 0,
            store_sales: 0,
          });
        }

        (rows || []).forEach((row) => {
          const monthKey = String(row.month_key || '').slice(0, 7);
          if (!monthMap.has(monthKey)) {
            return;
          }

          const category = getRevenueCategory(row);
          if (!category) {
            return;
          }

          const revenue = getNormalizedRevenueAmount(row, flatRateSettings);
          const current = monthMap.get(monthKey);
          current.total_sales += revenue;
          current[category] += revenue;
        });

        const months = [];
        const rowsData = [];
        for (let month = 1; month <= 12; month += 1) {
          const monthKey = `${year}-${String(month).padStart(2, '0')}`;
          const date = new Date(year, month - 1, 1);
          const values = monthMap.get(monthKey);
          const label = date.toLocaleDateString('en-US', { month: 'short' });

          months.push(label);
          rowsData.push({
            month: label,
            total_sales: Number(values.total_sales.toFixed(4)),
            pc_rental_sales: Number(values.pc_rental_sales.toFixed(4)),
            print_sales: Number(values.print_sales.toFixed(4)),
            store_sales: Number(values.store_sales.toFixed(4)),
          });
        }

        return res.json({
          status: 'success',
          data: {
            year,
            months,
            rows: rowsData,
          },
        });
      }
    );
  });
});

// GET print sales breakdown over time by category for charting
router.get('/revenue/print-daily-breakdown', (req, res) => {
  const days = Number.parseInt(req.query.days, 10) || 365;

  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    return res.status(400).json({
      status: 'error',
      error: {
        code: 'invalid_days',
        message: 'days must be an integer between 1 and 3650',
      },
    });
  }

  db.all(
    `
      WITH print_tx AS (
        SELECT
          DATE(timestamp, 'localtime') AS date,
          transaction_type,
          CAST(amount AS REAL) AS amount
        FROM transactions
        WHERE datetime(timestamp, 'localtime') >= datetime('now', 'localtime', 'start of day', ?)
          AND transaction_type LIKE 'print_%'
      )
      SELECT
        date,
        COALESCE(SUM(amount), 0) AS total_print_sales,
        COALESCE(SUM(CASE WHEN transaction_type LIKE 'print_document_%' AND amount > 0 THEN amount ELSE 0 END), 0) AS document_sales,
        COALESCE(SUM(CASE WHEN transaction_type LIKE 'print_photo_%' AND amount > 0 THEN amount ELSE 0 END), 0) AS photo_sales,
        COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) AS print_errors
      FROM print_tx
      GROUP BY date
      ORDER BY date ASC
    `,
    [`-${days - 1} days`],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      return res.json({
        status: 'success',
        data: (rows || []).map((row) => ({
          date: row.date,
          total_print_sales: Number(row.total_print_sales || 0),
          document_sales: Number(row.document_sales || 0),
          photo_sales: Number(row.photo_sales || 0),
          print_errors: Number(row.print_errors || 0),
        })),
        meta: {
          days,
          since: `-${days - 1} days`,
        },
      });
    }
  );
});

// GET revenue over time by unit (daily)
router.get('/revenue/daily-by-unit', (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;

  loadElectricitySettings((settingsErr, { pesoToSeconds, flatRateSettings } = {}) => {
    if (settingsErr) {
      return res.status(500).json({ error: settingsErr.message });
    }

    db.all(
      `
        SELECT id, name
        FROM units
        ORDER BY id ASC
      `,
      [],
      (unitsErr, units) => {
        if (unitsErr) {
          return res.status(500).json({ error: unitsErr.message });
        }

        db.all(
          `
            SELECT
              unit_id,
              DATE(timestamp, 'localtime') as date,
              amount,
              denomination,
              transaction_type
            FROM transactions
            WHERE datetime(timestamp, 'localtime') >= datetime('now', 'localtime', ?)
            ORDER BY date ASC, unit_id ASC
          `,
          [`-${days} days`],
          (txErr, rows) => {
            if (txErr) {
              return res.status(500).json({ error: txErr.message });
            }

            const unitMap = new Map((units || []).map((unit) => [Number(unit.id), unit]));
            const dailyUnitMap = new Map();

            for (const row of rows) {
              const unitId = Number(row.unit_id);
              const unit = unitMap.get(unitId);
              if (!unit || !row.date) {
                continue;
              }

              const key = `${row.date}::${unitId}`;
              const existing = dailyUnitMap.get(key) || {
                date: row.date,
                id: unitId,
                name: unit.name,
                daily_revenue: 0,
                daily_hours: 0,
                transaction_count: 0,
              };

              existing.daily_revenue += getNormalizedRevenueAmount(row, flatRateSettings);
              existing.daily_hours += getElectricityUsageHours(row, pesoToSeconds);
              existing.transaction_count += 1;

              dailyUnitMap.set(key, existing);
            }

            const dates = [];
            const current = new Date();
            current.setHours(0, 0, 0, 0);

            for (let offset = days - 1; offset >= 0; offset -= 1) {
              const date = new Date(current);
              date.setDate(current.getDate() - offset);
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              dates.push(`${year}-${month}-${day}`);
            }

            const result = [];

            for (const date of dates) {
              for (const unit of units || []) {
                const key = `${date}::${Number(unit.id)}`;
                const values = dailyUnitMap.get(key) || {
                  date,
                  id: Number(unit.id),
                  name: unit.name,
                  daily_revenue: 0,
                  daily_hours: 0,
                  transaction_count: 0,
                };

                result.push({
                  date: values.date,
                  id: values.id,
                  name: values.name,
                  daily_revenue: Number(values.daily_revenue.toFixed(4)),
                  daily_hours: Number(values.daily_hours.toFixed(4)),
                  transaction_count: values.transaction_count,
                });
              }
            }

            return res.json(result);
          }
        );
      }
    );
  });
});

// GET hourly revenue
router.get('/revenue/hourly', (req, res) => {
  loadElectricitySettings((settingsErr, { flatRateSettings } = {}) => {
    if (settingsErr) {
      return res.status(500).json({ error: settingsErr.message });
    }

    db.all(`
      SELECT 
        strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
        amount,
        transaction_type
      FROM transactions
      WHERE timestamp >= datetime('now', '-24 hours')
      ORDER BY hour DESC
    `, [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const hourlyMap = new Map();
      (rows || []).forEach((row) => {
        const key = row.hour;
        const current = hourlyMap.get(key) || { hour: key, hourly_revenue: 0, transaction_count: 0 };
        current.hourly_revenue += getNormalizedRevenueAmount(row, flatRateSettings);
        current.transaction_count += 1;
        hourlyMap.set(key, current);
      });

      const result = Array.from(hourlyMap.values())
        .map((row) => ({
          ...row,
          hourly_revenue: Number(row.hourly_revenue.toFixed(4)),
        }))
        .sort((a, b) => b.hour.localeCompare(a.hour));

      res.json(result);
    });
  });
});

// GET estimated electricity consumption over time (daily)
router.get('/electricity/daily', (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;

  loadElectricitySettings((settingsErr, { pesoToSeconds, wattage, ratePerKwh } = {}) => {
    if (settingsErr) {
      return res.status(500).json({ error: settingsErr.message });
    }

      db.all(
        `
          SELECT DATE(timestamp, 'localtime') as date, amount, denomination, transaction_type
          FROM transactions
          WHERE datetime(timestamp, 'localtime') >= datetime('now', 'localtime', ?)
          ORDER BY date ASC
        `,
        [`-${days} days`],
        (txErr, rows) => {
          if (txErr) {
            return res.status(500).json({ error: txErr.message });
          }

          const dailyMap = new Map();

          for (const row of rows) {
            const metrics = getElectricityMetrics(row, pesoToSeconds, wattage, ratePerKwh);
            const current = dailyMap.get(row.date) || { estimated_usage_hours: 0, estimated_kwh: 0, estimated_cost: 0 };
            const nextUsageHours = current.estimated_usage_hours + metrics.usageHours;
            const nextKwh = current.estimated_kwh + metrics.estimatedKwh;
            const nextCost = current.estimated_cost + metrics.estimatedCost;
            dailyMap.set(row.date, {
              estimated_usage_hours: nextUsageHours,
              estimated_kwh: nextKwh,
              estimated_cost: nextCost,
            });
          }

          const result = Array.from(dailyMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, values]) => ({
              date,
              estimated_usage_hours: Number(values.estimated_usage_hours.toFixed(4)),
              estimated_kwh: Number(values.estimated_kwh.toFixed(4)),
              estimated_cost: Number(values.estimated_cost.toFixed(4)),
              estimated_pc_wattage: wattage,
              estimated_kwh_rate: ratePerKwh,
            }));

          return res.json(result);
        }
      );
  });
});

// GET estimated electricity consumption by unit
router.get('/electricity/by-unit', (req, res) => {
  loadElectricitySettings((settingsErr, { pesoToSeconds, wattage, ratePerKwh } = {}) => {
    if (settingsErr) {
      return res.status(500).json({ error: settingsErr.message });
    }

    db.all(
      `
        SELECT u.id, u.name, t.amount, t.denomination, t.transaction_type
        FROM units u
        LEFT JOIN transactions t ON u.id = t.unit_id
        ORDER BY u.id ASC
      `,
      [],
      (txErr, rows) => {
        if (txErr) {
          return res.status(500).json({ error: txErr.message });
        }

        const unitMap = new Map();

        for (const row of rows) {
          const key = row.id;
          const existing = unitMap.get(key) || {
            id: row.id,
            name: row.name,
            estimated_usage_hours: 0,
            estimated_kwh: 0,
            estimated_cost: 0,
          };

          if (row.transaction_type) {
            const metrics = getElectricityMetrics(row, pesoToSeconds, wattage, ratePerKwh);
            existing.estimated_usage_hours += metrics.usageHours;
            existing.estimated_kwh += metrics.estimatedKwh;
            existing.estimated_cost += metrics.estimatedCost;
          }

          unitMap.set(key, existing);
        }

        const result = Array.from(unitMap.values()).map((row) => ({
          ...row,
          estimated_usage_hours: Number(row.estimated_usage_hours.toFixed(4)),
          estimated_kwh: Number(row.estimated_kwh.toFixed(4)),
          estimated_cost: Number(row.estimated_cost.toFixed(4)),
          estimated_pc_wattage: wattage,
          estimated_kwh_rate: ratePerKwh,
        }));

        return res.json(result);
      }
    );
  });
});

// GET transactions by type
router.get('/report/by-type', (req, res) => {
  loadElectricitySettings((settingsErr, { flatRateSettings } = {}) => {
    if (settingsErr) {
      return res.status(500).json({ error: settingsErr.message });
    }

    db.all(`
      SELECT 
        transaction_type,
        amount
      FROM transactions
    `, [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const byType = new Map();
      (rows || []).forEach((row) => {
        const txType = row.transaction_type || 'unknown';
        const current = byType.get(txType) || { transaction_type: txType, count: 0, total_amount: 0 };
        current.count += 1;
        current.total_amount += getNormalizedRevenueAmount(row, flatRateSettings);
        byType.set(txType, current);
      });

      const result = Array.from(byType.values()).map((row) => ({
        ...row,
        total_amount: Number(row.total_amount.toFixed(4)),
      }));

      res.json(result);
    });
  });
});

// GET comprehensive report
router.get('/report/comprehensive', (req, res) => {
  const startDate = req.query.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = req.query.end_date || new Date().toISOString();

  loadElectricitySettings((settingsErr, { flatRateSettings } = {}) => {
    if (settingsErr) {
      return res.status(500).json({ error: settingsErr.message });
    }

    db.all(
      `
        SELECT unit_id, amount, transaction_type, timestamp, denomination, description
        FROM transactions
        WHERE timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
      `,
      [startDate, endDate],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const txRows = rows || [];
        const totalTransactions = txRows.length;
        const totalRevenue = txRows.reduce((sum, row) => sum + getNormalizedRevenueAmount(row, flatRateSettings), 0);
        const unitSet = new Set(txRows.map((row) => row.unit_id).filter((id) => id != null));
        const averageTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

        res.json({
          period: { start: startDate, end: endDate },
          total_transactions: totalTransactions,
          total_revenue: Number(totalRevenue.toFixed(4)),
          active_units: unitSet.size,
          average_transaction: Number(averageTransaction.toFixed(4)),
          transactions: txRows.map((row) => ({
            unit_id: row.unit_id,
            amount: Number(row.amount || 0),
            denomination: row.denomination == null ? null : Number(row.denomination),
            transaction_type: row.transaction_type,
            timestamp: row.timestamp,
            description: String(row.description || '').trim() || null,
          })),
        });
      }
    );
  });
});

// POST create transaction (for advanced recording)
router.post('/', (req, res) => {
  const { unit_id, amount, denomination, transaction_type, session_id } = req.body;
  const description = String(req.body?.description || '').trim();

  if (!unit_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid unit_id or amount' });
  }

  db.run(
    'INSERT INTO transactions (unit_id, amount, denomination, timestamp, transaction_type, session_id, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [unit_id, amount, denomination || amount, new Date().toISOString(), transaction_type || 'manual', session_id || null, description || null],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        message: 'Transaction recorded',
        transaction_id: this.lastID,
        unit_id,
        amount
      });
    }
  );
});

// POST record print service transaction
router.post('/print-service', (req, res) => {
  const { service_type, pages_count } = req.body;
  const isDeduction = req.body?.is_deduction === true || req.body?.is_deduction === 'true' || req.body?.is_deduction === 1;
  const description = String(req.body?.description || '').trim();

  if (!service_type || !PRINT_SERVICES[service_type]) {
    return res.status(400).json({ error: 'Invalid print service type' });
  }

  const pagesCount = Math.max(1, parseInt(pages_count, 10) || 1);
  loadPrintServicePrices((priceErr, pricesByServiceType) => {
    if (priceErr) {
      return res.status(500).json({ error: priceErr.message });
    }

    const pricePerPage = Number(pricesByServiceType?.[service_type] ?? 0);
    const absoluteAmount = pricePerPage * pagesCount;
    const totalAmount = isDeduction ? -absoluteAmount : absoluteAmount;

    db.run(
      'INSERT INTO transactions (unit_id, amount, denomination, timestamp, transaction_type, session_id, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [null, totalAmount, pagesCount, new Date().toISOString(), service_type, null, description || null],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({
          message: isDeduction ? 'Print service deduction recorded' : 'Print service transaction recorded',
          transaction_id: this.lastID,
          service_type,
          is_deduction: isDeduction,
          pages_count: pagesCount,
          price_per_page: pricePerPage,
          total_amount: totalAmount,
        });
      }
    );
  });
});

module.exports = router;
