const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdminAuth } = require('../admin-auth');
const { calculateFlatRateAmountFromMinutes, loadFlatRateSettings } = require('../pricing');

function calculateOpenTimeAmount(elapsedSeconds, pricingSettings) {
  const elapsedMinutes = Math.max(0, Number(elapsedSeconds || 0) / 60);
  return calculateFlatRateAmountFromMinutes(elapsedMinutes, pricingSettings, { minimumCharge: true });
}

function getOpenTimeMetrics(unit, pricingSettings, nowMs = Date.now()) {
  const baseElapsed = Math.max(0, Number(unit.open_time_elapsed_base_seconds || 0));
  const isPaused = Number(unit.open_time_paused || 0) === 1;

  if (!unit.open_time) {
    return { elapsedSeconds: 0, amountOwed: 0, isPaused: false };
  }

  let runningElapsed = 0;
  if (!isPaused && unit.open_time_start) {
    runningElapsed = Math.max(0, Math.floor((nowMs - new Date(unit.open_time_start).getTime()) / 1000));
  }

  const elapsedSeconds = baseElapsed + runningElapsed;
  return {
    elapsedSeconds,
    amountOwed: calculateOpenTimeAmount(elapsedSeconds, pricingSettings),
    isPaused,
  };
}

// GET all units with session info
router.get('/', (req, res) => {
  loadFlatRateSettings(db, (pricingErr, pricingSettings) => {
    if (pricingErr) {
      return res.status(500).json({ error: pricingErr.message });
    }

    db.all(`
      SELECT u.*, 
             (SELECT COUNT(*) FROM sessions WHERE unit_id = u.id AND status = 'active') as active_sessions
      FROM units u 
      ORDER BY u.id
    `, [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const now = Date.now();
      const enriched = rows.map((row) => {
        if (row.open_time) {
          const metrics = getOpenTimeMetrics(row, pricingSettings, now);
          return {
            ...row,
            open_time_paused: metrics.isPaused ? 1 : 0,
            open_time_elapsed: metrics.elapsedSeconds,
            open_time_amount: metrics.amountOwed,
          };
        }
        return {
          ...row,
          open_time_paused: 0,
          open_time_elapsed: 0,
          open_time_amount: 0,
        };
      });
      res.json(enriched);
    });
  });
});

