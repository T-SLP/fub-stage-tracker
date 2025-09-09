"""
Quick Fix for Rose Hutton & Gary Yarbrough Missing Stages
Modified to work without interactive input - you'll need to edit the credentials below
"""

import requests
import base64
import json
import datetime
import psycopg2
import psycopg2.extras

# *** CREDENTIALS FROM ENVIRONMENT OR EDIT BELOW ***
import os
# EDIT THESE WITH YOUR ACTUAL CREDENTIALS:
FUB_API_KEY = os.getenv("FUB_API_KEY", "fka_0DxOlS07NmHLDLVjKXB7N9qJyOSM4QtM2u")  # Get from FUB Admin -> API
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "postgresql://postgres.jefrfayzrxfcjeviwfhw:UnVen%25SUBJd%26%237%40@aws-0-us-east-2.pooler.supabase.com:5432/postgres")  # Your database connection string

# Person IDs from your database query
ROSE_HUTTON_ID = "265312"
GARY_YARBROUGH_ID = "273178"

def get_person_from_fub(person_id: str):
    """Get current person data from FUB API"""
    if not FUB_API_KEY or FUB_API_KEY == "your_fub_api_key_here":
        print("ERROR: Please edit the script and add your FUB_API_KEY")
        return None
        
    headers = {
        "Authorization": f"Basic {base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()}",
        "Content-Type": "application/json",
        "X-System": "SynergyFUBLeadMetrics"
    }
    
    try:
        url = f"https://api.followupboss.com/v1/people/{person_id}?fields=allFields"
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code == 200:
            return response.json()
        else:
            print(f"[ERROR] Failed to fetch person {person_id}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"[ERROR] Error fetching person {person_id}: {e}")
        return None

def get_latest_db_stage(person_id: str):
    """Get person's latest stage from database"""
    if not SUPABASE_DB_URL or SUPABASE_DB_URL == "PASTE_YOUR_DATABASE_URL_HERE":
        print("[ERROR] Please edit the script and add your SUPABASE_DB_URL")
        return None
        
    try:
        conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute("""
                SELECT stage_to, changed_at, first_name, last_name
                FROM stage_changes 
                WHERE person_id = %s 
                ORDER BY changed_at DESC 
                LIMIT 1
            """, (person_id,))
            result = cur.fetchone()
            return dict(result) if result else None
    except Exception as e:
        print(f"[ERROR] Error getting latest stage for {person_id}: {e}")
        return None
    finally:
        if 'conn' in locals():
            conn.close()

def add_stage_record(person_data, from_stage: str, to_stage: str, hours_ago: int = 2):
    """Add stage change record to database"""
    if not SUPABASE_DB_URL or SUPABASE_DB_URL == "PASTE_YOUR_DATABASE_URL_HERE":
        print("[ERROR] Please edit the script and add your SUPABASE_DB_URL")
        return False
        
    try:
        conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
        
        # Create stage change record
        stage_record = {
            'person_id': str(person_data.get('id')),
            'deal_id': person_data.get('dealId'),
            'first_name': person_data.get('firstName'),
            'last_name': person_data.get('lastName'),
            'stage_from': from_stage,
            'stage_to': to_stage,
            'changed_at': datetime.datetime.utcnow() - datetime.timedelta(hours=hours_ago),
            'received_at': datetime.datetime.utcnow(),
            'source': 'manual_fix_missing_stages',
            'event_id': f"fix_{person_data.get('id')}_{to_stage.replace(' ', '_').replace('-', '_')}_{int(datetime.datetime.utcnow().timestamp())}",
            'raw_payload': json.dumps(person_data),
            'campaign_id': person_data.get('customCampaignID'),
            'who_pushed_lead': person_data.get('customWhoPushedTheLead'),
            'parcel_county': person_data.get('customParcelCounty'),
            'parcel_state': person_data.get('customParcelState'),
            'lead_source_tag': "ReadyMode" if "ReadyMode" in person_data.get('tags', []) else ("Roor" if "Roor" in person_data.get('tags', []) else None)
        }
        
        with conn.cursor() as cur:
            query = """
                INSERT INTO stage_changes (
                    person_id, deal_id, first_name, last_name,
                    stage_from, stage_to, changed_at, received_at, 
                    source, event_id, raw_payload,
                    campaign_id, who_pushed_lead, parcel_county, parcel_state, lead_source_tag
                ) VALUES (
                    %(person_id)s, %(deal_id)s, %(first_name)s, %(last_name)s,
                    %(stage_from)s, %(stage_to)s, %(changed_at)s, %(received_at)s,
                    %(source)s, %(event_id)s, %(raw_payload)s,
                    %(campaign_id)s, %(who_pushed_lead)s, %(parcel_county)s, 
                    %(parcel_state)s, %(lead_source_tag)s
                )
                ON CONFLICT (event_id) DO NOTHING
                RETURNING id
            """
            
            cur.execute(query, stage_record)
            result = cur.fetchone()
            conn.commit()
            return result is not None
            
    except Exception as e:
        print(f"[ERROR] Error adding stage record: {e}")
        return False
    finally:
        if 'conn' in locals():
            conn.close()

def check_offers_made_record_exists(person_id: str):
    """Check if 'ACQ - Offers Made' record exists for this person"""
    if not SUPABASE_DB_URL or SUPABASE_DB_URL == "PASTE_YOUR_DATABASE_URL_HERE":
        return False
        
    try:
        conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*) FROM stage_changes 
                WHERE person_id = %s AND stage_to = 'ACQ - Offers Made'
            """, (person_id,))
            count = cur.fetchone()[0]
            return count > 0
    except Exception as e:
        print(f"[ERROR] Error checking offers made record: {e}")
        return False
    finally:
        if 'conn' in locals():
            conn.close()

def add_stage_record_at_time(person_data, from_stage: str, to_stage: str, target_time: str):
    """Add stage change record at specific time"""
    if not SUPABASE_DB_URL or SUPABASE_DB_URL == "PASTE_YOUR_DATABASE_URL_HERE":
        print("[ERROR] Please edit the script and add your SUPABASE_DB_URL")
        return False
        
    try:
        conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
        
        # Parse target time
        from datetime import datetime
        changed_at = datetime.strptime(target_time, "%Y-%m-%d %H:%M:%S")
        
        # Create stage change record
        stage_record = {
            'person_id': str(person_data.get('id')),
            'deal_id': person_data.get('dealId'),
            'first_name': person_data.get('firstName'),
            'last_name': person_data.get('lastName'),
            'stage_from': from_stage,
            'stage_to': to_stage,
            'changed_at': changed_at,
            'received_at': datetime.utcnow(),
            'source': 'manual_fix',
            'event_id': f"fix_{person_data.get('id')}_om_{int(changed_at.timestamp())}",
            'raw_payload': json.dumps(person_data),
            'campaign_id': person_data.get('customCampaignID'),
            'who_pushed_lead': person_data.get('customWhoPushedTheLead'),
            'parcel_county': person_data.get('customParcelCounty'),
            'parcel_state': person_data.get('customParcelState'),
            'lead_source_tag': "ReadyMode" if "ReadyMode" in person_data.get('tags', []) else ("Roor" if "Roor" in person_data.get('tags', []) else None)
        }
        
        with conn.cursor() as cur:
            query = """
                INSERT INTO stage_changes (
                    person_id, deal_id, first_name, last_name,
                    stage_from, stage_to, changed_at, received_at, 
                    source, event_id, raw_payload,
                    campaign_id, who_pushed_lead, parcel_county, parcel_state, lead_source_tag
                ) VALUES (
                    %(person_id)s, %(deal_id)s, %(first_name)s, %(last_name)s,
                    %(stage_from)s, %(stage_to)s, %(changed_at)s, %(received_at)s,
                    %(source)s, %(event_id)s, %(raw_payload)s,
                    %(campaign_id)s, %(who_pushed_lead)s, %(parcel_county)s, 
                    %(parcel_state)s, %(lead_source_tag)s
                )
            """
            
            cur.execute(query, stage_record)
            conn.commit()
            return True
            
    except Exception as e:
        print(f"[ERROR] Error adding stage record at time: {e}")
        return False
    finally:
        if 'conn' in locals():
            conn.close()

def fix_rose_hutton():
    """Fix Rose Hutton's missing stages"""
    print("[ROSE] Fixing Rose Hutton's missing stages...")
    
    # Get current FUB data
    fub_data = get_person_from_fub(ROSE_HUTTON_ID)
    if not fub_data:
        return False
    
    current_fub_stage = fub_data.get('stage')
    print(f"   [INFO] Current FUB stage: {current_fub_stage}")
    
    # Check if "ACQ - Offers Made" record exists
    if not check_offers_made_record_exists(ROSE_HUTTON_ID):
        print("   [TARGET] MISSING 'ACQ - Offers Made' STAGE DETECTED!")
        print("   [ACTION] Adding missing 'ACQ - Offers Made' stage...")
        
        # Add the missing "ACQ - Offers Made" stage between the existing records
        # Set it 2 hours after "ACQ - Qualified" (around 2025-09-03 01:59:33)
        success = add_stage_record_at_time(
            fub_data, 
            "ACQ - Qualified", 
            "ACQ - Offers Made", 
            target_time="2025-09-03 01:59:33"
        )
        
        if success:
            print("   [SUCCESS] Added missing 'ACQ - Offers Made' stage!")
            return True
        else:
            print("   [ERROR] Failed to add missing stage")
            return False
    else:
        print("   [INFO] 'ACQ - Offers Made' record already exists")
        return True

