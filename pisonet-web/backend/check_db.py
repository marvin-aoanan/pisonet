import os
import sqlite3

files = ['pisonet.db', 'pisonet.corrupt-2026-08-09T04-13-11-328Z.db']
for p in files:
    print('FILE', p)
    print('exists', os.path.exists(p), 'size', os.path.getsize(p) if os.path.exists(p) else None)
    if os.path.exists(p):
        with open(p, 'rb') as f:
            print('header', f.read(16))
        try:
            con = sqlite3.connect(p)
            cur = con.cursor()
            cur.execute('SELECT name FROM sqlite_master LIMIT 5')
            print('tables', cur.fetchall())
            con.close()
            print('sqlite-open=ok')
        except Exception as e:
            print('sqlite-open=error', repr(e))
