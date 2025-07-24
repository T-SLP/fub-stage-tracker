#!/usr/bin/env python3
"""
Manual population script for existing stage_changes records
This will update existing records with custom fields and tags from FollowUpBoss

Save this file as: populate_custom_fields.py
"""

import requests
import psycopg2
import psycopg2.extras
import json
import os
import base64
import time
from datetime import datetime

# === CONFIG ===
FUB_API_KEY = os.getenv("FUB_API_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")


def extract_custom_fields(person):
    return {
        'campaign_id': person.get('customCampaignID'),  # CORRECT: customCampaignID (with capital D)
        'who_pushed_lead': person.get('customWhoPushedTheLead'),  # Already correct
        'parcel_county': person.get('customParcelCounty'),  # Already correct
        'parcel_state': person.get('customParcelState')  # Already correct
    }

def extract_lead_source_tag(tags):
    """Extract specific lead source tag from tags array"""
    if not tags or not isinstance(tags, list):
        return None

    if "ReadyMode" in tags:
        return "ReadyMode"
    elif "Roor" in tags:
        return "Roor"

    return None


def get_fub_person(person_id):
    """Fetch a single person from FollowUpBoss API"""
    url = f"https://api.followupboss.com/v1/people/{person_id}?fields=allFields"  # ADD THIS!

    # Get environment variables with fallback
    fub_api_key = os.getenv('FUB_API_KEY')
    fub_system_key = os.getenv('FUB_SYSTEM_KEY')

    if not fub_api_key:
        print(f"ERROR: FUB_API_KEY not set when trying to fetch person {person_id}")
        return None

    if not fub_system_key:
        print(f"ERROR: FUB_SYSTEM_KEY not set when trying to fetch person {person_id}")
        return None

    auth_string = base64.b64encode(f"{fub_api_key}:".encode("utf-8")).decode("utf-8")
    headers = {
        "Authorization": f"Basic {auth_string}",
        "X-System": "SynergyFUBLeadMetrics",
        "X-System-Key": fub_system_key
    }

    try:
        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            return response.json()
        elif response.status_code == 404:
            print(f"Person {person_id} not found in FollowUpBoss")
            return None
        elif response.status_code == 401:
            print(f"Authentication failed for person {person_id} - check your FUB credentials")
            return None
        else:
            print(f"Error fetching person {person_id}: HTTP {response.status_code}")
            return None

    except Exception as e:
        print(f"Exception fetching person {person_id}: {e}")
        return None


def update_record_custom_fields(conn, record_id, custom_fields):
    """Update a single record with custom fields"""
    with conn.cursor() as cur:
        query = """
        UPDATE stage_changes 
        SET campaign_id = %s,
            who_pushed_lead = %s,
            parcel_county = %s,
            parcel_state = %s,
            lead_source_tag = %s
        WHERE id = %s
        """

        cur.execute(query, (
            custom_fields['campaign_id'],
            custom_fields['who_pushed_lead'],
            custom_fields['parcel_county'],
            custom_fields['parcel_state'],
            custom_fields['lead_source_tag'],
            record_id
        ))
        conn.commit()


def populate_existing_records():
    """Main function to populate existing records"""
    print("Starting manual population of existing stage_changes records...")
    print("This will update records that don't have custom field data yet.")

    # DEBUG: Check what environment variables the script sees
    print("\n=== ENVIRONMENT VARIABLE DEBUG ===")
    fub_api_key = os.getenv('FUB_API_KEY', 'NOT SET')
    supabase_url = os.getenv('SUPABASE_DB_URL', 'NOT SET')
    fub_system_key = os.getenv('FUB_SYSTEM_KEY', 'NOT SET')

    print(f"FUB_API_KEY: {fub_api_key[:15] if fub_api_key != 'NOT SET' else 'NOT SET'}...")
    print(f"FUB_SYSTEM_KEY: {fub_system_key[:15] if fub_system_key != 'NOT SET' else 'NOT SET'}...")
    print(f"SUPABASE_DB_URL: {supabase_url[:60] if supabase_url != 'NOT SET' else 'NOT SET'}...")
    print("=== END DEBUG ===\n")

    if supabase_url == 'NOT SET':
        print("ERROR: SUPABASE_DB_URL environment variable is not set!")
        print("Please run: source .env")
        return

    if fub_api_key == 'NOT SET':
        print("ERROR: FUB_API_KEY environment variable is not set!")
        print("Please run: source .env")
        return

    if fub_system_key == 'NOT SET':
        print("ERROR: FUB_SYSTEM_KEY environment variable is not set!")
        print("Please run: source .env")
        return

    # Connect to database
    conn = psycopg2.connect(supabase_url, sslmode='require')

    # Get records that need custom field data
    with conn.cursor() as cur:
        query = """
        SELECT DISTINCT person_id, id 
        FROM stage_changes 
        WHERE campaign_id IS NULL 
           OR who_pushed_lead IS NULL 
           OR parcel_county IS NULL 
           OR parcel_state IS NULL 
           OR lead_source_tag IS NULL
        ORDER BY person_id
        """
        cur.execute(query)
        records_to_update = cur.fetchall()

    print(f"Found {len(records_to_update)} records that need custom field data")

    if not records_to_update:
        print("No records need updating. All done!")
        conn.close()
        return

    # Group by person_id to avoid duplicate API calls
    person_ids = {}
    for person_id, record_id in records_to_update:
        if person_id not in person_ids:
            person_ids[person_id] = []
        person_ids[person_id].append(record_id)

    print(f"Will fetch data for {len(person_ids)} unique people")

    updated_count = 0
    error_count = 0
    api_calls = 0

    for i, (person_id, record_ids) in enumerate(person_ids.items(), 1):
        try:
            # Rate limiting - be respectful to FUB API
            if api_calls > 0 and api_calls % 60 == 0:  # Every 60 requests
                print(f"Rate limiting: sleeping 10 seconds after {api_calls} API calls")
                time.sleep(10)

            # Fetch person data from FollowUpBoss
            person_data = get_fub_person(person_id)
            api_calls += 1

            if not person_data:
                print(f"Skipping person {person_id} - not found or error")
                error_count += len(record_ids)
                continue

            # Extract custom fields
            custom_fields = extract_custom_fields(person_data)
            custom_fields['lead_source_tag'] = extract_lead_source_tag(person_data.get('tags'))

            # Update all records for this person
            for record_id in record_ids:
                try:
                    update_record_custom_fields(conn, record_id, custom_fields)
                    updated_count += 1
                except Exception as e:
                    print(f"Error updating record {record_id}: {e}")
                    error_count += 1

            # Progress update
            if i % 10 == 0:
                print(f"Progress: {i}/{len(person_ids)} people processed, {updated_count} records updated")

            # Small delay between requests
            time.sleep(0.1)

        except Exception as e:
            print(f"Error processing person {person_id}: {e}")
            error_count += len(record_ids)

    conn.close()

    print(f"\nManual population complete!")
    print(f"Records updated: {updated_count}")
    print(f"Errors: {error_count}")
    print(f"API calls made: {api_calls}")


