"""
FUB Missing Stage Sync Script
Comprehensive script to identify and sync missing stage changes between 
FollowUpBoss and your database for ALL leads.
"""

import os
import requests
import base64
import json
import datetime
import psycopg2
import psycopg2.extras
from typing import List, Dict, Any, Optional

# Configuration - You'll need to set these
FUB_API_KEY = input("Enter your FUB API Key: ").strip()
SUPABASE_DB_URL = input("Enter your Supabase Database URL: ").strip()

# FUB API Base
FUB_API_BASE = "https://api.followupboss.com/v1"

# Standard FUB Stages in order
STANDARD_FUB_STAGES = [
    "Contact Upload", "ACQ - New Lead", "ACQ - Attempted Contact",
    "ACQ - Contacted", "ACQ - Qualified", "ACQ - Offers Made",
    "ACQ - Price Motivated", "ACQ - Under Contract", "ACQ - Closed Won",
    "ACQ - Closed Lost", "ACQ - On Hold", "ACQ - Not Qualified",
    "ACQ - Offer Not Accepted"  # Added this stage
]

def get_fub_headers():
    """Get FUB API headers"""
    return {
        "Authorization": f"Basic {base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()}",
        "Content-Type": "application/json",
        "X-System": "SynergyFUBLeadMetrics"
    }

def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(SUPABASE_DB_URL, sslmode='require')

def fetch_all_people_from_fub(limit_days: int = 30) -> List[Dict]:
    """Fetch all people from FUB with recent activity"""
    print(f"🔍 Fetching all people from FUB with activity in last {limit_days} days...")
    
    # Calculate date filter
    cutoff_date = datetime.datetime.now() - datetime.timedelta(days=limit_days)
    cutoff_str = cutoff_date.strftime("%Y-%m-%d")
    
    all_people = []
    offset = 0
    limit = 100  # FUB API limit
    
    while True:
        try:
            url = f"{FUB_API_BASE}/people"
            params = {
                'fields': 'allFields',
                'limit': limit,
                'offset': offset,
                'updatedAfter': cutoff_str
            }
            
            response = requests.get(url, headers=get_fub_headers(), params=params, timeout=30)
            
            if response.status_code != 200:
                print(f"❌ Error fetching people: {response.status_code} - {response.text}")
                break
                
            data = response.json()
            people = data.get('people', [])
            
            if not people:
                print(f"✅ Finished fetching. Total people retrieved: {len(all_people)}")
                break
                
            all_people.extend(people)
            print(f"📥 Fetched {len(people)} people (total: {len(all_people)})")
            
            offset += limit
            
            # Rate limiting
            import time
            time.sleep(0.5)
            
        except Exception as e:
            print(f"❌ Error fetching people: {e}")
            break
    
    return all_people

def get_database_stage_history(person_id: str) -> List[Dict]:
    """Get person's stage history from database"""
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute("""
                SELECT person_id, stage_from, stage_to, changed_at, campaign_id, lead_source_tag
                FROM stage_changes 
                WHERE person_id = %s 
                ORDER BY changed_at ASC
            """, (person_id,))
            return [dict(row) for row in cur.fetchall()]
    except Exception as e:
        print(f"❌ Error getting stage history for {person_id}: {e}")
        return []
    finally:
        if 'conn' in locals():
            conn.close()

