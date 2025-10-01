#!/usr/bin/env python3
"""
Backfill Campaign IDs for records with NULL campaign_id
This script queries FUB API with the correct ?fields parameter to get custom fields
and updates the database for records that have NULL campaign_id
"""

import os
import psycopg2
import requests
import base64
import time
from datetime import datetime, timedelta

# Load .env file if exists
env_file = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key] = value

# Configuration
FUB_API_KEY = os.getenv("FUB_API_KEY", "fka_0DxOlS07NmHLDLVjKXB7N9qJyOSM4QtM2u")
FUB_SYSTEM_KEY = os.getenv("FUB_SYSTEM_KEY", "390b59dea776f1d5216843d3dfd5a127")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")

def backfill_campaign_ids(days_back=7):
    """
    Backfill campaign IDs for records with NULL campaign_id from the last N days
    """
    conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
    cur = conn.cursor()

    # Get unique person IDs with NULL campaign_id from last N days
    cutoff_date = datetime.now() - timedelta(days=days_back)

    print(f"\n{'='*80}")
    print(f"Backfilling Campaign IDs for records from last {days_back} days")
    print(f"Cutoff date: {cutoff_date}")
    print(f"{'='*80}\n")

    cur.execute("""
        SELECT DISTINCT person_id, first_name, last_name
        FROM stage_changes
        WHERE campaign_id IS NULL
          AND changed_at >= %s
          AND person_id IS NOT NULL
        ORDER BY person_id
    """, (cutoff_date,))

    null_campaign_people = cur.fetchall()
    print(f"Found {len(null_campaign_people)} unique people with NULL campaign_id\n")

    if len(null_campaign_people) == 0:
        print("No records to backfill. Exiting.")
        conn.close()
        return

    # Prepare FUB API authentication
    auth_string = base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()

    # Track statistics
    updated_count = 0
    not_found_count = 0
    no_campaign_in_fub = 0
    errors = 0

    # Process each person
    for idx, (person_id, first_name, last_name) in enumerate(null_campaign_people, 1):
        print(f"[{idx}/{len(null_campaign_people)}] Processing: {first_name} {last_name} (ID: {person_id})")

        try:
            # Query FUB API with fields parameter to get custom fields
            fields_param = 'id,customCampaignID,customWhoPushedTheLead,customParcelCounty,customParcelState'

            response = requests.get(
                f'https://api.followupboss.com/v1/people/{person_id}?fields={fields_param}',
                headers={
                    'Authorization': f'Basic {auth_string}',
                    'X-System': 'SynergyFUBLeadMetrics',
                    'X-System-Key': FUB_SYSTEM_KEY,
                    'Content-Type': 'application/json'
                },
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                person = data.get('person', data)

                campaign_id = person.get('customCampaignID')
                who_pushed = person.get('customWhoPushedTheLead')
                parcel_county = person.get('customParcelCounty')
                parcel_state = person.get('customParcelState')

                if campaign_id:
                    # Update ALL stage_changes records for this person with NULL campaign_id
                    cur.execute("""
                        UPDATE stage_changes
                        SET campaign_id = %s,
                            who_pushed_lead = %s,
                            parcel_county = %s,
                            parcel_state = %s
                        WHERE person_id = %s
                          AND campaign_id IS NULL
                          AND changed_at >= %s
                    """, (campaign_id, who_pushed, parcel_county, parcel_state, person_id, cutoff_date))

                    rows_updated = cur.rowcount
                    updated_count += rows_updated
                    print(f"  [OK] Updated {rows_updated} records with campaign: {campaign_id}")

                    # Commit every 50 people to avoid losing progress
                    if idx % 50 == 0:
                        conn.commit()
                        print(f"\n  [SAVE] Committed progress ({updated_count} total updates so far)\n")
                else:
                    no_campaign_in_fub += 1
                    print(f"  [WARN] No campaign ID in FUB for this person")

            elif response.status_code == 404:
                not_found_count += 1
                print(f"  [ERROR] Person not found in FUB (404)")
            else:
                errors += 1
                print(f"  [ERROR] API error: {response.status_code}")

            # Rate limiting: 3 requests per second = ~180 per minute
            if idx % 180 == 0:
                print(f"\n  [PAUSE] Rate limit pause (processed {idx} people)...\n")
                time.sleep(60)
            else:
                time.sleep(0.35)  # ~3 requests per second

        except Exception as e:
            errors += 1
            print(f"  [ERROR] Error: {e}")
            continue

    # Final commit
    conn.commit()
    conn.close()

    # Print summary
    print(f"\n{'='*80}")
    print(f"BACKFILL COMPLETE")
    print(f"{'='*80}")
    print(f"[OK] Records updated: {updated_count}")
    print(f"[WARN] No campaign in FUB: {no_campaign_in_fub}")
    print(f"[ERROR] Not found in FUB: {not_found_count}")
    print(f"[ERROR] Errors: {errors}")
    print(f"{'='*80}\n")

if __name__ == '__main__':
    import sys

    # Allow specifying days back as command line argument
    days = 7
    if len(sys.argv) > 1:
        try:
            days = int(sys.argv[1])
        except ValueError:
            print("Usage: python backfill_campaign_ids.py [days_back]")
            sys.exit(1)

    backfill_campaign_ids(days_back=days)
