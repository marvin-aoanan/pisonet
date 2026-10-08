const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdminAuth } = require('../admin-auth');
const { calculateFlatRateAmountFromMinutes, loadFlatRateSettings } = require('../pricing');
const { normalizeMacAddress, sendWakeOnLan, persistWakeStatus } = require('../wake-on-lan');
const { getUnitOnlineState, normalizeIpv4Address } = require('../network-status');

const WOL_BROADCAST_ADDRESS = process.env.WOL_BROADCAST_ADDRESS || '255.255.255.255';
const WOL_PORT = parseInt(process.env.WOL_PORT || '9', 10);
const PAYMENT_METHOD_CASH = 'cash';
const PAYMENT_METHOD_GCASH = 'gcash';
const PAYMENT_STATUS_PENDING = 'pending';
const PAYMENT_STATUS_APPROVED = 'approved';
const PAYMENT_STATUS_REJECTED = 'rejected';

function parseApprover(value) {
  const normalized = String(value || '').trim();
  return normalized || 'Admin';
}

function parsePaymentMethod(value) {
  const method = String(value || PAYMENT_METHOD_CASH).trim().toLowerCase();
  if (method !== PAYMENT_METHOD_CASH && method !== PAYMENT_METHOD_GCASH) {
    return null;
  }
  return method;
}

function buildPcRentalPaymentReference(createdAtIso, id) {
  const safeDate = new Date(createdAtIso);
  const year = safeDate.getUTCFullYear();
  const month = String(safeDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getUTCDate()).padStart(2, '0');
  return `PCR-${year}${month}${day}-${String(id).padStart(6, '0')}`;
}

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

async function enrichUnitForDashboard(unit, pricingSettings, nowMs = Date.now()) {
  const onlineState = await getUnitOnlineState({
    unitId: unit.id,
    ipAddress: unit.ip_address,
    websocketConnected: typeof global.isUnitConnected === 'function' && global.isUnitConnected(unit.id),
  });

  if (unit.open_time) {
    const metrics = getOpenTimeMetrics(unit, pricingSettings, nowMs);
    return {
      ...unit,
      open_time_paused: metrics.isPaused ? 1 : 0,
      open_time_elapsed: metrics.elapsedSeconds,
      open_time_amount: metrics.amountOwed,
      ...onlineState,
    };
  }

  return {
    ...unit,
    open_time_paused: 0,
    open_time_elapsed: 0,
    open_time_amount: 0,
    ...onlineState,
  };
}

function broadcastUnitUpdate(unitId, fields = {}) {
  if (!global.broadcast) {
    return;
  }

  global.broadcast({
    type: 'UNIT_UPDATE',
    unit: {
      id: Number(unitId),
      ...fields,
    },
  });
}

async function persistWakeStatusAndBroadcast(unitId, status, message, extraFields = {}) {
  const persisted = await persistWakeStatus(db, unitId, {
    status,
    message,
    attemptedAt: new Date().toISOString(),
  });

  broadcastUnitUpdate(unitId, {
    last_wake_status: persisted.status,
    last_wake_message: persisted.message,
    last_wake_at: persisted.attemptedAt,
    ...extraFields,
  });

  return persisted;
}

function logHardwareAction(unitId, action, status) {
  db.run(
    'INSERT INTO hardware_log (unit_id, action, timestamp, status) VALUES (?, ?, ?, ?)',
    [unitId, action, new Date().toISOString(), status],
    (err) => {
      if (err) {
        console.error('Error logging hardware action:', err);
      }
    }
  );
}

// GET all units with session info
router.get('/', (req, res) => {
  loadFlatRateSettings(db, (pricingErr, pricingSettings) => {
    if (pricingErr) {
      return res.status(500).json({ error: pricingErr.message });
    }

    db.all(`
      SELECT u.*, 
             (SELECT COUNT(*) FROM sessions WHERE unit_id = u.id AND status = 'active') as active_sessions,
             (SELECT COALESCE(SUM(COALESCE(duration_seconds, 0)), 0) FROM sessions WHERE unit_id = u.id) as total_used_seconds
      FROM units u 
      ORDER BY u.id
    `, [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      (async () => {
        const now = Date.now();
        const enriched = await Promise.all((rows || []).map((row) => enrichUnitForDashboard(row, pricingSettings, now)));
        res.json(enriched);
      })().catch((enrichErr) => {
        res.status(500).json({ error: enrichErr.message });
      });
    });
  });
});

