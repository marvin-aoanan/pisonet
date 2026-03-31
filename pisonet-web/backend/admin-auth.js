const crypto = require('crypto');
const db = require('./database');

const HASH_PREFIX = 'pbkdf2$';
const PBKDF2_ITERATIONS = 120000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

function toSafeString(value) {
  return typeof value === 'string' ? value : '';
}

function timingSafeEqualStrings(a, b) {
  const left = Buffer.from(toSafeString(a), 'utf8');
  const right = Buffer.from(toSafeString(b), 'utf8');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');

  return `${HASH_PREFIX}${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

function verifyHashedPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith(HASH_PREFIX)) {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 4) {
    return false;
  }

  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expectedHashHex = parts[3];

  if (!Number.isInteger(iterations) || iterations <= 0 || !salt || !expectedHashHex) {
    return false;
  }

  const computedHashHex = crypto
    .pbkdf2Sync(password, salt, iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');

  return timingSafeEqualStrings(computedHashHex, expectedHashHex);
}

function getEnvAdminPassword() {
  return toSafeString(process.env.ADMIN_PASSWORD);
}

function getStoredAdminHash(callback) {
  db.get('SELECT value FROM settings WHERE key = ?', ['admin_password_hash'], (err, row) => {
    if (err) {
      return callback(err);
    }

    const value = toSafeString(row?.value);
    return callback(null, value || null);
  });
}

function validateAdminPassword(password, callback) {
  const provided = toSafeString(password);
  if (!provided) {
    return callback(null, false);
  }

  getStoredAdminHash((err, storedHash) => {
    if (err) {
      return callback(err);
    }

    if (storedHash) {
      return callback(null, verifyHashedPassword(provided, storedHash));
    }

    const envPassword = getEnvAdminPassword();
    if (!envPassword) {
      return callback(null, false);
    }

    return callback(null, timingSafeEqualStrings(provided, envPassword));
  });
}

function requireAdminAuth(req, res, next) {
  const headerPassword = req.headers['x-admin-password'];
  const bodyPassword = req.body?.adminPassword;
  const providedPassword = toSafeString(headerPassword || bodyPassword);

  validateAdminPassword(providedPassword, (err, isValid) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to validate admin password' });
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    return next();
  });
}

module.exports = {
  hashPassword,
  validateAdminPassword,
  requireAdminAuth
};