// GET unit by client IP address (used by diskless clients in 192.168.1.151-160 range)
router.get('/by-ip/:ip', (req, res) => {
  const ip = req.params.ip;
  db.get('SELECT * FROM units WHERE ip_address = ?', [ip], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: `No unit found for IP ${ip}` });
    res.json(row);
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
      const startsNewSession = Number(unit.remaining_seconds || 0) <= 0 && Number(unit.open_time || 0) !== 1;
      const newRevenue = startsNewSession ? Number(amount) : (Number(unit.total_revenue || 0) + Number(amount));
      const newStatus = newSeconds > 0 ? 'Active' : unit.status;
      const newTimerPaused = newSeconds > 0 ? Number(unit.timer_paused || 0) : 0;

      db.run(
        'UPDATE units SET remaining_seconds = ?, total_revenue = ?, status = ?, timer_paused = ?, last_status_update = ? WHERE id = ?',
        [newSeconds, newRevenue, newStatus, newTimerPaused, new Date().toISOString(), unitId],
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
              amount: amount,
              unit: {
                id: parseInt(unitId),
                remaining_seconds: newSeconds,
                total_revenue: newRevenue,
                timer_paused: newTimerPaused,
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

// POST adjust timer by minutes (admin control, supports negative values)
router.post('/:id/adjust-time', requireAdminAuth, (req, res) => {
  const unitId = req.params.id;
  const minutes = Number(req.body?.minutes);

  if (!Number.isFinite(minutes) || minutes === 0) {
    return res.status(400).json({ error: 'Invalid minutes. Provide a non-zero numeric value.' });
  }

  const deltaSeconds = Math.round(minutes * 60);

  db.get('SELECT * FROM units WHERE id = ?', [unitId], (err, unit) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const newSeconds = Math.max(0, (unit.remaining_seconds || 0) + deltaSeconds);
    const newStatus = newSeconds > 0 ? 'Active' : 'Idle';
    const newTimerPaused = newSeconds > 0 ? Number(unit.timer_paused || 0) : 0;
    const startsNewSession = Number(unit.remaining_seconds || 0) <= 0 && Number(unit.open_time || 0) !== 1 && newSeconds > 0;
    const newRevenue = startsNewSession ? 0 : Number(unit.total_revenue || 0);

    db.run(
      'UPDATE units SET remaining_seconds = ?, total_revenue = ?, status = ?, timer_paused = ?, last_status_update = ? WHERE id = ?',
      [newSeconds, newRevenue, newStatus, newTimerPaused, new Date().toISOString(), unitId],
      (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ error: updateErr.message });
        }

        // Log admin time adjustment as a transaction (amount = signed minutes)
        db.run(
          'INSERT INTO transactions (unit_id, amount, denomination, timestamp, transaction_type) VALUES (?, ?, ?, ?, ?)',
          [unitId, minutes, minutes, new Date().toISOString(), minutes > 0 ? 'admin_add' : 'admin_deduct'],
          (txErr) => {
            if (txErr) {
              console.error('Error recording admin adjustment transaction:', txErr);
            }
          }
        );

        if (global.broadcast) {
          global.broadcast({
            type: 'UNIT_UPDATE',
            unit: {
              id: parseInt(unitId, 10),
              remaining_seconds: newSeconds,
              timer_paused: newTimerPaused,
              total_revenue: newRevenue,
              status: newStatus
            }
          });
        }

        return res.json({
          message: 'Timer adjusted successfully',
          unit_id: parseInt(unitId, 10),
          delta_minutes: minutes,
          delta_seconds: deltaSeconds,
          new_remaining_seconds: newSeconds,
          status: newStatus
        });
      }
    );
  });
});

// POST pause a regular countdown timer without ending session/open-time (admin only)
router.post('/:id/timer/pause', requireAdminAuth, (req, res) => {
  const unitId = req.params.id;
  const now = new Date().toISOString();

  db.get('SELECT * FROM units WHERE id = ?', [unitId], (err, unit) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    if ((unit.remaining_seconds || 0) <= 0) {
      return res.status(400).json({ error: 'Unit timer is not running' });
    }

    if (Number(unit.timer_paused || 0) === 1) {
      return res.status(400).json({ error: 'Unit timer is already paused' });
    }

    db.run(
      'UPDATE units SET timer_paused = 1, status = ?, last_status_update = ? WHERE id = ?',
      ['Paused', now, unitId],
      (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ error: updateErr.message });
        }

        if (global.broadcast) {
          global.broadcast({
            type: 'UNIT_UPDATE',
            unit: {
              id: parseInt(unitId, 10),
              remaining_seconds: unit.remaining_seconds,
              timer_paused: 1,
              status: 'Paused'
            }
          });
        }

        return res.json({ message: 'Timer paused', unit_id: parseInt(unitId, 10) });
      }
    );
  });
});

// POST resume a regular countdown timer (admin only)
router.post('/:id/timer/resume', requireAdminAuth, (req, res) => {
  const unitId = req.params.id;
  const now = new Date().toISOString();

  db.get('SELECT * FROM units WHERE id = ?', [unitId], (err, unit) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    if ((unit.remaining_seconds || 0) <= 0) {
      return res.status(400).json({ error: 'Unit timer is not running' });
    }

    if (Number(unit.timer_paused || 0) !== 1) {
      return res.status(400).json({ error: 'Unit timer is not paused' });
    }

    db.run(
      'UPDATE units SET timer_paused = 0, status = ?, last_status_update = ? WHERE id = ?',
      ['Active', now, unitId],
      (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ error: updateErr.message });
        }

        if (global.broadcast) {
          global.broadcast({
            type: 'UNIT_UPDATE',
            unit: {
              id: parseInt(unitId, 10),
              remaining_seconds: unit.remaining_seconds,
              timer_paused: 0,
              status: 'Active'
            }
          });
        }

        return res.json({ message: 'Timer resumed', unit_id: parseInt(unitId, 10) });
      }
    );
  });
});

