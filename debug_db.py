import sqlite3
import os

db_path = 'c:/Users/NaumanBaig/Desktop/Beta_Final_OmniPOS/omnipos_v6.db'

print(f"Checking DB at: {db_path}")
if not os.path.exists(db_path):
    print("DB file not found!")
    exit()

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("\n--- TENANTS ---")
try:
    cursor.execute("SELECT TenantId, Name, WiseHandle, CardPaymentUrl FROM Tenants")
    rows = cursor.fetchall()
    for row in rows:
        print(row)
except Exception as e:
    print(e)

print("\n--- RECENT ORDERS (Top 3) ---")
try:
    cursor.execute("SELECT OrderId, TenantId, TotalAmount, FinalTotal, Status FROM Orders ORDER BY CreatedAt DESC LIMIT 3")
    rows = cursor.fetchall()
    for row in rows:
        print(row)
except Exception as e:
    print(e)

conn.close()
