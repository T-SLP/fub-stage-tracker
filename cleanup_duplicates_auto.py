#!/usr/bin/env python3
"""
Cleanup Duplicate Stage Changes - Auto Version
Removes near-duplicate records from stage_changes table while keeping the earliest occurrence
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

def cleanup_duplicates(dry_run=False):
    """
    Remove duplicate stage changes from database

    Args:
        dry_run: If True, only report what would be deleted without actually deleting
    """
    db_url = os.getenv('SUPABASE_DB_URL')
    if not db_url:
        print("[ERROR] SUPABASE_DB_URL environment variable not set")
        return

    try:
        conn = psycopg2.connect(db_url, sslmode='require')
        cursor = conn.cursor()
        print('[OK] Connected to database\n')

        # Find near-duplicates: same person, same stage transition, within same second
        print('[INFO] Finding near-duplicate records (same person, stage, within same second)...\n')

        find_duplicates_query = """
            WITH ranked_changes AS (
                SELECT
                    id,
                    person_id,
                    first_name,
                    last_name,
                    stage_from,
                    stage_to,
                    changed_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY person_id, stage_from, stage_to,
                                     DATE_TRUNC('second', changed_at)
                        ORDER BY changed_at ASC
                    ) as row_num,
                    COUNT(*) OVER (
                        PARTITION BY person_id, stage_from, stage_to,
                                     DATE_TRUNC('second', changed_at)
                    ) as duplicate_count
                FROM stage_changes
            )
            SELECT
                id,
                person_id,
                first_name,
                last_name,
                stage_from,
                stage_to,
                changed_at,
                row_num,
                duplicate_count
            FROM ranked_changes
            WHERE duplicate_count > 1 AND row_num > 1
            ORDER BY changed_at DESC
        """

        cursor.execute(find_duplicates_query)
        to_delete = cursor.fetchall()

        if not to_delete:
            print('[OK] No near-duplicate records found!\n')
            cursor.close()
            conn.close()
            return 0

        print(f"[INFO] Found {len(to_delete)} duplicate records to delete\n")

        # Show sample of what will be deleted
        print("[INFO] Sample of records to be deleted (showing first 10):\n")
        for i, row in enumerate(to_delete[:10]):
            record_id, person_id, first_name, last_name, stage_from, stage_to, changed_at, row_num, dup_count = row
            print(f"  {i+1}. {first_name} {last_name} ({person_id})")
            print(f"     {stage_from} -> {stage_to} at {changed_at}")
            print(f"     ID: {record_id} (duplicate #{row_num} of {dup_count})")
            print()

        if dry_run:
            print("[DRY RUN] No records were deleted.\n")
            cursor.close()
            conn.close()
            return len(to_delete)

        # Actually delete duplicates
        print(f"[ACTION] Deleting {len(to_delete)} duplicate records...")

        delete_count = 0
        for row in to_delete:
            record_id = row[0]
            try:
                cursor.execute("DELETE FROM stage_changes WHERE id = %s", (record_id,))
                delete_count += 1
                if delete_count % 25 == 0:
                    print(f"  Progress: {delete_count}/{len(to_delete)} records deleted...")
            except Exception as e:
                print(f"[ERROR] Failed to delete record {record_id}: {e}")

        conn.commit()
        print(f"\n[OK] Successfully deleted {delete_count} duplicate records")

        # Verify cleanup
        cursor.execute(find_duplicates_query)
        remaining_dups = cursor.fetchall()

        if remaining_dups:
            print(f"[WARNING] {len(remaining_dups)} duplicates still remain")
        else:
            print("[OK] All near-duplicates have been cleaned up!")

        cursor.close()
        conn.close()

        return delete_count

    except Exception as error:
        print(f'[ERROR] {error}')
        if 'conn' in locals():
            conn.rollback()
        return 0

if __name__ == '__main__':
    import sys

    dry_run = '--dry-run' in sys.argv

    print("=" * 70)
    print("DUPLICATE CLEANUP SCRIPT - AUTO MODE")
    print("=" * 70)
    print()

    if dry_run:
        print("[DRY RUN MODE] Will only show what would be deleted\n")
    else:
        print("[LIVE MODE] Will actually delete duplicate records\n")

    print("-" * 70)

    count = cleanup_duplicates(dry_run=dry_run)

    print()
    print("=" * 70)
    if dry_run:
        print(f"DRY RUN COMPLETE - Found {count} duplicates")
        print("Run without --dry-run flag to actually delete them")
    else:
        print(f"CLEANUP COMPLETE - Deleted {count} duplicates")
    print("=" * 70)