// POST create/start session
router.post('/:id/session/start', requireAdminAuth, (req, res) => {
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
router.post('/:id/session/end', requireAdminAuth, (req, res) => {
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
            'UPDATE units SET status = ?, remaining_seconds = 0, timer_paused = 0 WHERE id = ?',
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

// POST hardware control (logout/restart/shutdown + legacy on/off/lock/unlock)
router.post('/:id/control', requireAdminAuth, (req, res) => {
  const { action } = req.body;
  const unitId = req.params.id;

  if (!['on', 'off', 'shutdown', 'restart', 'lock', 'unlock', 'logout'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be: logout, restart, shutdown, on, off, lock, unlock' });
  }

  // Log hardware action
  db.run(
    'INSERT INTO hardware_log (unit_id, action, timestamp, status) VALUES (?, ?, ?, ?)',
    [unitId, action, new Date().toISOString(), 'sent'],
    (err) => {
      if (err) console.error('Error logging hardware action:', err);
    }
  );

  const broadcastAndRespond = () => {
    // Broadcast control command to the target unit's client
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
  };

  if (action === 'logout') {
    // Clear remaining time so the unit goes Idle immediately
    db.run(
      'UPDATE units SET remaining_seconds = 0, status = ?, timer_paused = 0, last_status_update = ? WHERE id = ?',
      ['Idle', new Date().toISOString(), unitId],
      (err) => {
        if (err) console.error('Error clearing unit time on logout:', err);

        // Notify all clients of the updated unit state
        db.get('SELECT * FROM units WHERE id = ?', [unitId], (getErr, unit) => {
          if (!getErr && unit && global.broadcast) {
            global.broadcast({
              type: 'UNIT_UPDATE',
              unit: {
                id: unit.id,
                remaining_seconds: 0,
                status: 'Idle',
                timer_paused: 0
              }
            });
          }
          broadcastAndRespond();
        });
      }
    );
  } else {
    broadcastAndRespond();
  }
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

// POST start open-time session on a unit (admin only)
// The unit is unlocked immediately and billing runs at ₱15/hour.
router.post('/:id/open-time', requireAdminAuth, (req, res) => {
  const unitId = req.params.id;
  const now = new Date().toISOString();

  loadFlatRateSettings(db, (pricingErr, pricingSettings) => {
    if (pricingErr) return res.status(500).json({ error: pricingErr.message });

    db.get('SELECT * FROM units WHERE id = ?', [unitId], (err, unit) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!unit) return res.status(404).json({ error: 'Unit not found' });

      if (unit.open_time) {
        if (Number(unit.open_time_paused || 0) === 1) {
          db.run(
            'UPDATE units SET open_time_start = ?, open_time_paused = 0, open_time_paused_at = NULL, status = ?, last_status_update = ? WHERE id = ?',
            [now, 'Active', now, unitId],
            (resumeErr) => {
              if (resumeErr) return res.status(500).json({ error: resumeErr.message });

              const baseElapsed = Math.max(0, Number(unit.open_time_elapsed_base_seconds || 0));
              if (global.broadcast) {
                global.broadcast({
                  type: 'UNIT_UPDATE',
                  unit: {
                    id: parseInt(unitId, 10),
                    remaining_seconds: 0,
                    open_time: 1,
                    open_time_start: now,
                    open_time_paused: 0,
                    open_time_paused_at: null,
                    open_time_elapsed_base_seconds: baseElapsed,
                    open_time_elapsed: baseElapsed,
                    open_time_amount: calculateOpenTimeAmount(baseElapsed, pricingSettings),
                    status: 'Active'
                  }
                });
              }

              return res.json({ message: 'Open time resumed', unit_id: parseInt(unitId, 10), start_time: now });
            }
          );
          return;
        }

        return res.status(400).json({ error: 'Unit is already in open-time mode' });
      }

      db.run(
        'UPDATE units SET open_time = 1, open_time_start = ?, open_time_paused = 0, open_time_paused_at = NULL, open_time_elapsed_base_seconds = 0, total_revenue = ?, status = ?, last_status_update = ? WHERE id = ?',
        [now, 0, 'Active', now, unitId],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ error: updateErr.message });

          if (global.broadcast) {
            global.broadcast({
              type: 'UNIT_UPDATE',
              unit: {
                id: parseInt(unitId),
                remaining_seconds: 0,
                open_time: 1,
                open_time_start: now,
                open_time_paused: 0,
                open_time_paused_at: null,
                open_time_elapsed_base_seconds: 0,
                open_time_elapsed: 0,
                open_time_amount: calculateOpenTimeAmount(0, pricingSettings),
                total_revenue: 0,
                status: 'Active'
              }
            });
          }

          res.json({ message: 'Open time started', unit_id: parseInt(unitId), start_time: now });
        }
      );
    });
  });
});

// POST pause open-time session without ending billing/session (admin only)
router.post('/:id/open-time/pause', requireAdminAuth, (req, res) => {
  const unitId = req.params.id;
  const now = new Date().toISOString();

  loadFlatRateSettings(db, (pricingErr, pricingSettings) => {
    if (pricingErr) return res.status(500).json({ error: pricingErr.message });

    db.get('SELECT * FROM units WHERE id = ?', [unitId], (err, unit) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    if (!unit.open_time) {
      return res.status(400).json({ error: 'Unit is not in open-time mode' });
    }

    if (Number(unit.open_time_paused || 0) === 1) {
      return res.status(400).json({ error: 'Open time is already paused' });
    }

      const metrics = getOpenTimeMetrics(unit, pricingSettings, new Date(now).getTime());
    db.run(
      'UPDATE units SET open_time_start = NULL, open_time_paused = 1, open_time_paused_at = ?, open_time_elapsed_base_seconds = ?, last_status_update = ? WHERE id = ?',
      [now, metrics.elapsedSeconds, now, unitId],
      (pauseErr) => {
        if (pauseErr) return res.status(500).json({ error: pauseErr.message });

        if (global.broadcast) {
          global.broadcast({
            type: 'UNIT_UPDATE',
            unit: {
              id: parseInt(unitId, 10),
              open_time: 1,
              open_time_start: null,
              open_time_paused: 1,
              open_time_paused_at: now,
              open_time_elapsed_base_seconds: metrics.elapsedSeconds,
              open_time_elapsed: metrics.elapsedSeconds,
              open_time_amount: calculateOpenTimeAmount(metrics.elapsedSeconds, pricingSettings),
              status: unit.status || 'Active'
            }
          });
        }

        return res.json({
          message: 'Open time paused',
          unit_id: parseInt(unitId, 10),
          paused_at: now,
          elapsed_seconds: metrics.elapsedSeconds,
        });
      }
    );
    });
  });
});

// POST resume open-time session without ending billing/session (admin only)
router.post('/:id/open-time/resume', requireAdminAuth, (req, res) => {
  const unitId = req.params.id;
  const now = new Date().toISOString();

  loadFlatRateSettings(db, (pricingErr, pricingSettings) => {
    if (pricingErr) return res.status(500).json({ error: pricingErr.message });

    db.get('SELECT * FROM units WHERE id = ?', [unitId], (err, unit) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    if (!unit.open_time) {
      return res.status(400).json({ error: 'Unit is not in open-time mode' });
    }

    if (Number(unit.open_time_paused || 0) !== 1) {
      return res.status(400).json({ error: 'Open time is not paused' });
    }

    const baseElapsed = Math.max(0, Number(unit.open_time_elapsed_base_seconds || 0));
    db.run(
      'UPDATE units SET open_time_start = ?, open_time_paused = 0, open_time_paused_at = NULL, last_status_update = ? WHERE id = ?',
      [now, now, unitId],
      (resumeErr) => {
        if (resumeErr) return res.status(500).json({ error: resumeErr.message });

        if (global.broadcast) {
          global.broadcast({
            type: 'UNIT_UPDATE',
            unit: {
              id: parseInt(unitId, 10),
              open_time: 1,
              open_time_start: now,
              open_time_paused: 0,
              open_time_paused_at: null,
              open_time_elapsed_base_seconds: baseElapsed,
              open_time_elapsed: baseElapsed,
              open_time_amount: calculateOpenTimeAmount(baseElapsed, pricingSettings),
              status: unit.status || 'Active'
            }
          });
        }

        return res.json({
          message: 'Open time resumed',
          unit_id: parseInt(unitId, 10),
          resumed_at: now,
        });
      }
    );
    });
  });
});

