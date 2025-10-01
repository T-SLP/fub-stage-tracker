#!/usr/bin/env python3
"""
Add Database Constraint to Prevent Duplicate Stage Changes
Creates a partial unique index to prevent duplicates at the database level
"""

import os
import psycopg2
import sys
from dotenv import load_dotenv

# Force UTF-8 output
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()

def add_duplicate_protection():
    """
    Add database constraint to prevent duplicate stage changes
    Uses a partial unique index on person_id, stage_from, stage_to, and truncated timestamp
    """
    db_url = os.getenv('SUPABASE_DB_URL')
    if not db_url:
        print("[ERROR] SUPABASE_DB_URL environment variable not set")
        return False

    try:
        conn = psycopg2.connect(db_url, sslmode='require')
        cursor = conn.cursor()
        print('[OK] Connected to database\n')

        # Check if index already exists
        print('[INFO] Checking for existing duplicate protection...')
        cursor.execute("""
            SELECT indexname
            FROM pg_indexes
            WHERE tablename = 'stage_changes'
            AND indexname = 'idx_no_duplicate_stage_changes'
        """)

        existing = cursor.fetchone()
        if existing:
            print('[OK] Duplicate protection index already exists\n')
            cursor.close()
            conn.close()
            return True

        print('[INFO] Creating unique index to prevent duplicate stage changes...\n')

        # Create a partial unique index that prevents the same person from having
        # the same stage transition within the same second
        # This allows the same person to have the same transition at different times
        # but prevents rapid-fire duplicates
        create_index_query = """
            CREATE UNIQUE INDEX idx_no_duplicate_stage_changes
            ON stage_changes (
                person_id,
                COALESCE(stage_from, 'NULL'),
                stage_to,
                DATE_TRUNC('second', changed_at)
            )
        """

        cursor.execute(create_index_query)
        conn.commit()

        print('[OK] Successfully created duplicate protection index!')
        print('[INFO] This index prevents:')
        print('       - Same person')
        print('       - Same stage transition (from -> to)')
        print('       - Within the same second')
        print()
        print('[OK] Database is now protected against duplicate insertions\n')

        cursor.close()
        conn.close()
        return True

    except psycopg2.errors.UniqueViolation as e:
        print(f'[ERROR] Unique constraint violation: {e}')
        print('[INFO] This means there are still duplicates in the database.')
        print('[INFO] Run cleanup_duplicates_auto.py first to remove them.')
        if 'conn' in locals():
            conn.rollback()
        return False
    except Exception as error:
        print(f'[ERROR] {error}')
        if 'conn' in locals():
            conn.rollback()
        return False

if __name__ == '__main__':
    print("=" * 70)
    print("ADD DUPLICATE PROTECTION TO DATABASE")
    print("=" * 70)
    print()

    success = add_duplicate_protection()

    print()
    print("=" * 70)
    if success:
        print("SUCCESS - Database is now protected against duplicates")
    else:
        print("FAILED - Could not add protection. See errors above.")
    print("=" * 70)
