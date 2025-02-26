import psycopg2

conn = psycopg2.connect(
    host="localhost",
    database="botdb",
    user="botuser",
    password="botpassword"
)

cur = conn.cursor()
cur.execute("SELECT * FROM users")
rows = cur.fetchall()
for row in rows:
    print(row)

cur.close()
conn.close()