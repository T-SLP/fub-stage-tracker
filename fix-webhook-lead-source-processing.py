#!/usr/bin/env python3
"""
Fix webhook processing to properly capture lead source data
This script will analyze and provide fixes for webhook lead source extraction
"""

import requests
import psycopg2
import datetime
import json
import os
import base64

# Configuration
FUB_API_KEY = os.getenv("FUB_API_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")

def extract_lead_source_tag(tags):
    """
    Extract specific lead source tag from tags array
    Returns 'ReadyMode', 'Roor', or None
    """
    if not tags or not isinstance(tags, list):
        return None

    if "ReadyMode" in tags:
        return "ReadyMode"
    elif "Roor" in tags:
        return "Roor"

    return None

def get_recent_webhook_records_with_unknown_sources():
    """Get recent webhook records that have Unknown lead sources"""
    print("ANALYZING WEBHOOK RECORDS WITH UNKNOWN LEAD SOURCES:")
    print("-" * 60)

    conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')

    try:
        with conn.cursor() as cur:
            # Get recent webhook records with NULL or missing lead_source_tag
            query = """
                SELECT
                    id, person_id, first_name, last_name, stage_to,
                    changed_at, lead_source_tag, raw_payload
                FROM stage_changes
                WHERE source LIKE 'webhook_%'
                  AND (lead_source_tag IS NULL OR lead_source_tag = '')
                  AND changed_at >= CURRENT_DATE - INTERVAL '7 days'
                ORDER BY changed_at DESC
                LIMIT 20;
            """
            cur.execute(query)
            records = cur.fetchall()

            if not records:
                print("No webhook records with unknown lead sources found")
                return []

            print(f"Found {len(records)} webhook records with unknown lead sources:")

            webhook_issues = []
            for record in records:
                record_id, person_id, first_name, last_name, stage_to, changed_at, lead_source_tag, raw_payload = record

                print(f"\nRecord ID {record_id}:")
                print(f"   Person: {first_name} {last_name}")
                print(f"   Stage: {stage_to}")
                print(f"   Date: {changed_at}")
                print(f"   Current lead_source_tag: {lead_source_tag or 'NULL'}")

                # Parse raw payload to check if tags are available
                try:
                    if raw_payload:
                        payload = json.loads(raw_payload) if isinstance(raw_payload, str) else raw_payload
                        tags = payload.get('tags', [])

                        if tags:
                            correct_source = extract_lead_source_tag(tags)
                            print(f"   Tags found: {tags}")
                            print(f"   Correct lead source should be: {correct_source or 'Unknown'}")

                            if correct_source:
                                webhook_issues.append({
                                    'record_id': record_id,
                                    'person_id': person_id,
                                    'name': f"{first_name} {last_name}",
                                    'current_source': lead_source_tag,
                                    'correct_source': correct_source,
                                    'tags': tags
                                })
                        else:
                            print(f"   No tags found in payload")

                except Exception as e:
                    print(f"   Error parsing payload: {e}")

            return webhook_issues

    finally:
        conn.close()

def fix_webhook_lead_source_data(webhook_issues):
    """Fix the lead source data for webhook records"""
    if not webhook_issues:
        print("\nNo webhook records need fixing")
        return 0

    print(f"\nFIXING {len(webhook_issues)} WEBHOOK RECORDS:")
    print("-" * 50)

    conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
    fixed_count = 0

    try:
        with conn.cursor() as cur:
            for issue in webhook_issues:
                try:
                    update_query = """
                        UPDATE stage_changes
                        SET lead_source_tag = %s
                        WHERE id = %s
                    """

                    cur.execute(update_query, (issue['correct_source'], issue['record_id']))

                    print(f"Fixed {issue['name']}: NULL -> {issue['correct_source']}")
                    fixed_count += 1

                except Exception as e:
                    print(f"Failed to fix {issue['name']}: {e}")

            conn.commit()
            print(f"\nSuccessfully fixed {fixed_count} webhook records!")

    except Exception as e:
        print(f"Error during fix operation: {e}")
        conn.rollback()
    finally:
        conn.close()

    return fixed_count

