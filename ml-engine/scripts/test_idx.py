import sqlite3
import time
c=sqlite3.connect('medisync.db')
print(c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='outbreak_tracking'").fetchone()[0])
print("INDEXES:", c.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='outbreak_tracking'").fetchall())

start = time.time()
rows = c.execute("SELECT district, disease, SUM(count) as total_cases FROM outbreak_tracking WHERE date >= '2026-04-01' GROUP BY district, disease").fetchall()
trend_rows = c.execute("SELECT date, SUM(count) as total_cases FROM outbreak_tracking WHERE date >= '2026-04-01' GROUP BY date").fetchall()
print(f"QUERY TOOK {(time.time() - start)*1000:.2f}ms")
