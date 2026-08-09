const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

function resolveDatabasePath(configPath) {
  if (!configPath) {
    return path.join(__dirname, 'pisonet.db');
  }

  if (path.isAbsolute(configPath)) {
    return configPath;
  }

  return path.resolve(__dirname, configPath);
}

const dbPath = resolveDatabasePath(process.env.DATABASE_PATH);
const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist');
const AUTO_BACKUP_INTERVAL_MS = 30 * 60 * 1000;
const AUTO_BACKUP_DIR = path.join(path.dirname(dbPath), 'backups', 'auto');

let sqlDb = null;
let SqlJsModule = null;
let saveTimer = null;
let pendingSave = false;
let autoBackupTimer = null;

function buildCorruptDbPath() {
  const parsedPath = path.parse(dbPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(parsedPath.dir, `${parsedPath.name}.corrupt-${timestamp}${parsedPath.ext}`);
}

function buildBackupDbPath(targetPath = dbPath) {
  return `${targetPath}.bak`;
}

function buildAutoBackupPath() {
  const parsedPath = path.parse(dbPath);
  return path.join(AUTO_BACKUP_DIR, `${parsedPath.name}.auto${parsedPath.ext}`);
}

function writeDatabaseFileAtomically(targetPath, dataBuffer) {
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  const backupPath = buildBackupDbPath(targetPath);

  try {
    const fd = fs.openSync(tempPath, 'w');
    try {
      fs.writeFileSync(fd, dataBuffer);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    if (fs.existsSync(targetPath)) {
      fs.copyFileSync(targetPath, backupPath);
    }

    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { force: true });
    }

    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { force: true });
      }
    } catch (cleanupErr) {
      console.warn('⚠️ Failed to clean up temporary database file:', cleanupErr);
    }
    throw err;
  }
}

function quarantineInvalidDatabaseFile(loadErr) {
  const corruptPath = buildCorruptDbPath();

  try {
    fs.renameSync(dbPath, corruptPath);
    console.warn(`⚠️ Invalid SQLite database detected. Moved corrupt file to ${corruptPath}`);
  } catch (renameErr) {
    console.warn('⚠️ Invalid SQLite database detected, but failed to quarantine the file:', renameErr);
  }

  console.warn('⚠️ Starting with a fresh SQLite database after load failure:', loadErr);
  sqlDb = new SqlJsModule.Database();
}

function loadDatabaseFile(SQL) {
  const candidatePaths = [dbPath, buildBackupDbPath(dbPath)];

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    try {
      const fileBuffer = fs.readFileSync(candidatePath);
      const candidateDb = new SQL.Database(new Uint8Array(fileBuffer));
      candidateDb.exec('SELECT name FROM sqlite_master LIMIT 1;');

      if (candidatePath !== dbPath) {
        writeDatabaseFileAtomically(dbPath, Buffer.from(candidateDb.export()));
        console.warn(`⚠️ Recovered database from backup: ${candidatePath}`);
      }

      return candidateDb;
    } catch (validationErr) {
      continue;
    }
  }

  quarantineInvalidDatabaseFile(new Error('No valid database snapshot was available'));
  return sqlDb;
}

function writeCurrentDbToFile(targetPath) {
  if (!sqlDb) {
    throw new Error('Database is not initialized');
  }

  const data = sqlDb.export();
  writeDatabaseFileAtomically(targetPath, Buffer.from(data));
}

function performAutoBackup() {
  if (!sqlDb) {
    return;
  }

  try {
    fs.mkdirSync(AUTO_BACKUP_DIR, { recursive: true });
    const autoBackupPath = buildAutoBackupPath();
    writeCurrentDbToFile(autoBackupPath);
    console.log(`💾 Auto backup saved: ${autoBackupPath}`);
  } catch (backupErr) {
    console.error('⚠️ Auto backup failed:', backupErr);
  }
}

function startAutoBackupScheduler() {
  if (autoBackupTimer) {
    return;
  }

  autoBackupTimer = setInterval(() => {
    performAutoBackup();
  }, AUTO_BACKUP_INTERVAL_MS);

  if (typeof autoBackupTimer.unref === 'function') {
    autoBackupTimer.unref();
  }
}

function scheduleSave() {
  pendingSave = true;
  if (saveTimer) {
    return;
  }

  saveTimer = setTimeout(() => {
    if (pendingSave && sqlDb) {
      const data = sqlDb.export();
      writeDatabaseFileAtomically(dbPath, Buffer.from(data));
    }
    pendingSave = false;
    saveTimer = null;
  }, 2000);
}

function normalizeParams(params, cb) {
  if (typeof params === 'function') {
    return { params: undefined, cb: params };
  }
  return { params, cb };
}

function getLastInsertId() {
  const stmt = sqlDb.prepare('SELECT last_insert_rowid() as id');
  const row = stmt.getAsObject();
  stmt.free();
  return row && row.id ? row.id : 0;
}

