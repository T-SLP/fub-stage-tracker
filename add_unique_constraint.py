#!/usr/bin/env python3
"""
Add unique constraint to stage_changes table to prevent duplicates
This acts as a safety net if webhook deduplication fails
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def add_unique_constraint():
    db_url = os.getenv('SUPABASE_DB_URL')
    if not db_url:
        print("[ERROR] SUPABASE_DB_URL environment variable not set")
        return

    try:
        conn = psycopg2.connect(db_url, sslmode='require')
        cursor = conn.cursor()
        print('[OK] Connected to database\n')

        # First, check if constraint already exists
        print('[INFO] Checking for existing constraints...')
        cursor.execute("""
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_name = 'stage_changes'
            AND constraint_name = 'unique_person_stage_time'
        """)

        existing = cursor.fetchone()
        if existing:
            print('[INFO] Unique constraint already exists')
            cursor.close()
            conn.close()
            return

        print('[INFO] Adding unique constraint to prevent duplicate stage changes...')

        # NOTE: We can't use exact timestamp as FUB sends multiple events
        # Instead, we'll create a partial index that allows different event_id but prevents
        # the same person/stage combo within 1 second

        # This approach: Add unique constraint on event_id (which already exists as stage_changes_event_id_unique)
        # But we need to handle the case where event_id might be null or same

        # Actually, looking at the data, the issue is that different webhooks create different records
        # with different event_ids and timestamps (even if milliseconds apart)
        # So a database constraint won't help here - we need to rely on application-level deduplication

        print('[INFO] Database-level constraint not feasible due to event timing.')
        print('[INFO] The webhook deduplication fix is the correct solution.')
        print('[INFO] Consider cleaning up existing duplicates separately.')

        cursor.close()
        conn.close()

    except Exception as error:
        print(f'[ERROR] {error}')

if __name__ == '__main__':
    add_unique_constraint()