def get_all_people_in_database() -> Dict[str, Dict]:
    """Get all people currently in the database with their latest stage"""
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT
                    person_id,
                    first_name,
                    last_name,
                    MAX(changed_at) as last_change,
                    (
                        SELECT stage_to 
                        FROM stage_changes sc2 
                        WHERE sc2.person_id = stage_changes.person_id 
                        ORDER BY changed_at DESC 
                        LIMIT 1
                    ) as current_stage_in_db
                FROM stage_changes 
                GROUP BY person_id, first_name, last_name
            """)
            
            result = {}
            for row in cur.fetchall():
                result[row['person_id']] = dict(row)
            return result
    except Exception as e:
        print(f"❌ Error getting database people: {e}")
        return {}
    finally:
        if 'conn' in locals():
            conn.close()

def extract_custom_fields(person: Dict) -> Dict:
    """Extract custom fields from FUB person data"""
    return {
        'campaign_id': person.get('customCampaignID'),
        'who_pushed_lead': person.get('customWhoPushedTheLead'),
        'parcel_county': person.get('customParcelCounty'),
        'parcel_state': person.get('customParcelState')
    }

def extract_lead_source_tag(tags) -> Optional[str]:
    """Extract lead source from tags"""
    if not tags or not isinstance(tags, list):
        return None
    if "ReadyMode" in tags:
        return "ReadyMode"
    elif "Roor" in tags:
        return "Roor"
    return None

def get_stage_priority(stage_name: str) -> int:
    """Get stage priority for progression analysis"""
    try:
        return STANDARD_FUB_STAGES.index(stage_name)
    except ValueError:
        return 999  # Unknown/custom stage

def infer_missing_stages(current_stage_in_db: str, current_stage_in_fub: str) -> List[str]:
    """Infer what stages were likely missed between database and FUB"""
    db_priority = get_stage_priority(current_stage_in_db)
    fub_priority = get_stage_priority(current_stage_in_fub)
    
    if fub_priority <= db_priority:
        return []  # No forward progression
    
    # Get stages between current DB stage and FUB stage
    missing_stages = []
    for i in range(db_priority + 1, fub_priority + 1):
        if i < len(STANDARD_FUB_STAGES):
            missing_stages.append(STANDARD_FUB_STAGES[i])
    
    return missing_stages

def create_missing_stage_record(person: Dict, stage_from: str, stage_to: str, estimated_time: datetime.datetime) -> Dict:
    """Create a stage change record for missing transition"""
    custom_fields = extract_custom_fields(person)
    lead_source_tag = extract_lead_source_tag(person.get('tags'))
    
    return {
        'person_id': str(person.get('id')),
        'deal_id': person.get('dealId'),
        'first_name': person.get('firstName'),
        'last_name': person.get('lastName'),
        'stage_from': stage_from,
        'stage_to': stage_to,
        'changed_at': estimated_time,
        'received_at': datetime.datetime.utcnow(),
        'source': 'manual_sync_missing',
        'event_id': f"sync_missing_{person.get('id')}_{stage_to}_{int(estimated_time.timestamp())}",
        'raw_payload': json.dumps(person),
        'campaign_id': custom_fields['campaign_id'],
        'who_pushed_lead': custom_fields['who_pushed_lead'],
        'parcel_county': custom_fields['parcel_county'],
        'parcel_state': custom_fields['parcel_state'],
        'lead_source_tag': lead_source_tag
    }

def save_missing_stage_change(stage_record: Dict) -> bool:
    """Save missing stage change to database"""
    try:
        conn = get_db_connection()
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
            """
            
            cur.execute(query, stage_record)
            conn.commit()
            return True
    except Exception as e:
        print(f"❌ Error saving stage change: {e}")
        return False
    finally:
        if 'conn' in locals():
            conn.close()

