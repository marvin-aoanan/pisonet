const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

(async () => {
  const files = ['pisonet.db', 'pisonet.corrupt-2026-08-09T04-13-11-328Z.db'];
  for (const file of files) {
    console.log('FILE', file);
    if (!fs.existsSync(file)) {
      console.log('missing');
      continue;
    }
    const stat = fs.statSync(file);
    console.log('exists', true, 'size', stat.size);
    const buf = fs.readFileSync(file);
    console.log('header', buf.slice(0, 16));
    try {
      const SQL = await initSqlJs({ locateFile: (f) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', f) });
      const db = new SQL.Database(new Uint8Array(buf));
      const res = db.exec('SELECT name FROM sqlite_master LIMIT 5');
      console.log('tables', res[0]?.values || []);
      db.close();
      console.log('sqlite-open=ok');
    } catch (err) {
      console.log('sqlite-open=error', err && err.message ? err.message : err);
    }
  }
})();
