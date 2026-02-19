const express = require('express');
const router = express.Router();
const db = require('../database');

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
    
    res.json(settings);
  });
});

// GET single setting
router.get('/:key', (req, res) => {
  const key = req.params.key;
  
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