def analyze_and_sync_missing_stages():
    """Main function to analyze and sync missing stages"""
    print("🚀 Starting FUB Missing Stage Sync Analysis...")
    
    # Step 1: Get all people from database
    print("\n📊 Step 1: Getting current database state...")
    db_people = get_all_people_in_database()
    print(f"Found {len(db_people)} people in database")
    
    # Step 2: Get recent people from FUB
    print("\n📥 Step 2: Fetching recent data from FUB...")
    fub_people = fetch_all_people_from_fub(limit_days=30)
    print(f"Fetched {len(fub_people)} people from FUB")
    
    # Step 3: Analyze discrepancies
    print("\n🔍 Step 3: Analyzing stage discrepancies...")
    
    missing_stages_found = []
    people_with_discrepancies = []
    
    for fub_person in fub_people:
        person_id = str(fub_person.get('id'))
        current_fub_stage = fub_person.get('stage')
        first_name = fub_person.get('firstName', '')
        last_name = fub_person.get('lastName', '')
        
        if not person_id or not current_fub_stage:
            continue
            
        # Check if person exists in database
        if person_id in db_people:
            db_info = db_people[person_id]
            current_db_stage = db_info['current_stage_in_db']
            
            # Compare stages
            if current_db_stage != current_fub_stage:
                people_with_discrepancies.append({
                    'person_id': person_id,
                    'first_name': first_name,
                    'last_name': last_name,
                    'db_stage': current_db_stage,
                    'fub_stage': current_fub_stage,
                    'fub_person_data': fub_person
                })
                
                # Infer missing stages
                missing_stages = infer_missing_stages(current_db_stage, current_fub_stage)
                if missing_stages:
                    missing_stages_found.extend([{
                        'person': fub_person,
                        'missing_stages': missing_stages,
                        'from_stage': current_db_stage
                    }])
    
    # Step 4: Report findings
    print(f"\n📈 Analysis Results:")
    print(f"   People with stage discrepancies: {len(people_with_discrepancies)}")
    print(f"   People with missing stage transitions: {len(missing_stages_found)}")
    
    if people_with_discrepancies:
        print(f"\n🔍 Stage Discrepancies Found:")
        for person in people_with_discrepancies[:10]:  # Show first 10
            print(f"   {person['first_name']} {person['last_name']}: DB='{person['db_stage']}' vs FUB='{person['fub_stage']}'")
        
        if len(people_with_discrepancies) > 10:
            print(f"   ... and {len(people_with_discrepancies) - 10} more")
    
    # Step 5: Check for specific leads
    print(f"\n🎯 Checking specific leads (Rose Hutton & Gary Yarbrough):")
    
    rose_found = False
    gary_found = False
    
    for person in people_with_discrepancies:
        if person['first_name'].lower() == 'rose' and person['last_name'].lower() == 'hutton':
            print(f"   ✅ Rose Hutton: DB='{person['db_stage']}' → FUB='{person['fub_stage']}'")
            rose_found = True
        elif person['first_name'].lower() == 'gary' and person['last_name'].lower() == 'yarbrough':
            print(f"   ✅ Gary Yarbrough: DB='{person['db_stage']}' → FUB='{person['fub_stage']}'")
            gary_found = True
    
    if not rose_found:
        print("   ⚠️ Rose Hutton: No discrepancy found (may be in sync)")
    if not gary_found:
        print("   ⚠️ Gary Yarbrough: No discrepancy found (may be in sync)")
    
    # Step 6: Offer to fix missing stages
    if missing_stages_found:
        print(f"\n💡 Found {len(missing_stages_found)} people with missing stage transitions.")
        fix_missing = input("Would you like to add the missing stage records? (y/n): ").lower().strip()
        
        if fix_missing == 'y':
            print("🔧 Adding missing stage transitions...")
            
            total_added = 0
            for person_missing in missing_stages_found:
                person = person_missing['person']
                missing_stages = person_missing['missing_stages']
                from_stage = person_missing['from_stage']
                
                print(f"\n   Processing {person.get('firstName')} {person.get('lastName')}...")
                
                current_stage = from_stage
                base_time = datetime.datetime.utcnow() - datetime.timedelta(days=7)  # Estimate a week ago
                
                for i, missing_stage in enumerate(missing_stages):
                    # Estimate time for each missing stage (spread over the past week)
                    estimated_time = base_time + datetime.timedelta(days=i)
                    
                    stage_record = create_missing_stage_record(
                        person, current_stage, missing_stage, estimated_time
                    )
                    
                    if save_missing_stage_change(stage_record):
                        print(f"     ✅ Added: {current_stage} → {missing_stage}")
                        total_added += 1
                    else:
                        print(f"     ❌ Failed to add: {current_stage} → {missing_stage}")
                    
                    current_stage = missing_stage
            
            print(f"\n🎉 Added {total_added} missing stage transitions!")
        else:
            print("📋 Skipping fixes. Run the script again anytime to apply fixes.")
    else:
        print("\n✅ No missing stage transitions detected!")
    
    print(f"\n🏁 Sync analysis complete!")

if __name__ == "__main__":
    if not FUB_API_KEY or not SUPABASE_DB_URL:
        print("❌ Missing required credentials. Please run the script and enter your API key and database URL.")
        exit(1)
        
    try:
        analyze_and_sync_missing_stages()
    except KeyboardInterrupt:
        print("\n⏹️ Script interrupted by user")
    except Exception as e:
        print(f"\n❌ Script error: {e}")
        import traceback
        traceback.print_exc()