const db = {
  ready: null,
  snapshotToFile(targetPath) {
    writeCurrentDbToFile(targetPath);
  },
  restoreFromFile(sourcePath) {
    if (!SqlJsModule) {
      throw new Error('SQL.js module is not initialized');
    }

    if (!fs.existsSync(sourcePath)) {
      throw new Error('Backup file not found');
    }

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    pendingSave = false;

    const fileBuffer = fs.readFileSync(sourcePath);
    sqlDb = new SqlJsModule.Database(new Uint8Array(fileBuffer));

    scheduleSave();
  },
  serialize(fn) {
    fn();
  },
  run(sql, params, cb) {
    const { params: boundParams, cb: callback } = normalizeParams(params, cb);
    try {
      const stmt = sqlDb.prepare(sql);
      stmt.run(boundParams || []);
      stmt.free();

      const info = {
        changes: sqlDb.getRowsModified(),
        lastID: getLastInsertId()
      };

      scheduleSave();

      if (callback) {
        process.nextTick(() => callback.call(info, null));
      }

      return info;
    } catch (err) {
      if (callback) {
        process.nextTick(() => callback(err));
        return null;
      }
      throw err;
    }
  },
  get(sql, params, cb) {
    const { params: boundParams, cb: callback } = normalizeParams(params, cb);
    try {
      const stmt = sqlDb.prepare(sql);
      stmt.bind(boundParams || []);
      let row = null;
      if (stmt.step()) {
        row = stmt.getAsObject();
      }
      stmt.free();

      if (callback) {
        process.nextTick(() => callback(null, row));
      }

      return row;
    } catch (err) {
      if (callback) {
        process.nextTick(() => callback(err));
        return null;
      }
      throw err;
    }
  },
  all(sql, params, cb) {
    const { params: boundParams, cb: callback } = normalizeParams(params, cb);
    try {
      const stmt = sqlDb.prepare(sql);
      stmt.bind(boundParams || []);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();

      if (callback) {
        process.nextTick(() => callback(null, rows));
      }

      return rows;
    } catch (err) {
      if (callback) {
        process.nextTick(() => callback(err));
        return null;
      }
      throw err;
    }
  },
  prepare(sql) {
    const stmt = sqlDb.prepare(sql);
    return {
      run(...args) {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        const result = stmt.run(params);
        scheduleSave();
        return result;
      },
      finalize() {
        stmt.free();
      }
    };
  }
};

function initializeDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS units (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        status TEXT DEFAULT 'Idle',
        remaining_seconds INTEGER DEFAULT 0,
        total_revenue REAL DEFAULT 0,
        mac_address TEXT,
        ip_address TEXT,
        last_status_update TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Backward-compatible migration for existing databases created before ip_address existed.
    db.run('ALTER TABLE units ADD COLUMN ip_address TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding units.ip_address column:', err);
      }
    });

    // Backward-compatible migration for open-time session tracking.
    db.run('ALTER TABLE units ADD COLUMN open_time INTEGER DEFAULT 0', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding units.open_time column:', err);
      }
    });
    db.run('ALTER TABLE units ADD COLUMN open_time_start TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding units.open_time_start column:', err);
      }
    });
    db.run('ALTER TABLE units ADD COLUMN open_time_paused INTEGER DEFAULT 0', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding units.open_time_paused column:', err);
      }
    });
    db.run('ALTER TABLE units ADD COLUMN open_time_paused_at TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding units.open_time_paused_at column:', err);
      }
    });
    db.run('ALTER TABLE units ADD COLUMN open_time_elapsed_base_seconds INTEGER DEFAULT 0', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding units.open_time_elapsed_base_seconds column:', err);
      }
    });

    // Backward-compatible migration for pausing regular countdown timer.
    db.run('ALTER TABLE units ADD COLUMN timer_paused INTEGER DEFAULT 0', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding units.timer_paused column:', err);
      }
    });

    db.run('ALTER TABLE units ADD COLUMN last_wake_status TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding units.last_wake_status column:', err);
      }
    });
    db.run('ALTER TABLE units ADD COLUMN last_wake_message TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding units.last_wake_message column:', err);
      }
    });
    db.run('ALTER TABLE units ADD COLUMN last_wake_at TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding units.last_wake_at column:', err);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_seconds INTEGER,
        amount_paid REAL,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (unit_id) REFERENCES units(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        denomination INTEGER,
        timestamp TEXT NOT NULL,
        transaction_type TEXT DEFAULT 'coin',
        session_id INTEGER,
        FOREIGN KEY (unit_id) REFERENCES units(id),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS hardware_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT,
        FOREIGN KEY (unit_id) REFERENCES units(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('peso_to_seconds', '60')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('flat_rate_tier1_minutes', '15')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('flat_rate_tier1_price', '5')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('flat_rate_tier2_minutes', '30')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('flat_rate_tier2_price', '10')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('flat_rate_tier3_minutes', '60')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('flat_rate_tier3_price', '15')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('estimated_pc_wattage', '200')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('estimated_kwh_rate', '12')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_logout', 'true')`);

    db.get('SELECT COUNT(*) as count FROM units', [], (err, row) => {
      if (err) {
        console.error('Error checking units:', err);
        return;
      }

      if (row && row.count === 0) {
        console.log('Initializing 10 PC units...');
        const stmt = db.prepare('INSERT INTO units (id, name, status, remaining_seconds, total_revenue) VALUES (?, ?, ?, ?, ?)');

        for (let i = 1; i <= 10; i++) {
          stmt.run(i, `PC ${i}`, 'Idle', 0, 0);
        }

        stmt.finalize();
        console.log('✅ 10 PC units initialized');
      }
    });
  });
}

db.ready = initSqlJs({
  locateFile: (file) => path.join(wasmPath, file)
}).then((SQL) => {
  SqlJsModule = SQL;

  if (fs.existsSync(dbPath)) {
    try {
      sqlDb = loadDatabaseFile(SQL);
    } catch (loadErr) {
      quarantineInvalidDatabaseFile(loadErr);
    }
  } else {
    sqlDb = new SQL.Database();
  }

  console.log('✅ Connected to SQLite database (sql.js)');
  initializeDatabase();
  scheduleSave();
  startAutoBackupScheduler();

  return db;
}).catch((err) => {
  console.error('Error initializing SQLite (sql.js):', err);
  throw err;
});

module.exports = db;
