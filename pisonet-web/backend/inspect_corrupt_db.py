import os
import sqlite3

path = r'c:\Users\Server\pisonet\pisonet-web\backend\pisonet.corrupt-2026-08-09T04-13-11-328Z.db'
print('path=', path)
print('exists=', os.path.exists(path))
print('size=', os.path.getsize(path) if os.path.exists(path) else None)
if os.path.exists(path):
    with open(path, 'rb') as f:
        print('header=', f.read(16))
    try:
        conn = sqlite3.connect(path)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = cur.fetchall()
        print('tables=', tables)
        if tables:
            for (table_name,) in tables:
                cur.execute(f'SELECT COUNT(*) FROM {table_name}')
                print(table_name, 'count=', cur.fetchone()[0])
        conn.close()
        print('sqlite-open=ok')
    except Exception as e:
        print('sqlite-open=error=', repr(e))
