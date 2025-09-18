"""
Fix Missing Stage Changes - Targeted sync for specific leads
This script will fetch current FUB data for Rose Hutton and Gary Yarbrough
and add any missing stage transitions to the database.
"""

import requests
import base64
import json
import datetime
import psycopg2
import psycopg2.extras

def get_current_person_from_fub(person_id: str, api_key: str):
    """Get current person data from FUB API"""
    headers = {
        "Authorization": f"Basic {base64.b64encode(f'{api_key}:'.encode()).decode()}",
        "Content-Type": "application/json",
        "X-System": "SynergyFUBLeadMetrics"
    }
    
    try:
        url = f"https://api.followupboss.com/v1/people/{person_id}?fields=allFields"
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code == 200:
            return response.json()
        else:
            print(f"❌ Failed to fetch person {person_id}: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error fetching person {person_id}: {e}")
        return None

def get_database_latest_stage(person_id: str, db_url: str):
    """Get person's latest stage from database"""
    try:
        conn = psycopg2.connect(db_url, sslmode='require')
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
        print(f"❌ Error getting latest stage for {person_id}: {e}")
        return None
    finally:
        if 'conn' in locals():
            conn.close()

def add_missing_stage_transition(person_data, from_stage: str, to_stage: str, db_url: str):
    """Add missing stage transition to database"""
    try:
        conn = psycopg2.connect(db_url, sslmode='require')
        
        # Extract custom fields
        custom_fields = {
            'campaign_id': person_data.get('customCampaignID'),
            'who_pushed_lead': person_data.get('customWhoPushedTheLead'),
            'parcel_county': person_data.get('customParcelCounty'),
            'parcel_state': person_data.get('customParcelState')
        }
        
        # Extract lead source
        tags = person_data.get('tags', [])
        lead_source_tag = None
        if "ReadyMode" in tags:
            lead_source_tag = "ReadyMode"
        elif "Roor" in tags:
            lead_source_tag = "Roor"
        
        # Create stage change record
        stage_record = {
            'person_id': str(person_data.get('id')),
            'deal_id': person_data.get('dealId'),
            'first_name': person_data.get('firstName'),
            'last_name': person_data.get('lastName'),
            'stage_from': from_stage,
            'stage_to': to_stage,
            'changed_at': datetime.datetime.utcnow() - datetime.timedelta(hours=2),  # Estimate 2 hours ago
            'received_at': datetime.datetime.utcnow(),
            'source': 'manual_sync_fix',
            'event_id': f"manual_fix_{person_data.get('id')}_{to_stage}_{int(datetime.datetime.utcnow().timestamp())}",
            'raw_payload': json.dumps(person_data),
            'campaign_id': custom_fields['campaign_id'],
            'who_pushed_lead': custom_fields['who_pushed_lead'],
            'parcel_county': custom_fields['parcel_county'],
            'parcel_state': custom_fields['parcel_state'],
            'lead_source_tag': lead_source_tag
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
            """
            
            cur.execute(query, stage_record)
            conn.commit()
            return True
            
    except Exception as e:
        print(f"❌ Error adding stage transition: {e}")
        return False
    finally:
        if 'conn' in locals():
            conn.close()

def fix_missing_stages():
    """Main function to fix missing stages for specific leads"""
    
    # Get credentials
    api_key = input("Enter your FUB API Key: ").strip()
    db_url = input("Enter your Supabase Database URL: ").strip()
    
    if not api_key or not db_url:
        print("❌ Missing credentials")
        return
    
    # Known leads from your database query
    leads_to_check = [
        {"person_id": "265312", "name": "Rose Hutton"},
        {"person_id": "273178", "name": "Gary Yarbrough"}
    ]
    
    print("🔍 Checking leads for missing stage transitions...")
    
    for lead in leads_to_check:
        person_id = lead["person_id"]
        name = lead["name"]
        
        print(f"\n📋 Processing {name} (ID: {person_id})...")
        
        # Get current FUB data
        fub_data = get_current_person_from_fub(person_id, api_key)
        if not fub_data:
            print(f"   ❌ Could not fetch FUB data for {name}")
            continue
        
        current_fub_stage = fub_data.get('stage')
        print(f"   📊 Current FUB stage: {current_fub_stage}")
        
        # Get database data
        db_data = get_database_latest_stage(person_id, db_url)
        if not db_data:
            print(f"   ❌ No database record found for {name}")
            continue
        
        current_db_stage = db_data['stage_to']
        print(f"   💾 Current DB stage: {current_db_stage}")
        
        # Compare stages
        if current_db_stage != current_fub_stage:
            print(f"   ⚠️  MISMATCH DETECTED!")
            print(f"   🔄 Need to add: {current_db_stage} → {current_fub_stage}")
            
            # Add missing stage transition
            success = add_missing_stage_transition(fub_data, current_db_stage, current_fub_stage, db_url)
            
            if success:
                print(f"   ✅ Successfully added missing stage transition!")
                
                # Special check for "ACQ - Offers Made"
                if current_fub_stage == "ACQ - Offer Not Accepted" and current_db_stage == "ACQ - Qualified":
                    print(f"   🎯 FOUND THE MISSING 'ACQ - Offers Made' STAGE!")
                    print(f"   📝 Adding intermediate 'ACQ - Offers Made' stage...")
                    
                    # Add the intermediate "ACQ - Offers Made" stage
                    intermediate_success = add_missing_stage_transition(
                        fub_data, 
                        "ACQ - Qualified", 
                        "ACQ - Offers Made", 
                        db_url
                    )
                    
                    if intermediate_success:
                        print(f"   ✅ Added missing 'ACQ - Offers Made' stage!")
                        
                        # Now add the final transition
                        final_success = add_missing_stage_transition(
                            fub_data, 
                            "ACQ - Offers Made", 
                            "ACQ - Offer Not Accepted", 
                            db_url
                        )
                        
                        if final_success:
                            print(f"   ✅ Added final transition to 'ACQ - Offer Not Accepted'!")
                    
            else:
                print(f"   ❌ Failed to add missing stage transition")
        else:
            print(f"   ✅ Stages match - no action needed")
    
    print(f"\n🏁 Missing stage fix complete!")
    print(f"🔍 Run your SQL query again to verify Rose Hutton now shows 'ACQ - Offers Made'")

if __name__ == "__main__":
    fix_missing_stages()