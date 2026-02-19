const express = require('express');
const router = express.Router();
const db = require('../database');

// GET all units with session info
router.get('/', (req, res) => {
  db.all(`
    SELECT u.*, 
           (SELECT COUNT(*) FROM sessions WHERE unit_id = u.id AND status = 'active') as active_sessions
    FROM units u 
    ORDER BY u.id
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// GET single unit with detailed info
router.get('/:id', (req, res) => {
  const unitId = req.params.id;
  
  db.get(`
    SELECT u.*, 
           (SELECT COUNT(*) FROM sessions WHERE unit_id = u.id AND status = 'active') as active_sessions,
           (SELECT SUM(amount) FROM transactions WHERE unit_id = u.id) as total_transactions
    FROM units u 
    WHERE u.id = ?
  `, [unitId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    res.json(row);
  });
});

// GET unit's current session
router.get('/:id/session', (req, res) => {
  const unitId = req.params.id;
  
  db.get(`
    SELECT * FROM sessions 
    WHERE unit_id = ? AND status = 'active'
    ORDER BY start_time DESC
    LIMIT 1
  `, [unitId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(row || null);
  });
});

// GET unit's transaction history
router.get('/:id/transactions', (req, res) => {
  const unitId = req.params.id;
  const limit = req.query.limit || 50;
  
  db.all(`
    SELECT * FROM transactions 
    WHERE unit_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `, [unitId, limit], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// POST add time to unit (insert coin)
router.post('/:id/add-time', (req, res) => {
  const { amount, denomination } = req.body;
  const unitId = req.params.id;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  db.get(`SELECT key, value FROM settings WHERE key = 'peso_to_seconds'`, [], (err, setting) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const conversionRate = setting ? parseInt(setting.value) : 60;
    const secondsToAdd = Math.floor(amount * conversionRate);

    db.get('SELECT * FROM units WHERE id = ?', [unitId], (err, unit) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!unit) {
        return res.status(404).json({ error: 'Unit not found' });
      }

      const newSeconds = unit.remaining_seconds + secondsToAdd;
      const newRevenue = unit.total_revenue + amount;
      const newStatus = newSeconds > 0 ? 'Active' : unit.status;

      db.run(
        'UPDATE units SET remaining_seconds = ?, total_revenue = ?, status = ?, last_status_update = ? WHERE id = ?',
        [newSeconds, newRevenue, newStatus, new Date().toISOString(), unitId],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          // Record transaction
          db.run(
            'INSERT INTO transactions (unit_id, amount, denomination, timestamp, transaction_type) VALUES (?, ?, ?, ?, ?)',
            [unitId, amount, denomination || amount, new Date().toISOString(), 'coin'],
            (err) => {
              if (err) {
                console.error('Error recording transaction:', err);
              }
            }
          );

          // Broadcast update
          if (global.broadcast) {
            global.broadcast({
              type: 'COIN_INSERTED',
              unit: {
                id: parseInt(unitId),
                remaining_seconds: newSeconds,
                total_revenue: newRevenue,
                status: newStatus
              }
            });
          }

          res.json({
            message: 'Time added successfully',
            unit_id: parseInt(unitId),
            amount,
            seconds_added: secondsToAdd,
            new_remaining_seconds: newSeconds,
            status: newStatus
          });
        }
      );
    });
  });
});

// POST create/start session
router.post('/:id/session/start', (req, res) => {
  const unitId = req.params.id;
  const startTime = new Date().toISOString();

  db.run(
    'INSERT INTO sessions (unit_id, start_time, status) VALUES (?, ?, ?)',
    [unitId, startTime, 'active'],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.run(
        'UPDATE units SET status = ? WHERE id = ?',
        ['Active', unitId],
        (err) => {
          if (err) console.error('Error updating unit status:', err);
        }
      );

      res.json({
        message: 'Session started',
        session_id: this.lastID,
        unit_id: parseInt(unitId),
        start_time: startTime
      });
    }
  );
});

// POST end session
router.post('/:id/session/end', (req, res) => {
  const unitId = req.params.id;
  const endTime = new Date().toISOString();

  db.get(
    'SELECT * FROM sessions WHERE unit_id = ? AND status = "active" LIMIT 1',
    [unitId],
    (err, session) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!session) {
        return res.status(400).json({ error: 'No active session' });
      }

      const duration = Math.round((new Date(endTime) - new Date(session.start_time)) / 1000);

      db.run(
        'UPDATE sessions SET status = ?, end_time = ?, duration_seconds = ? WHERE id = ?',
        ['ended', endTime, duration, session.id],
        (err) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          db.run(
            'UPDATE units SET status = ?, remaining_seconds = 0 WHERE id = ?',
            ['Idle', unitId],
            (err) => {
              if (err) console.error('Error updating unit status:', err);
            }
          );

          res.json({
            message: 'Session ended',
            session_id: session.id,
            unit_id: parseInt(unitId),
            duration_seconds: duration,
            end_time: endTime
          });
        }
      );
    }
  );
});

// POST hardware control (turn on/off/shutdown/restart)
router.post('/:id/control', (req, res) => {
  const { action } = req.body;
  const unitId = req.params.id;

  if (!['on', 'off', 'shutdown', 'restart', 'lock', 'unlock'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be: on, off, shutdown, restart, lock, unlock' });
  }

  // Log hardware action
  db.run(
    'INSERT INTO hardware_log (unit_id, action, timestamp, status) VALUES (?, ?, ?, ?)',
    [unitId, action, new Date().toISOString(), 'sent'],
    (err) => {
      if (err) console.error('Error logging hardware action:', err);
    }
  );

  // Broadcast control command to clients
  if (global.broadcast) {
    global.broadcast({
      type: 'HARDWARE_CONTROL',
      unit_id: parseInt(unitId),
      action,
      timestamp: new Date().toISOString()
    });
  }

  res.json({
    message: `${action.toUpperCase()} command sent to unit ${unitId}`,
    unit_id: parseInt(unitId),
    action,
    timestamp: new Date().toISOString()
  });
});

// GET hardware control log for unit
router.get('/:id/hardware-log', (req, res) => {
  const unitId = req.params.id;
  const limit = req.query.limit || 50;
  
  db.all(`
    SELECT * FROM hardware_log 
    WHERE unit_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `, [unitId, limit], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// PUT update unit details
router.put('/:id', (req, res) => {
  const { name, mac_address } = req.body;
  const unitId = req.params.id;

  const updates = [];
  const values = [];

  if (name) {
    updates.push('name = ?');
    values.push(name);
  }
  if (mac_address) {
    updates.push('mac_address = ?');
    values.push(mac_address);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('last_status_update = ?');
  values.push(new Date().toISOString());
  values.push(unitId);

  db.run(
    `UPDATE units SET ${updates.join(', ')} WHERE id = ?`,
    values,
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.get('SELECT * FROM units WHERE id = ?', [unitId], (err, unit) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Unit updated successfully', unit });
      });
    }
  );
});

module.exports = router;