def populate_specific_person(person_id):
    """Update records for a specific person"""
    print(f"Updating records for person {person_id}...")

    # Check environment variables
    supabase_url = os.getenv('SUPABASE_DB_URL')
    if not supabase_url:
        print("ERROR: SUPABASE_DB_URL environment variable is not set!")
        return

    conn = psycopg2.connect(supabase_url, sslmode='require')

    # Get person data from FollowUpBoss
    person_data = get_fub_person(person_id)
    if not person_data:
        print(f"Person {person_id} not found")
        conn.close()
        return

    # Extract custom fields
    custom_fields = extract_custom_fields(person_data)
    custom_fields['lead_source_tag'] = extract_lead_source_tag(person_data.get('tags'))

    # Get all records for this person
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM stage_changes WHERE person_id = %s", (person_id,))
        record_ids = [row[0] for row in cur.fetchall()]

    print(f"Found {len(record_ids)} records for person {person_id}")

    # Update each record
    updated = 0
    for record_id in record_ids:
        try:
            update_record_custom_fields(conn, record_id, custom_fields)
            updated += 1
        except Exception as e:
            print(f"Error updating record {record_id}: {e}")

    conn.close()
    print(f"Updated {updated} records for person {person_id}")


def check_sample_data():
    """Check a few records to see the custom field data"""
    print("Checking sample records with custom field data...")

    # Check environment variables
    supabase_url = os.getenv('SUPABASE_DB_URL')
    if not supabase_url:
        print("ERROR: SUPABASE_DB_URL environment variable is not set!")
        return

    conn = psycopg2.connect(supabase_url, sslmode='require')

    with conn.cursor() as cur:
        query = """
        SELECT person_id, first_name, last_name, 
               campaign_id, who_pushed_lead, parcel_county, parcel_state, lead_source_tag
        FROM stage_changes 
        WHERE campaign_id IS NOT NULL 
           OR who_pushed_lead IS NOT NULL 
           OR parcel_county IS NOT NULL 
           OR parcel_state IS NOT NULL 
           OR lead_source_tag IS NOT NULL
        LIMIT 10
        """
        cur.execute(query)
        results = cur.fetchall()

    if results:
        print(f"Found {len(results)} records with custom field data:")
        for row in results:
            print(f"  {row[1]} {row[2]} (ID: {row[0]})")
            print(f"    Campaign: {row[3]}, Pushed by: {row[4]}")
            print(f"    County: {row[5]}, State: {row[6]}, Tag: {row[7]}")
            print()
    else:
        print("No records found with custom field data yet")

    conn.close()


if __name__ == "__main__":
    print("FUB Custom Fields Population Tool")
    print("=" * 40)
    print("1. Populate all existing records")
    print("2. Populate specific person by ID")
    print("3. Check sample data")
    print()

    choice = input("Enter choice (1, 2, or 3): ").strip()

    if choice == "1":
        confirm = input("This will update ALL existing records. Continue? (y/n): ")
        if confirm.lower() == 'y':
            populate_existing_records()
        else:
            print("Cancelled")

    elif choice == "2":
        person_id = input("Enter person ID: ").strip()
        if person_id:
            populate_specific_person(person_id)
        else:
            print("Invalid person ID")

    elif choice == "3":
        check_sample_data()

    else:
        print("Invalid choice")