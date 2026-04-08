import os
import sys
try:
    import psycopg2
except Exception as e:
    print('psycopg2 not available:', e)
    sys.exit(1)

url = os.environ.get('DATABASE_URL')
if not url:
    print('DATABASE_URL not set')
    sys.exit(1)

print('Connecting to', url[:50])
# psycopg2 accepts 'postgres://' URLs
conn = psycopg2.connect(url)
conn.autocommit = True
cur = conn.cursor()
try:
    cur.execute('DROP TYPE IF EXISTS userrole;')
    print('Dropped type userrole (if existed)')
except Exception as e:
    print('Error dropping type:', e)
finally:
    cur.close()
    conn.close()
