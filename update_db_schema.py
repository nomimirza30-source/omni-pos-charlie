import sqlite3

db_path = 'omnipos_v6.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE Tenants ADD COLUMN WiseApiKey TEXT DEFAULT ''")
    print("Added WiseApiKey column.")
except sqlite3.OperationalError as e:
    print(f"WiseApiKey column error (likely exists): {e}")

try:
    cursor.execute("ALTER TABLE Tenants ADD COLUMN WiseProfileId TEXT DEFAULT ''")
    print("Added WiseProfileId column.")
except sqlite3.OperationalError as e:
    print(f"WiseProfileId column error (likely exists): {e}")

conn.commit()
conn.close()
