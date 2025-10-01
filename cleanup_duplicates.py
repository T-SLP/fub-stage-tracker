#!/usr/bin/env python3
"""
Cleanup Duplicate Stage Changes
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

def cleanup_duplicates(dry_run=True):
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

        # Find near-duplicates: same person, same stage transition, within 5 seconds
        print('[INFO] Finding near-duplicate records (same person, stage, within 5 seconds)...\n')

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
            WHERE duplicate_count > 1
            ORDER BY changed_at DESC
        """

        cursor.execute(find_duplicates_query)
        duplicates = cursor.fetchall()

        if not duplicates:
            print('[OK] No near-duplicate records found!\n')
            cursor.close()
            conn.close()
            return

        # Separate records to keep vs delete
        to_delete = []
        to_keep = []

        for row in duplicates:
            record_id, person_id, first_name, last_name, stage_from, stage_to, changed_at, row_num, dup_count = row

            if row_num == 1:
                # This is the first (earliest) record - keep it
                to_keep.append({
                    'id': record_id,
                    'person': f"{first_name} {last_name}",
                    'person_id': person_id,
                    'transition': f"{stage_from} -> {stage_to}",
                    'time': changed_at
                })
            else:
                # This is a duplicate - delete it
                to_delete.append({
                    'id': record_id,
                    'person': f"{first_name} {last_name}",
                    'person_id': person_id,
                    'transition': f"{stage_from} -> {stage_to}",
                    'time': changed_at,
                    'row_num': row_num
                })

        print(f"[INFO] Found {len(duplicates)} duplicate records")
        print(f"[INFO] Will keep {len(to_keep)} earliest records")
        print(f"[INFO] Will delete {len(to_delete)} duplicate records\n")

        # Show sample of what will be deleted
        print("[INFO] Sample of records to be deleted (showing first 10):\n")
        for i, rec in enumerate(to_delete[:10]):
            print(f"  {i+1}. {rec['person']} ({rec['person_id']})")
            print(f"     {rec['transition']} at {rec['time']}")
            print(f"     ID: {rec['id']}")
            print()

        if dry_run:
            print("[DRY RUN] No records were deleted. Run with dry_run=False to actually delete.\n")
            cursor.close()
            conn.close()
            return len(to_delete)

        # Actually delete duplicates
        print(f"[WARNING] About to delete {len(to_delete)} records. Proceeding in 3 seconds...")
        import time
        time.sleep(3)

        delete_count = 0
        for rec in to_delete:
            try:
                cursor.execute("DELETE FROM stage_changes WHERE id = %s", (rec['id'],))
                delete_count += 1
                if delete_count % 10 == 0:
                    print(f"[INFO] Deleted {delete_count}/{len(to_delete)} records...")
            except Exception as e:
                print(f"[ERROR] Failed to delete record {rec['id']}: {e}")

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
    print("=" * 60)
    print("DUPLICATE CLEANUP SCRIPT")
    print("=" * 60)
    print()

    # First run in dry-run mode to see what would be deleted
    print("STEP 1: DRY RUN - Checking what would be deleted...")
    print("-" * 60)
    count = cleanup_duplicates(dry_run=True)

    if count and count > 0:
        print()
        response = input(f"Do you want to proceed with deleting {count} duplicate records? (yes/no): ")
        if response.lower() == 'yes':
            print()
            print("STEP 2: ACTUAL DELETION")
            print("-" * 60)
            cleanup_duplicates(dry_run=False)
        else:
            print("[INFO] Deletion cancelled by user")

    print()
    print("=" * 60)
    print("CLEANUP COMPLETE")
    print("=" * 60)
