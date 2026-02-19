const express = require('express');
const router = express.Router();
const db = require('../database');

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
  db.get(
    'SELECT COALESCE(SUM(amount), 0) as total_revenue FROM transactions',
    [],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ total_revenue: parseFloat(row.total_revenue) });
    }
  );
});

// GET revenue by unit
router.get('/revenue/by-unit', (req, res) => {
  db.all(`
    SELECT 
      u.id,
      u.name,
      COALESCE(SUM(t.amount), 0) as revenue,
      COUNT(t.id) as transaction_count
    FROM units u
    LEFT JOIN transactions t ON u.id = t.unit_id
    GROUP BY u.id, u.name
    ORDER BY revenue DESC
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// GET revenue over time (daily)
router.get('/revenue/daily', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  
  db.all(`
    SELECT 
      DATE(timestamp, 'localtime') as date,
      COALESCE(SUM(amount), 0) as daily_revenue,
      COUNT(*) as transaction_count
    FROM transactions
    WHERE datetime(timestamp, 'localtime') >= datetime('now', 'localtime', '-${days} days')
    GROUP BY DATE(timestamp, 'localtime')
    ORDER BY date DESC
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// GET hourly revenue
router.get('/revenue/hourly', (req, res) => {
  db.all(`
    SELECT 
      strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
      COALESCE(SUM(amount), 0) as hourly_revenue,
      COUNT(*) as transaction_count
    FROM transactions
    WHERE timestamp >= datetime('now', '-24 hours')
    GROUP BY strftime('%Y-%m-%d %H:00:00', timestamp)
    ORDER BY hour DESC
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// GET transactions by type
router.get('/report/by-type', (req, res) => {
  db.all(`
    SELECT 
      transaction_type,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as total_amount
    FROM transactions
    GROUP BY transaction_type
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// GET comprehensive report
router.get('/report/comprehensive', (req, res) => {
  const startDate = req.query.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = req.query.end_date || new Date().toISOString();

  db.get(`
    SELECT 
      (SELECT COUNT(*) FROM transactions WHERE timestamp BETWEEN ? AND ?) as total_transactions,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE timestamp BETWEEN ? AND ?) as total_revenue,
      (SELECT COUNT(DISTINCT unit_id) FROM transactions WHERE timestamp BETWEEN ? AND ?) as active_units,
      (SELECT COALESCE(AVG(amount), 0) FROM transactions WHERE timestamp BETWEEN ? AND ?) as average_transaction
  `, [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        period: { start: startDate, end: endDate },
        ...row
      });
    }
  );
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
