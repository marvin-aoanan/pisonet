const Database = require('better-sqlite3');
const crypto = require('crypto');

// Open database
const db = new Database('pisonet.db');

// Create settings table if it doesn't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`).run();

// Reset password to admin123
const DEFAULT_PASSWORD = 'admin123';
const passwordHash = crypto.createHash('sha256').update(DEFAULT_PASSWORD).digest('hex');

const stmt = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = ?
`);
stmt.run('password_hash', passwordHash, passwordHash);

console.log('Password has been reset to: admin123');
console.log('Hash:', passwordHash);

db.close();
