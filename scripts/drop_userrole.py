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
try:
    # Ensure SSL is used (Heroku requires SSL) and set a timeout
    conn = psycopg2.connect(url, connect_timeout=10, sslmode='require')
    conn.autocommit = True
    cur = conn.cursor()
    print('Connected, executing DROP')
    try:
        cur.execute('DROP TYPE IF EXISTS userrole;')
        print('Dropped type userrole (if existed)')
    except Exception as e:
        print('Error executing DROP:', repr(e))
        sys.exit(3)
    finally:
        cur.close()
        conn.close()
        print('Connection closed')
except Exception as e:
    print('Connection error:', repr(e))
    sys.exit(2)
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
