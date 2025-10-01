#!/usr/bin/env python3
# check_duplicates.py
# Script to check for duplicate stage_changes records

import os
import psycopg2
import sys
from dotenv import load_dotenv

# Force UTF-8 output
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv()

def check_duplicates():
    db_url = os.getenv('SUPABASE_DB_URL')
    if not db_url:
        print("[ERROR] SUPABASE_DB_URL environment variable not set")
        return

    try:
        # Connect directly using connection string
        conn = psycopg2.connect(db_url, sslmode='require')
        cursor = conn.cursor()
        print('[OK] Connected to database\n')

        # Check for exact duplicates (same person, stage, timestamp)
        print('[INFO] Checking for exact duplicate records...\n')
        exact_duplicates_query = """
            SELECT
                person_id,
                first_name,
                last_name,
                stage_from,
                stage_to,
                changed_at,
                COUNT(*) as duplicate_count
            FROM stage_changes
            GROUP BY person_id, first_name, last_name, stage_from, stage_to, changed_at
            HAVING COUNT(*) > 1
            ORDER BY duplicate_count DESC, changed_at DESC
            LIMIT 20
        """

        cursor.execute(exact_duplicates_query)
        exact_duplicates = cursor.fetchall()

        if exact_duplicates:
            print(f"[ALERT] Found {len(exact_duplicates)} sets of exact duplicates:\n")
            for row in exact_duplicates:
                person_id, first_name, last_name, stage_from, stage_to, changed_at, dup_count = row
                print(f"  {first_name} {last_name} (ID: {person_id})")
                print(f"    {stage_from} -> {stage_to} at {changed_at}")
                print(f"    Appears {dup_count} times")
                print('')
        else:
            print('[OK] No exact duplicates found\n')

        # Check for near-duplicates (same person, same stage transition, within 1 minute)
        print('[INFO] Checking for near-duplicate records (within 1 minute)...\n')
        near_duplicates_query = """
            WITH ranked_changes AS (
                SELECT
                    id,
                    person_id,
                    first_name,
                    last_name,
                    stage_from,
                    stage_to,
                    changed_at,
                    LAG(changed_at) OVER (
                        PARTITION BY person_id, stage_from, stage_to
                        ORDER BY changed_at
                    ) as prev_changed_at
                FROM stage_changes
                WHERE changed_at >= NOW() - INTERVAL '7 days'
            )
            SELECT
                person_id,
                first_name,
                last_name,
                stage_from,
                stage_to,
                changed_at,
                prev_changed_at,
                EXTRACT(EPOCH FROM (changed_at - prev_changed_at)) as seconds_diff
            FROM ranked_changes
            WHERE prev_changed_at IS NOT NULL
                AND changed_at - prev_changed_at < INTERVAL '1 minute'
            ORDER BY changed_at DESC
            LIMIT 20
        """

        cursor.execute(near_duplicates_query)
        near_duplicates = cursor.fetchall()

        if near_duplicates:
            print(f"[WARNING] Found {len(near_duplicates)} near-duplicate records (within 1 minute):\n")
            for row in near_duplicates:
                person_id, first_name, last_name, stage_from, stage_to, changed_at, prev_changed_at, seconds_diff = row
                print(f"  {first_name} {last_name} (ID: {person_id})")
                print(f"    {stage_from} -> {stage_to}")
                print(f"    First: {prev_changed_at}")
                print(f"    Second: {changed_at} ({round(seconds_diff)}s later)")
                print('')
        else:
            print('[OK] No near-duplicates found\n')

        # Check table constraints
        print('[INFO] Checking table structure and constraints...\n')
        constraints_query = """
            SELECT
                constraint_name,
                constraint_type
            FROM information_schema.table_constraints
            WHERE table_name = 'stage_changes'
        """

        cursor.execute(constraints_query)
        constraints = cursor.fetchall()

        print('Table constraints:')
        if constraints:
            for row in constraints:
                constraint_name, constraint_type = row
                print(f"  - {constraint_name}: {constraint_type}")
        else:
            print('  [WARNING] No constraints found - this could allow duplicates!')
        print('')

        # Check for ID duplicates
        print('[INFO] Checking for duplicate IDs in last 7 days...\n')
        id_duplicates_query = """
            SELECT
                id,
                COUNT(*) as count
            FROM stage_changes
            WHERE changed_at >= NOW() - INTERVAL '7 days'
            GROUP BY id
            HAVING COUNT(*) > 1
            LIMIT 10
        """
        cursor.execute(id_duplicates_query)
        id_duplicates = cursor.fetchall()

        if id_duplicates:
            print(f"[ALERT] Found {len(id_duplicates)} duplicate IDs:\n")
            for row in id_duplicates:
                print(f"  ID {row[0]} appears {row[1]} times")
        else:
            print('[OK] No duplicate IDs found\n')

        # Check total record count
        cursor.execute("SELECT COUNT(*) as total FROM stage_changes")
        total_count = cursor.fetchone()[0]
        print(f"[INFO] Total stage_changes records: {total_count}\n")

        # Show sample of recent records
        print('[INFO] Sample of most recent records (last 10):\n')
        sample_query = """
            SELECT id, person_id, first_name, last_name, stage_from, stage_to, changed_at
            FROM stage_changes
            ORDER BY changed_at DESC
            LIMIT 10
        """
        cursor.execute(sample_query)
        samples = cursor.fetchall()
        for row in samples:
            print(f"  ID: {row[0]} | Person: {row[2]} {row[3]} ({row[1]}) | {row[4]} -> {row[5]} | {row[6]}")

        cursor.close()
        conn.close()

    except Exception as error:
        print(f'[ERROR] {error}')

if __name__ == '__main__':
    check_duplicates()