def analyze_webhook_vs_polling_lead_sources():
    """Compare lead source data quality between webhook and polling"""
    print("\nWEBHOOK VS POLLING LEAD SOURCE COMPARISON:")
    print("-" * 55)

    conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')

    try:
        with conn.cursor() as cur:
            # Analysis query
            query = """
                SELECT
                    CASE
                        WHEN source LIKE 'webhook_%' THEN 'WEBHOOK'
                        ELSE 'POLLING'
                    END as data_source,
                    CASE
                        WHEN lead_source_tag IS NULL OR lead_source_tag = '' THEN 'Unknown'
                        ELSE lead_source_tag
                    END as source_tag,
                    COUNT(*) as count
                FROM stage_changes
                WHERE changed_at >= CURRENT_DATE - INTERVAL '7 days'
                  AND stage_to = 'ACQ - Qualified'
                GROUP BY data_source, source_tag
                ORDER BY data_source, count DESC;
            """

            cur.execute(query)
            results = cur.fetchall()

            webhook_data = {}
            polling_data = {}

            for data_source, source_tag, count in results:
                if data_source == 'WEBHOOK':
                    webhook_data[source_tag] = count
                else:
                    polling_data[source_tag] = count

            print("WEBHOOK Data:")
            for source, count in webhook_data.items():
                print(f"  {source}: {count}")

            print("\nPOLLING Data:")
            for source, count in polling_data.items():
                print(f"  {source}: {count}")

            # Calculate problem ratio
            webhook_unknown = webhook_data.get('Unknown', 0)
            webhook_total = sum(webhook_data.values())
            polling_unknown = polling_data.get('Unknown', 0)
            polling_total = sum(polling_data.values())

            if webhook_total > 0:
                webhook_unknown_pct = (webhook_unknown / webhook_total) * 100
                print(f"\nWebhook Unknown Rate: {webhook_unknown_pct:.1f}% ({webhook_unknown}/{webhook_total})")

            if polling_total > 0:
                polling_unknown_pct = (polling_unknown / polling_total) * 100
                print(f"Polling Unknown Rate: {polling_unknown_pct:.1f}% ({polling_unknown}/{polling_total})")

    finally:
        conn.close()

def create_webhook_processing_recommendations():
    """Provide recommendations for improving webhook processing"""
    print("\nWEBHOOK PROCESSING RECOMMENDATIONS:")
    print("-" * 45)

    print("""
1. IMMEDIATE FIX: Update Railway webhook processing code

   The extract_lead_source_tag() function exists but may not be:
   - Called correctly during webhook processing
   - Applied to the right data structure from FUB webhooks
   - Handling all webhook event types properly

2. WEBHOOK PAYLOAD INVESTIGATION:

   Check if webhook payloads contain 'tags' field:
   - peopleStageUpdated events
   - peopleUpdated events
   - peopleTagsCreated events

3. WEBHOOK EVENT TYPE HANDLING:

   Ensure all relevant webhook events extract lead source:
   - peopleStageUpdated: Should extract from person.tags
   - peopleUpdated: Should extract from person.tags
   - peopleTagsCreated: Should extract from tags data

4. SYNC WEBHOOK & POLLING LOGIC:

   Both should use identical extract_lead_source_tag() function:
   - Same tag priority (ReadyMode > Roor > Unknown)
   - Same data structure handling
   - Same null/empty checks

5. TESTING:

   Add webhook processing tests:
   - Test with ReadyMode tags
   - Test with Roor tags
   - Test with no tags
   - Test with malformed data
""")

def main():
    print("FUB WEBHOOK LEAD SOURCE PROCESSOR")
    print("=" * 40)

    # Step 1: Analyze current webhook issues
    webhook_issues = get_recent_webhook_records_with_unknown_sources()

    # Step 2: Compare webhook vs polling data quality
    analyze_webhook_vs_polling_lead_sources()

    # Step 3: Fix existing webhook records if any issues found
    if webhook_issues:
        print(f"\n❓ Found {len(webhook_issues)} webhook records that can be fixed.")
        fix_choice = input("Fix these records now? (y/n): ").lower().strip()

        if fix_choice == 'y':
            fixed_count = fix_webhook_lead_source_data(webhook_issues)
            print(f"\nFixed {fixed_count} records!")
        else:
            print("Skipping fixes.")

    # Step 4: Provide recommendations
    create_webhook_processing_recommendations()

    print(f"\nNEXT STEPS:")
    print("1. Fix any identified webhook records (run this script)")
    print("2. Update Railway webhook processing code")
    print("3. Test webhook processing with various lead sources")
    print("4. Monitor dashboard for accurate lead source distribution")

if __name__ == "__main__":
    main()