// DELETE stop open-time session on a unit (admin only)
// Logs a transaction for the amount owed and resets the unit to Idle.
router.delete('/:id/open-time', requireAdminAuth, (req, res) => {
  const unitId = req.params.id;
  const stopTime = new Date().toISOString();

  loadFlatRateSettings(db, (pricingErr, pricingSettings) => {
    if (pricingErr) return res.status(500).json({ error: pricingErr.message });

    db.get('SELECT * FROM units WHERE id = ?', [unitId], (err, unit) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    if (!unit.open_time) {
      return res.status(400).json({ error: 'Unit is not in open-time mode' });
    }

      const metrics = getOpenTimeMetrics(unit, pricingSettings, new Date(stopTime).getTime());
    const elapsedSeconds = metrics.elapsedSeconds;
      const amountOwed = calculateOpenTimeAmount(elapsedSeconds, pricingSettings);
    const elapsedMinutes = parseFloat((elapsedSeconds / 60).toFixed(4));
    const newRevenue = Number(unit.total_revenue || 0) + Number(amountOwed || 0);

    db.run(
      'UPDATE units SET open_time = 0, open_time_start = NULL, open_time_paused = 0, open_time_paused_at = NULL, open_time_elapsed_base_seconds = 0, total_revenue = ?, status = ?, last_status_update = ? WHERE id = ?',
      [newRevenue, 'Idle', stopTime, unitId],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });

        // Log the session as a transaction (amount = pesos owed, denomination = elapsed minutes)
        db.run(
          'INSERT INTO transactions (unit_id, amount, denomination, timestamp, transaction_type) VALUES (?, ?, ?, ?, ?)',
          [unitId, amountOwed, elapsedMinutes, stopTime, 'open_time'],
          (txErr) => {
            if (txErr) console.error('Error recording open_time transaction:', txErr);
          }
        );

        if (global.broadcast) {
          global.broadcast({
            type: 'UNIT_UPDATE',
            unit: {
              id: parseInt(unitId),
              open_time: 0,
              open_time_start: null,
              open_time_paused: 0,
              open_time_paused_at: null,
              open_time_elapsed_base_seconds: 0,
              open_time_elapsed: 0,
              open_time_amount: 0,
              total_revenue: newRevenue,
              status: 'Idle',
              remaining_seconds: 0
            }
          });
        }

        res.json({
          message: 'Open time stopped',
          unit_id: parseInt(unitId),
          elapsed_seconds: elapsedSeconds,
          amount_owed: amountOwed,
          session_revenue: newRevenue
        });
      }
    );
    });
  });
});

// PUT update unit details
router.put('/:id', requireAdminAuth, (req, res) => {
  const { name, mac_address, ip_address } = req.body;
  const unitId = req.params.id;

  const updates = [];
  const values = [];

  if (typeof name !== 'undefined') {
    updates.push('name = ?');
    values.push(name);
  }
  if (typeof mac_address !== 'undefined') {
    updates.push('mac_address = ?');
    values.push(mac_address || null);
  }
  if (typeof ip_address !== 'undefined') {
    const trimmedIp = String(ip_address || '').trim();
    if (trimmedIp) {
      const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
      if (!ipv4Pattern.test(trimmedIp)) {
        return res.status(400).json({ error: 'Invalid IPv4 address format' });
      }
      updates.push('ip_address = ?');
      values.push(trimmedIp);
    } else {
      updates.push('ip_address = ?');
      values.push(null);
    }
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
