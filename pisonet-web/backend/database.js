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

function saveNow() {
  if (!sqlDb) {
    throw new Error('Database is not initialized');
  }

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  pendingSave = false;
  const data = sqlDb.export();
  writeDatabaseFileAtomically(dbPath, Buffer.from(data));
}

function normalizeParams(params, cb) {
  if (typeof params === 'function') {
    return { params: undefined, cb: params };
  }
  return { params, cb };
}

function migrateSalesTablesForDeductionSupport() {
  const salesSqlRow = db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'product_sales'");
  const itemsSqlRow = db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'product_sale_items'");

  if (salesSqlRow && typeof salesSqlRow.sql === 'string' && salesSqlRow.sql.includes('CHECK (subtotal >= 0)')) {
    db.run('BEGIN TRANSACTION');
    db.run('ALTER TABLE product_sales RENAME TO product_sales_old');
    db.run(`
      CREATE TABLE product_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference_no TEXT NOT NULL UNIQUE,
        subtotal REAL NOT NULL,
        payment_method TEXT NOT NULL,
        notes TEXT,
        sold_by TEXT NOT NULL,
        sold_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`
      INSERT INTO product_sales (id, reference_no, subtotal, payment_method, notes, sold_by, sold_at, created_at)
      SELECT id, reference_no, subtotal, payment_method, notes, sold_by, sold_at, created_at
      FROM product_sales_old
    `);
    db.run('DROP TABLE product_sales_old');
    db.run('COMMIT');
  }

  if (itemsSqlRow && typeof itemsSqlRow.sql === 'string' && itemsSqlRow.sql.includes('CHECK (line_total >= 0)')) {
    db.run('BEGIN TRANSACTION');
    db.run('ALTER TABLE product_sale_items RENAME TO product_sale_items_old');
    db.run(`
      CREATE TABLE product_sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_base_price REAL NOT NULL CHECK (unit_base_price >= 0),
        unit_markup_price REAL NOT NULL CHECK (unit_markup_price >= 0),
        unit_final_price REAL NOT NULL CHECK (unit_final_price >= 0),
        line_total REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES product_sales(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);
    db.run(`
      INSERT INTO product_sale_items (id, sale_id, product_id, quantity, unit_base_price, unit_markup_price, unit_final_price, line_total, created_at)
      SELECT id, sale_id, product_id, quantity, unit_base_price, unit_markup_price, unit_final_price, line_total, created_at
      FROM product_sale_items_old
    `);
    db.run('DROP TABLE product_sale_items_old');
    db.run('COMMIT');
  }
}

function getLastInsertId() {
  const stmt = sqlDb.prepare('SELECT last_insert_rowid() as id');
  const row = stmt.getAsObject();
  stmt.free();
  return row && row.id ? row.id : 0;
}

function migrateTransactionsUnitIdToNullable() {
  const columns = db.all('PRAGMA table_info(transactions)');
  const unitIdColumn = columns.find((column) => column.name === 'unit_id');
  const hasSoldByColumn = columns.some((column) => column.name === 'sold_by');

  if ((!unitIdColumn || Number(unitIdColumn.notnull) === 0) && hasSoldByColumn) {
    return;
  }

  const existingRows = db.all(
    `SELECT id, unit_id, amount, denomination, timestamp, transaction_type, session_id, description${hasSoldByColumn ? ', sold_by' : ''}
     FROM transactions
     ORDER BY id ASC`
  );

  db.run('BEGIN TRANSACTION');
  db.run('ALTER TABLE transactions RENAME TO transactions_old');
  db.run(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER,
      amount REAL NOT NULL,
      denomination INTEGER,
      timestamp TEXT NOT NULL,
      transaction_type TEXT DEFAULT 'coin',
      session_id INTEGER,
      description TEXT,
      sold_by TEXT,
      FOREIGN KEY (unit_id) REFERENCES units(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  existingRows.forEach((row) => {
    db.run(
      'INSERT INTO transactions (id, unit_id, amount, denomination, timestamp, transaction_type, session_id, description, sold_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [row.id, row.unit_id, row.amount, row.denomination, row.timestamp, row.transaction_type, row.session_id, row.description || null, hasSoldByColumn ? row.sold_by || null : null]
    );
  });

  db.run('DROP TABLE transactions_old');
  db.run('COMMIT');
}

const db = {
  ready: null,
  saveNow,
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

    // Restored backups may come from older schema versions.
    // Re-apply idempotent migrations so new columns (e.g. transactions.description) exist.
    initializeDatabase();

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

    db.run("ALTER TABLE units ADD COLUMN status_mode TEXT DEFAULT 'active'", (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding units.status_mode column:', err);
      }
    });

    db.run("UPDATE units SET status_mode = 'active' WHERE status_mode IS NULL OR TRIM(status_mode) = ''", (err) => {
      if (err) {
        console.error('Error backfilling units.status_mode column:', err);
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
        unit_id INTEGER,
        amount REAL NOT NULL,
        denomination INTEGER,
        timestamp TEXT NOT NULL,
        transaction_type TEXT DEFAULT 'coin',
        session_id INTEGER,
        description TEXT,
        sold_by TEXT,
        payment_method TEXT NOT NULL DEFAULT 'cash',
        payment_status TEXT NOT NULL DEFAULT 'approved',
        payment_reference TEXT,
        approved_by TEXT,
        approved_at TEXT,
        FOREIGN KEY (unit_id) REFERENCES units(id),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    db.run('ALTER TABLE transactions ADD COLUMN description TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding transactions.description column:', err);
      }
    });

    db.run('ALTER TABLE transactions ADD COLUMN sold_by TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding transactions.sold_by column:', err);
      }
    });

    db.run("ALTER TABLE transactions ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'", (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding transactions.payment_method column:', err);
      }
    });

    db.run("ALTER TABLE transactions ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'approved'", (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding transactions.payment_status column:', err);
      }
    });

    db.run('ALTER TABLE transactions ADD COLUMN payment_reference TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding transactions.payment_reference column:', err);
      }
    });

    db.run('ALTER TABLE transactions ADD COLUMN approved_by TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding transactions.approved_by column:', err);
      }
    });

    db.run('ALTER TABLE transactions ADD COLUMN approved_at TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding transactions.approved_at column:', err);
      }
    });

    db.run("UPDATE transactions SET payment_method = 'cash' WHERE payment_method IS NULL OR TRIM(payment_method) = ''", (err) => {
      if (err) {
        console.error('Error backfilling transactions.payment_method column:', err);
      }
    });

    db.run("UPDATE transactions SET payment_status = 'approved' WHERE payment_status IS NULL OR TRIM(payment_status) = ''", (err) => {
      if (err) {
        console.error('Error backfilling transactions.payment_status column:', err);
      }
    });

    migrateTransactionsUnitIdToNullable();

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
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('flat_rate_tier4_minutes', '75')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('flat_rate_tier4_price', '20')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('estimated_pc_wattage', '200')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('estimated_kwh_rate', '12')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_logout', 'true')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('product_categories', '["Beverages","Snacks"]')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('opex_categories', '["Utilities","Rent","Supplies","Maintenance","Salaries","Internet","Other"]')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('opex_fund_sources', '["Owner Top-up","Loan","Refund","Other"]')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('opex_entry_types', '{"operating":["rent","utilities","internet","salary","maintenance","supplies","inventory_purchase","other_opex"],"capital":["initial_capital","owner_topup","partner_investment","capital_withdrawal"],"financing":["loan_proceeds","loan_payment","interest_payment","other_financing"],"asset":["pc_purchase","printer_purchase","renovation","furniture","equipment_upgrade","other_asset"]}')`);

    db.run(`
      CREATE TABLE IF NOT EXISTS opex_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference_no TEXT NOT NULL UNIQUE,
        direction TEXT NOT NULL CHECK (direction IN ('expense', 'fund_in')),
        ledger_group TEXT NOT NULL DEFAULT 'operating',
        entry_type TEXT NOT NULL DEFAULT 'other_opex',
        category TEXT NOT NULL,
        source_type TEXT,
        source_or_payee TEXT,
        description TEXT,
        amount REAL NOT NULL CHECK (amount >= 0),
        entry_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
        void_reason TEXT,
        voided_at TEXT,
        voided_by TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run("ALTER TABLE opex_entries ADD COLUMN ledger_group TEXT NOT NULL DEFAULT 'operating'", (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding opex_entries.ledger_group column:', err);
      }
    });

    db.run("ALTER TABLE opex_entries ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'other_opex'", (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding opex_entries.entry_type column:', err);
      }
    });

    db.run(`
      UPDATE opex_entries
      SET ledger_group = CASE
        WHEN direction = 'fund_in' THEN 'capital'
        ELSE 'operating'
      END
      WHERE ledger_group IS NULL OR TRIM(ledger_group) = ''
    `, (err) => {
      if (err) {
        console.error('Error backfilling opex_entries.ledger_group column:', err);
      }
    });

    db.run(`
      UPDATE opex_entries
      SET entry_type = CASE
        WHEN direction = 'fund_in' THEN 'initial_capital'
        ELSE 'other_opex'
      END
      WHERE entry_type IS NULL OR TRIM(entry_type) = ''
    `, (err) => {
      if (err) {
        console.error('Error backfilling opex_entries.entry_type column:', err);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS opex_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        field_name TEXT,
        value_before TEXT,
        value_after TEXT,
        reason TEXT,
        changed_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entry_id) REFERENCES opex_entries(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT,
        description TEXT,
        image_url TEXT,
        size TEXT,
        quantity_in_stock INTEGER NOT NULL DEFAULT 0 CHECK (quantity_in_stock >= 0),
        base_price REAL NOT NULL DEFAULT 0 CHECK (base_price >= 0),
        markup_price REAL NOT NULL DEFAULT 0 CHECK (markup_price >= 0),
        final_price REAL NOT NULL DEFAULT 0 CHECK (final_price >= 0),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run('ALTER TABLE products ADD COLUMN category TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding products.category column:', err);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS product_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference_no TEXT NOT NULL UNIQUE,
        subtotal REAL NOT NULL,
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL DEFAULT 'approved',
        payment_reference TEXT,
        approved_by TEXT,
        approved_at TEXT,
        approval_notes TEXT,
        notes TEXT,
        sold_by TEXT NOT NULL,
        sold_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run("ALTER TABLE product_sales ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'approved'", (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding product_sales.payment_status column:', err);
      }
    });

    db.run('ALTER TABLE product_sales ADD COLUMN payment_reference TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding product_sales.payment_reference column:', err);
      }
    });

    db.run('ALTER TABLE product_sales ADD COLUMN approved_by TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding product_sales.approved_by column:', err);
      }
    });

    db.run('ALTER TABLE product_sales ADD COLUMN approved_at TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding product_sales.approved_at column:', err);
      }
    });

    db.run('ALTER TABLE product_sales ADD COLUMN approval_notes TEXT', (err) => {
      if (err && !String(err.message || err).includes('duplicate column name')) {
        console.error('Error adding product_sales.approval_notes column:', err);
      }
    });

    db.run("UPDATE product_sales SET payment_method = 'cash' WHERE payment_method IS NULL OR TRIM(payment_method) = ''", (err) => {
      if (err) {
        console.error('Error backfilling product_sales.payment_method column:', err);
      }
    });

    db.run("UPDATE product_sales SET payment_status = 'approved' WHERE payment_status IS NULL OR TRIM(payment_status) = ''", (err) => {
      if (err) {
        console.error('Error backfilling product_sales.payment_status column:', err);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS product_sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_base_price REAL NOT NULL CHECK (unit_base_price >= 0),
        unit_markup_price REAL NOT NULL CHECK (unit_markup_price >= 0),
        unit_final_price REAL NOT NULL CHECK (unit_final_price >= 0),
        line_total REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES product_sales(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    migrateSalesTablesForDeductionSupport();

    db.run(`
      CREATE TABLE IF NOT EXISTS product_inventory_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        quantity_delta INTEGER NOT NULL,
        quantity_before INTEGER NOT NULL,
        quantity_after INTEGER NOT NULL,
        unit_cost REAL,
        notes TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS product_price_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        base_price_before REAL NOT NULL,
        base_price_after REAL NOT NULL,
        markup_price_before REAL NOT NULL,
        markup_price_after REAL NOT NULL,
        final_price_before REAL NOT NULL,
        final_price_after REAL NOT NULL,
        change_reason TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    db.run('CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)');
    db.run('CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)');
    db.run('CREATE INDEX IF NOT EXISTS idx_product_sales_sold_at ON product_sales(sold_at)');
    db.run('CREATE INDEX IF NOT EXISTS idx_product_sales_payment ON product_sales(payment_method, payment_status, sold_at)');
    db.run('CREATE INDEX IF NOT EXISTS idx_product_sale_items_sale_id ON product_sale_items(sale_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_product_inventory_logs_product_created ON product_inventory_logs(product_id, created_at)');
    db.run('CREATE INDEX IF NOT EXISTS idx_product_price_logs_product_created ON product_price_logs(product_id, created_at)');
    db.run('CREATE INDEX IF NOT EXISTS idx_transactions_type_timestamp ON transactions(transaction_type, timestamp)');
    db.run('CREATE INDEX IF NOT EXISTS idx_transactions_payment ON transactions(payment_method, payment_status, timestamp)');
    db.run('CREATE INDEX IF NOT EXISTS idx_opex_entries_entry_date ON opex_entries(entry_date)');
    db.run('CREATE INDEX IF NOT EXISTS idx_opex_entries_direction ON opex_entries(direction)');
    db.run('CREATE INDEX IF NOT EXISTS idx_opex_entries_ledger_group ON opex_entries(ledger_group)');
    db.run('CREATE INDEX IF NOT EXISTS idx_opex_entries_entry_type ON opex_entries(entry_type)');
    db.run('CREATE INDEX IF NOT EXISTS idx_opex_entries_category ON opex_entries(category)');
    db.run('CREATE INDEX IF NOT EXISTS idx_opex_entries_status ON opex_entries(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_opex_logs_entry_created ON opex_logs(entry_id, created_at)');

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
