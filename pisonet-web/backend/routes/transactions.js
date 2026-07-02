const express = require('express');
const router = express.Router();
const db = require('../database');
const { calculateFlatRateAmountFromMinutes, loadFlatRateSettings } = require('../pricing');

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
        SELECT unit_id, amount, transaction_type
        FROM transactions
        WHERE timestamp BETWEEN ? AND ?
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
        });
      }
    );
  });
});

// POST create transaction (for advanced recording)
router.post('/', (req, res) => {
  const { unit_id, amount, denomination, transaction_type, session_id } = req.body;

  if (!unit_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid unit_id or amount' });
  }

  db.run(
    'INSERT INTO transactions (unit_id, amount, denomination, timestamp, transaction_type, session_id) VALUES (?, ?, ?, ?, ?, ?)',
    [unit_id, amount, denomination || amount, new Date().toISOString(), transaction_type || 'manual', session_id || null],
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

module.exports = router;