def fix_gary_yarbrough():
    """Fix Gary Yarbrough's missing stages"""
    print("[GARY] Fixing Gary Yarbrough's missing stages...")
    
    # Get current FUB data
    fub_data = get_person_from_fub(GARY_YARBROUGH_ID) 
    if not fub_data:
        return False
    
    current_fub_stage = fub_data.get('stage')
    print(f"   [INFO] Current FUB stage: {current_fub_stage}")
    
    # Get database data
    db_data = get_latest_db_stage(GARY_YARBROUGH_ID)
    if not db_data:
        print("   [ERROR] No database record found")
        return False
    
    current_db_stage = db_data['stage_to'] 
    print(f"   [DB] Current DB stage: {current_db_stage}")
    
    if current_db_stage != current_fub_stage:
        print(f"   [TARGET] STAGE MISMATCH DETECTED!")
        print(f"   [ACTION] Adding: {current_db_stage} → {current_fub_stage}")
        
        success = add_stage_record(fub_data, current_db_stage, current_fub_stage, hours_ago=1)
        if success:
            print(f"   [SUCCESS] Added: {current_db_stage} → {current_fub_stage}")
        return success
    else:
        print("   [INFO]  Stages already match")
        return True

def main():
    """Main function"""
    print("Starting Missing Stage Fix for Rose Hutton & Gary Yarbrough")
    print("=" * 60)
    
    # Check credentials
    if FUB_API_KEY == "PASTE_YOUR_FUB_API_KEY_HERE" or not FUB_API_KEY:
        print("[ERROR] ERROR: FUB_API_KEY not configured")
        print("   Set environment variable: set FUB_API_KEY=your_key")
        print("   Or edit this script and replace 'your_fub_api_key_here'")
        print("   Get it from: FUB Admin -> API")
        return
    
    if SUPABASE_DB_URL == "PASTE_YOUR_DATABASE_URL_HERE" or not SUPABASE_DB_URL:
        print("[ERROR] ERROR: SUPABASE_DB_URL not configured")
        print("   Set environment variable: set SUPABASE_DB_URL=your_url") 
        print("   Or edit this script and replace 'your_supabase_db_url_here'")
        print("   Format: postgresql://user:password@host:port/database")
        return
    
    print("[SUCCESS] Credentials configured")
    print()
    
    # Fix Rose Hutton
    rose_success = fix_rose_hutton()
    print()
    
    # Fix Gary Yarbrough  
    gary_success = fix_gary_yarbrough()
    print()
    
    # Summary
    print("=" * 60)
    if rose_success and gary_success:
        print("[SUCCESS] SUCCESS! Missing stages have been added to the database.")
        print()
        print("[CHECK] Now run your SQL query again:")
        print("   SELECT first_name, last_name, stage_to, changed_at")
        print("   FROM stage_changes")
        print("   WHERE (first_name = 'Rose' AND last_name = 'Hutton')")
        print("   AND stage_to = 'ACQ - Offers Made'")
        print("   ORDER BY changed_at DESC;")
        print()
        print("[SUCCESS] You should now see Rose Hutton's 'ACQ - Offers Made' record!")
    else:
        print("[WARNING]  Some fixes may have failed. Check the output above for details.")

if __name__ == "__main__":
    main()