// GET unit by client IP address (used by diskless clients in 192.168.254.151-160 range)
router.get('/by-ip/:ip', (req, res) => {
  const ip = req.params.ip;
  db.get('SELECT * FROM units WHERE ip_address = ?', [ip], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: `No unit found for IP ${ip}` });
    res.json(row);
  });
});

// GET single unit with detailed info
router.get('/:id', (req, res, next) => {
  const unitId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(unitId) || unitId <= 0) {
    return next();
  }
  
  db.get(`
    SELECT u.*, 
           (SELECT COUNT(*) FROM sessions WHERE unit_id = u.id AND status = 'active') as active_sessions,
           (SELECT SUM(amount) FROM transactions WHERE unit_id = u.id) as total_transactions,
           (SELECT COALESCE(SUM(COALESCE(duration_seconds, 0)), 0) FROM sessions WHERE unit_id = u.id) as total_used_seconds
    FROM units u 
    WHERE u.id = ?
  `, [unitId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    loadFlatRateSettings(db, (pricingErr, pricingSettings) => {
      if (pricingErr) {
        return res.status(500).json({ error: pricingErr.message });
      }

      enrichUnitForDashboard(row, pricingSettings)
        .then((unit) => res.json(unit))
        .catch((enrichErr) => res.status(500).json({ error: enrichErr.message }));
    });
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
function adjustUnitByMinutes(unitId, minutes, description, options = {}, done) {
  if (typeof options === 'function') {
    done = options;
    options = {};
  }

  const unitIdNumber = parseInt(unitId, 10);
  const deltaSeconds = Math.round(minutes * 60);
  const paymentMethod = parsePaymentMethod(options.paymentMethod) || PAYMENT_METHOD_CASH;
  const paymentStatus = String(options.paymentStatus || PAYMENT_STATUS_APPROVED).trim().toLowerCase();
  const paymentReference = options.paymentReference == null ? null : String(options.paymentReference).trim() || null;
  const approvedBy = options.approvedBy == null ? null : String(options.approvedBy).trim() || null;
  const approvedAt = options.approvedAt == null ? null : String(options.approvedAt).trim() || null;

  db.get('SELECT * FROM units WHERE id = ?', [unitIdNumber], (err, unit) => {
    if (err) {
      return done(err);
    }

    if (!unit) {
      return done({ status: 404, message: 'Unit not found' });
    }

    const newSeconds = Math.max(0, (unit.remaining_seconds || 0) + deltaSeconds);
    const newStatus = newSeconds > 0 ? 'Active' : 'Idle';
    const newTimerPaused = newSeconds > 0 ? Number(unit.timer_paused || 0) : 0;
    const startsNewSession = Number(unit.remaining_seconds || 0) <= 0 && Number(unit.open_time || 0) !== 1 && newSeconds > 0;
    const newRevenue = startsNewSession ? 0 : Number(unit.total_revenue || 0);

    db.run(
      'UPDATE units SET remaining_seconds = ?, total_revenue = ?, status = ?, timer_paused = ?, last_status_update = ? WHERE id = ?',
      [newSeconds, newRevenue, newStatus, newTimerPaused, new Date().toISOString(), unitIdNumber],
      (updateErr) => {
        if (updateErr) {
          return done(updateErr);
        }

        // Log admin time adjustment as a transaction (amount = signed minutes)
        db.run(
          `INSERT INTO transactions (
             unit_id,
             amount,
             denomination,
             timestamp,
             transaction_type,
             description,
             payment_method,
             payment_status,
             payment_reference,
             approved_by,
             approved_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            unitIdNumber,
            minutes,
            minutes,
            new Date().toISOString(),
            minutes > 0 ? 'admin_add' : 'admin_deduct',
            description || null,
            paymentMethod,
            paymentStatus,
            paymentReference,
            approvedBy,
            approvedAt,
          ],
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
              id: unitIdNumber,
              remaining_seconds: newSeconds,
              timer_paused: newTimerPaused,
              total_revenue: newRevenue,
              status: newStatus
            }
          });
        }

        return done(null, {
          unit_id: unitIdNumber,
          delta_minutes: minutes,
          delta_seconds: deltaSeconds,
          new_remaining_seconds: newSeconds,
          status: newStatus
        });
      }
    );
  });
}

function createPcRentalPaymentRequest({ unitId, minutes, amount, paymentReference, description, createdBy }, done) {
  const createdAt = new Date().toISOString();
  const pendingReference = `PENDING-PCR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  db.run(
    `INSERT INTO pc_rental_payment_requests (
       reference_no,
       unit_id,
       minutes,
       amount,
       payment_method,
       payment_reference,
       description,
       status,
       created_by,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      pendingReference,
      unitId,
      minutes,
      amount,
      PAYMENT_METHOD_GCASH,
      paymentReference || null,
      description || null,
      PAYMENT_STATUS_PENDING,
      createdBy || null,
      createdAt,
    ],
    function(insertErr) {
      if (insertErr) {
        return done(insertErr);
      }

      const id = Number(this.lastID || 0);
      const referenceNo = buildPcRentalPaymentReference(createdAt, id);

      db.run(
        'UPDATE pc_rental_payment_requests SET reference_no = ? WHERE id = ?',
        [referenceNo, id],
        (updateErr) => {
          if (updateErr) {
            return done(updateErr);
          }

          return done(null, {
            id,
            reference_no: referenceNo,
            unit_id: unitId,
            minutes,
            amount,
            payment_method: PAYMENT_METHOD_GCASH,
            payment_reference: paymentReference || null,
            status: PAYMENT_STATUS_PENDING,
            created_at: createdAt,
          });
        }
      );
    }
  );
}

router.post('/:id/adjust-time', requireAdminAuth, (req, res) => {
  const unitId = req.params.id;
  const minutes = Number(req.body?.minutes);
  const description = String(req.body?.description || '').trim();
  const paymentMethod = parsePaymentMethod(req.body?.payment_method);
  const paymentReference = req.body?.payment_reference == null ? null : String(req.body.payment_reference).trim();
  const actor = parseApprover(req.body?.approved_by || req.body?.created_by || req.body?.admin_name);

  if (!Number.isFinite(minutes) || minutes === 0) {
    return res.status(400).json({ error: 'Invalid minutes. Provide a non-zero numeric value.' });
  }

  if (!paymentMethod) {
    return res.status(400).json({ error: 'payment_method must be either cash or gcash' });
  }

  if (paymentReference != null && paymentReference.length > 120) {
    return res.status(400).json({ error: 'payment_reference max length is 120' });
  }

  if (minutes > 0 && paymentMethod === PAYMENT_METHOD_GCASH) {
    return loadFlatRateSettings(db, (pricingErr, pricingSettings) => {
      if (pricingErr) {
        return res.status(500).json({ error: pricingErr.message });
      }

      db.get('SELECT id, name FROM units WHERE id = ?', [unitId], (unitErr, unit) => {
        if (unitErr) {
          return res.status(500).json({ error: unitErr.message });
        }

        if (!unit) {
          return res.status(404).json({ error: 'Unit not found' });
        }

        const amount = calculateFlatRateAmountFromMinutes(Math.abs(minutes), pricingSettings, { minimumCharge: false });
        createPcRentalPaymentRequest(
          {
            unitId: Number(unit.id),
            minutes: Math.abs(Math.round(minutes)),
            amount,
            paymentReference,
            description,
            createdBy: actor,
          },
          (requestErr, requestRow) => {
            if (requestErr) {
              return res.status(500).json({ error: requestErr.message });
            }

            return res.status(202).json({
              message: 'GCash payment request created and pending manual approval',
              payment_status: PAYMENT_STATUS_PENDING,
              data: requestRow,
            });
          }
        );
      });
    });
  }

  adjustUnitByMinutes(unitId, minutes, description, {
    paymentMethod,
    paymentStatus: PAYMENT_STATUS_APPROVED,
    paymentReference,
    approvedBy: actor,
    approvedAt: new Date().toISOString(),
  }, (adjustErr, result) => {
    if (adjustErr) {
      if (adjustErr.status) {
        return res.status(adjustErr.status).json({ error: adjustErr.message });
      }
      return res.status(500).json({ error: adjustErr.message });
    }

    return res.json({
      message: 'Timer adjusted successfully',
      ...result,
    });
  });
});

router.post('/adjust-time/bulk', requireAdminAuth, (req, res) => {
  const minutes = Number(req.body?.minutes);
  const description = String(req.body?.description || '').trim();
  const unitIdsRaw = Array.isArray(req.body?.unit_ids) ? req.body.unit_ids : [];
  const paymentMethod = parsePaymentMethod(req.body?.payment_method);
  const paymentReference = req.body?.payment_reference == null ? null : String(req.body.payment_reference).trim();
  const actor = parseApprover(req.body?.approved_by || req.body?.created_by || req.body?.admin_name);

  if (!Number.isFinite(minutes) || minutes === 0) {
    return res.status(400).json({ error: 'Invalid minutes. Provide a non-zero numeric value.' });
  }

  if (!paymentMethod) {
    return res.status(400).json({ error: 'payment_method must be either cash or gcash' });
  }

  if (paymentReference != null && paymentReference.length > 120) {
    return res.status(400).json({ error: 'payment_reference max length is 120' });
  }

  const unitIds = [...new Set(unitIdsRaw.map((id) => parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!unitIds.length) {
    return res.status(400).json({ error: 'unit_ids must contain at least one valid unit id.' });
  }

  const results = [];
  const failures = [];

  if (minutes > 0 && paymentMethod === PAYMENT_METHOD_GCASH) {
    return loadFlatRateSettings(db, (pricingErr, pricingSettings) => {
      if (pricingErr) {
        return res.status(500).json({ error: pricingErr.message });
      }

      const pendingResults = [];
      const pendingFailures = [];
      const roundedMinutes = Math.abs(Math.round(minutes));
      const amount = calculateFlatRateAmountFromMinutes(roundedMinutes, pricingSettings, { minimumCharge: false });

      const processPending = (index) => {
        if (index >= unitIds.length) {
          const successCount = pendingResults.length;
          const failureCount = pendingFailures.length;
          const hasFailure = failureCount > 0;

          return res.status(hasFailure ? 207 : 202).json({
            message: hasFailure
              ? 'Bulk GCash payment requests created with partial failures'
              : 'Bulk GCash payment requests created and pending manual approval',
            payment_status: PAYMENT_STATUS_PENDING,
            unit_count: unitIds.length,
            success_count: successCount,
            failure_count: failureCount,
            results: pendingResults,
            failures: pendingFailures,
          });
        }

        const unitId = unitIds[index];
        db.get('SELECT id FROM units WHERE id = ?', [unitId], (unitErr, unit) => {
          if (unitErr) {
            pendingFailures.push({ unit_id: unitId, error: unitErr.message || 'Failed to load unit' });
            return processPending(index + 1);
          }

          if (!unit) {
            pendingFailures.push({ unit_id: unitId, error: 'Unit not found' });
            return processPending(index + 1);
          }

          createPcRentalPaymentRequest({
            unitId,
            minutes: roundedMinutes,
            amount,
            paymentReference,
            description,
            createdBy: actor,
          }, (requestErr, requestRow) => {
            if (requestErr) {
              pendingFailures.push({ unit_id: unitId, error: requestErr.message || 'Failed to create payment request' });
            } else {
              pendingResults.push(requestRow);
            }
            processPending(index + 1);
          });
        });
      };

      processPending(0);
    });
  }

  const processNext = (index) => {
    if (index >= unitIds.length) {
      const successCount = results.length;
      const failureCount = failures.length;
      const hasFailure = failureCount > 0;

      return res.status(hasFailure ? 207 : 200).json({
        message: hasFailure ? 'Bulk timer adjustment completed with partial failures' : 'Bulk timer adjustment completed',
        delta_minutes: minutes,
        unit_count: unitIds.length,
        success_count: successCount,
        failure_count: failureCount,
        results,
        failures,
      });
    }

    const unitId = unitIds[index];
    adjustUnitByMinutes(unitId, minutes, description, {
      paymentMethod,
      paymentStatus: PAYMENT_STATUS_APPROVED,
      paymentReference,
      approvedBy: actor,
      approvedAt: new Date().toISOString(),
    }, (adjustErr, result) => {
      if (adjustErr) {
        failures.push({
          unit_id: unitId,
          error: adjustErr.message || 'Failed to adjust timer',
        });
      } else {
        results.push(result);
      }
      processNext(index + 1);
    });
  };

  processNext(0);
});

router.get('/payment-requests/pending', requireAdminAuth, (req, res) => {
  db.all(
    `SELECT r.id, r.reference_no, r.unit_id, u.name AS unit_name, r.minutes, r.amount, r.payment_method, r.payment_reference, r.description, r.status, r.created_by, r.created_at
     FROM pc_rental_payment_requests r
     JOIN units u ON u.id = r.unit_id
     WHERE r.status = ? AND r.payment_method = ?
     ORDER BY r.created_at ASC`,
    [PAYMENT_STATUS_PENDING, PAYMENT_METHOD_GCASH],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const pendingAmount = (rows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
      return res.json({
        status: 'success',
        data: rows || [],
        meta: {
          count: Number((rows || []).length),
          pending_amount: Number(pendingAmount.toFixed(2)),
        },
      });
    }
  );
});

router.get('/payment-summary', requireAdminAuth, (req, res) => {
  loadFlatRateSettings(db, (pricingErr, pricingSettings) => {
    if (pricingErr) {
      return res.status(500).json({ error: pricingErr.message });
    }

    db.all(
      `SELECT transaction_type, amount, payment_method, payment_status, approved_by, approved_at
       FROM transactions
       WHERE transaction_type = 'admin_add'
         AND payment_status = 'approved'
         AND approved_by IS NOT NULL
         AND approved_at IS NOT NULL`,
      [],
      (txErr, txRows) => {
        if (txErr) {
          return res.status(500).json({ error: txErr.message });
        }

        db.all(
          `SELECT amount, status
           FROM pc_rental_payment_requests
           WHERE payment_method = ?`,
          [PAYMENT_METHOD_GCASH],
          (reqErr, requestRows) => {
            if (reqErr) {
              return res.status(500).json({ error: reqErr.message });
            }

            const summary = {
              cash_approved: 0,
              gcash_approved: 0,
              gcash_pending: 0,
              gcash_rejected: 0,
            };

            (txRows || []).forEach((row) => {
              const method = String(row.payment_method || PAYMENT_METHOD_CASH).toLowerCase();
              const status = String(row.payment_status || PAYMENT_STATUS_APPROVED).toLowerCase();
              const minutes = Number(row.amount || 0);
              if (minutes <= 0 || status !== PAYMENT_STATUS_APPROVED) {
                return;
              }

              const pesoAmount = calculateFlatRateAmountFromMinutes(minutes, pricingSettings, { minimumCharge: false });

              if (method === PAYMENT_METHOD_CASH) {
                summary.cash_approved += pesoAmount;
              }
              if (method === PAYMENT_METHOD_GCASH) {
                summary.gcash_approved += pesoAmount;
              }
            });

            (requestRows || []).forEach((row) => {
              const amount = Number(row.amount || 0);
              const status = String(row.status || '').toLowerCase();
              if (amount <= 0) {
                return;
              }

              if (status === PAYMENT_STATUS_PENDING) {
                summary.gcash_pending += amount;
              }
              if (status === PAYMENT_STATUS_REJECTED) {
                summary.gcash_rejected += amount;
              }
            });

            return res.json({
              status: 'success',
              data: {
                cash_approved: Number(summary.cash_approved.toFixed(2)),
                gcash_approved: Number(summary.gcash_approved.toFixed(2)),
                gcash_pending: Number(summary.gcash_pending.toFixed(2)),
                gcash_rejected: Number(summary.gcash_rejected.toFixed(2)),
              },
            });
          }
        );
      }
    );
  });
});

router.post('/payment-requests/:id/approve-gcash', requireAdminAuth, (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  const approvedBy = parseApprover(req.body?.approved_by || req.body?.approver || req.body?.admin_name);
  const approvalNotes = req.body?.approval_notes == null ? null : String(req.body.approval_notes).trim();
  const approvedAt = new Date().toISOString();

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid request id' });
  }

  db.get(
    `SELECT * FROM pc_rental_payment_requests WHERE id = ?`,
    [requestId],
    (fetchErr, requestRow) => {
      if (fetchErr) {
        return res.status(500).json({ error: fetchErr.message });
      }

      if (!requestRow) {
        return res.status(404).json({ error: 'Payment request not found' });
      }

      if (String(requestRow.status || '').toLowerCase() !== PAYMENT_STATUS_PENDING) {
        return res.status(409).json({ error: 'Payment request is no longer pending' });
      }

      adjustUnitByMinutes(
        requestRow.unit_id,
        Number(requestRow.minutes || 0),
        String(requestRow.description || '').trim(),
        {
          paymentMethod: PAYMENT_METHOD_GCASH,
          paymentStatus: PAYMENT_STATUS_APPROVED,
          paymentReference: requestRow.payment_reference || null,
          approvedBy,
          approvedAt,
        },
        (adjustErr, result) => {
          if (adjustErr) {
            if (adjustErr.status) {
              return res.status(adjustErr.status).json({ error: adjustErr.message });
            }
            return res.status(500).json({ error: adjustErr.message });
          }

          db.run(
            `UPDATE pc_rental_payment_requests
             SET status = ?, processed_by = ?, processed_at = ?, processing_notes = ?
             WHERE id = ?`,
            [PAYMENT_STATUS_APPROVED, approvedBy, approvedAt, approvalNotes || null, requestId],
            (updateErr) => {
              if (updateErr) {
                return res.status(500).json({ error: updateErr.message });
              }

              return res.json({
                status: 'success',
                message: 'PC rental GCash payment approved and time added',
                data: {
                  request_id: requestId,
                  unit_id: requestRow.unit_id,
                  reference_no: requestRow.reference_no,
                  payment_status: PAYMENT_STATUS_APPROVED,
                  approved_by: approvedBy,
                  approved_at: approvedAt,
                  adjustment: result,
                },
              });
            }
          );
        }
      );
    }
  );
});

router.post('/payment-requests/:id/reject-gcash', requireAdminAuth, (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  const approvedBy = parseApprover(req.body?.approved_by || req.body?.approver || req.body?.admin_name);
  const approvalNotes = req.body?.approval_notes == null ? null : String(req.body.approval_notes).trim();
  const processedAt = new Date().toISOString();

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid request id' });
  }

  db.get(
    `SELECT * FROM pc_rental_payment_requests WHERE id = ?`,
    [requestId],
    (fetchErr, requestRow) => {
      if (fetchErr) {
        return res.status(500).json({ error: fetchErr.message });
      }

      if (!requestRow) {
        return res.status(404).json({ error: 'Payment request not found' });
      }

      if (String(requestRow.status || '').toLowerCase() !== PAYMENT_STATUS_PENDING) {
        return res.status(409).json({ error: 'Payment request is no longer pending' });
      }

      db.run(
        `UPDATE pc_rental_payment_requests
         SET status = ?, processed_by = ?, processed_at = ?, processing_notes = ?
         WHERE id = ?`,
        [PAYMENT_STATUS_REJECTED, approvedBy, processedAt, approvalNotes || null, requestId],
        (updateErr) => {
          if (updateErr) {
            return res.status(500).json({ error: updateErr.message });
          }

          return res.json({
            status: 'success',
            message: 'PC rental GCash payment request rejected',
            data: {
              request_id: requestId,
              unit_id: requestRow.unit_id,
              reference_no: requestRow.reference_no,
              payment_status: PAYMENT_STATUS_REJECTED,
              approved_by: approvedBy,
              approved_at: processedAt,
            },
          });
        }
      );
    }
  );
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

router.post('/:id/wake', requireAdminAuth, (req, res) => {
  const unitId = parseInt(req.params.id, 10);

  db.get('SELECT * FROM units WHERE id = ?', [unitId], (err, unit) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    (async () => {
      const onlineState = await getUnitOnlineState({
        unitId,
        ipAddress: unit.ip_address,
        websocketConnected: typeof global.isUnitConnected === 'function' && global.isUnitConnected(unitId),
      });

      if (onlineState.is_online) {
        const message = `Unit already online via ${onlineState.online_source}. Wake skipped.`;
        const persisted = await persistWakeStatusAndBroadcast(unitId, 'skipped', message, onlineState);
        logHardwareAction(unitId, 'wake_test', 'skipped');

        return res.json({
          message,
          unit_id: unitId,
          wake_on_lan: {
            attempted: false,
            status: 'skipped',
            reason: 'unit_online',
            message,
            attempted_at: persisted.attemptedAt,
            ...onlineState,
          },
        });
      }

      const normalizedMacAddress = normalizeMacAddress(unit.mac_address);
      if (!normalizedMacAddress) {
        const message = 'Missing or invalid MAC address. Save a valid MAC address before testing Wake-on-LAN.';
        const persisted = await persistWakeStatusAndBroadcast(unitId, 'failed', message, onlineState);
        logHardwareAction(unitId, 'wake_test', 'failed');

        return res.status(400).json({
          error: message,
          unit_id: unitId,
          wake_on_lan: {
            attempted: false,
            status: 'failed',
            reason: 'missing_or_invalid_mac',
            message,
            attempted_at: persisted.attemptedAt,
            ...onlineState,
          },
        });
      }

      try {
        const result = await sendWakeOnLan(normalizedMacAddress, {
          address: WOL_BROADCAST_ADDRESS,
          port: WOL_PORT,
        });
        const message = `Magic packet sent to ${result.macAddress} via ${result.address}:${result.port}`;
        const persisted = await persistWakeStatusAndBroadcast(unitId, 'sent', message, onlineState);
        logHardwareAction(unitId, 'wake_test', 'sent');

        if (global.broadcast) {
          global.broadcast({
            type: 'WAKE_ON_LAN_SENT',
            unit_id: unitId,
            mac_address: result.macAddress,
            address: result.address,
            port: result.port,
            message,
            last_wake_status: persisted.status,
            last_wake_at: persisted.attemptedAt,
          });
        }

        return res.json({
          message,
          unit_id: unitId,
          wake_on_lan: {
            attempted: true,
            status: 'sent',
            reason: 'sent',
            message,
            attempted_at: persisted.attemptedAt,
            ...result,
            ...onlineState,
          },
        });
      } catch (wakeError) {
        const message = wakeError.message || 'Wake-on-LAN send failed';
        const persisted = await persistWakeStatusAndBroadcast(unitId, 'failed', message, onlineState);
        logHardwareAction(unitId, 'wake_test', 'failed');

        if (global.broadcast) {
          global.broadcast({
            type: 'WAKE_ON_LAN_FAILED',
            unit_id: unitId,
            error: message,
            last_wake_status: persisted.status,
            last_wake_at: persisted.attemptedAt,
          });
        }

        return res.status(500).json({
          error: message,
          unit_id: unitId,
          wake_on_lan: {
            attempted: true,
            status: 'failed',
            reason: 'failed',
            message,
            attempted_at: persisted.attemptedAt,
            ...onlineState,
          },
        });
      }
    })().catch((wakeErr) => {
      res.status(500).json({ error: wakeErr.message });
    });
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
  const { name, mac_address, ip_address, status_mode } = req.body;
  const unitId = req.params.id;

  const updates = [];
  const values = [];

  if (typeof name !== 'undefined') {
    updates.push('name = ?');
    values.push(name);
  }
  if (typeof mac_address !== 'undefined') {
    const trimmedMac = String(mac_address || '').trim();
    if (trimmedMac) {
      const normalizedMac = normalizeMacAddress(trimmedMac);
      if (!normalizedMac) {
        return res.status(400).json({ error: 'Invalid MAC address format' });
      }
      updates.push('mac_address = ?');
      values.push(normalizedMac);
    } else {
      updates.push('mac_address = ?');
      values.push(null);
    }
  }
  if (typeof ip_address !== 'undefined') {
    const normalizedIp = normalizeIpv4Address(ip_address);
    if (String(ip_address || '').trim()) {
      if (!normalizedIp) {
        return res.status(400).json({ error: 'Invalid IPv4 address format' });
      }
      updates.push('ip_address = ?');
      values.push(normalizedIp);
    } else {
      updates.push('ip_address = ?');
      values.push(null);
    }
  }
  if (typeof status_mode !== 'undefined') {
    const normalizedStatusMode = String(status_mode || '').trim().toLowerCase();
    if (!['active', 'maintenance'].includes(normalizedStatusMode)) {
      return res.status(400).json({ error: 'Invalid status mode. Must be active or maintenance.' });
    }
    updates.push('status_mode = ?');
    values.push(normalizedStatusMode);
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
