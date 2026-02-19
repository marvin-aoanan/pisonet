const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'pisonet.db');
const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist');

let sqlDb = null;
let saveTimer = null;
let pendingSave = false;

function scheduleSave() {
  pendingSave = true;
  if (saveTimer) {
    return;
  }

  saveTimer = setTimeout(() => {
    if (pendingSave && sqlDb) {
      const data = sqlDb.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
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
        last_status_update TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('max_session_duration', '3600')`);
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
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    sqlDb = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    sqlDb = new SQL.Database();
  }

  console.log('✅ Connected to SQLite database (sql.js)');
  initializeDatabase();
  scheduleSave();

  return db;
}).catch((err) => {
  console.error('Error initializing SQLite (sql.js):', err);
  throw err;
});

module.exports = db;
