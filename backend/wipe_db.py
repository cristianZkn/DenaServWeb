import os
import sys
import django

sys.path.append(r'b:\proyectos\DenaServWeb\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import connection

def wipe_database():
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
        """)
        tables = [row[0] for row in cursor.fetchall()]
        
        for table in tables:
            print(f"Dropping table {table}...")
            cursor.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE;')
        print("Done dropping tables.")

if __name__ == '__main__':
    wipe_database()
