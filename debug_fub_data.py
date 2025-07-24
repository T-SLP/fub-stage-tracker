import requests
import json
import os
import base64
from pprint import pprint

# === CONFIG ===
FUB_API_KEY = os.getenv("FUB_API_KEY")

def debug_fub_api_response():
    """
    Fetch a small sample of people from FUB API and examine the exact data structure
    to understand how custom fields are actually named and structured
    """
    print("🔍 DEBUGGING FUB API Response Structure...")
    print("=" * 60)
    
    url = "https://api.followupboss.com/v1/people"
    auth_string = base64.b64encode(f"{FUB_API_KEY}:".encode("utf-8")).decode("utf-8")
    headers = {
        "Authorization": f"Basic {auth_string}",
        "X-System": "SynergyFUBLeadMetrics",
        "X-System-Key": os.getenv("FUB_SYSTEM_KEY")
    }
    
    # Get just 5 people with ALL fields to examine structure
    params = {
        "limit": 5,
        "fields": "allFields"
    }
    
    try:
        resp = requests.get(url, headers=headers, params=params)
        
        if resp.status_code != 200:
            print(f"❌ API Error: {resp.status_code}")
            print(resp.text)
            return
            
        data = resp.json()
        people = data.get("people", [])
        
        if not people:
            print("❌ No people returned from API")
            return
            
        print(f"✅ Successfully fetched {len(people)} people")
        print("\n" + "=" * 60)
        
        # Examine each person's structure
        for i, person in enumerate(people, 1):
            print(f"\n👤 PERSON {i}: {person.get('firstName', 'Unknown')} {person.get('lastName', 'Unknown')}")
            print("-" * 40)
            
            # Show all top-level keys
            print(f"🔑 Top-level keys: {list(person.keys())}")
            
            # Look for custom fields in different possible locations
            print(f"\n📋 Custom Field Analysis:")
            
            # Method 1: Direct custom field access (current approach)
            custom_campaign_id = person.get('customCampaignID')
            custom_who_pushed = person.get('customWhoPushedTheLead')
            custom_parcel_county = person.get('customParcelCounty')
            custom_parcel_state = person.get('customParcelState')
            
            print(f"  📌 Direct access:")
            print(f"     customCampaignID: {custom_campaign_id}")
            print(f"     customWhoPushedTheLead: {custom_who_pushed}")
            print(f"     customParcelCounty: {custom_parcel_county}")
            print(f"     customParcelState: {custom_parcel_state}")
            
            # Method 2: Look for 'customFields' object
            if 'customFields' in person:
                print(f"  📌 customFields object found:")
                pprint(person['customFields'], indent=6)
            else:
                print(f"  📌 No 'customFields' object found")
            
            # Method 3: Look for any keys containing 'custom'
            custom_keys = [key for key in person.keys() if 'custom' in key.lower()]
            if custom_keys:
                print(f"  📌 Keys containing 'custom': {custom_keys}")
                for key in custom_keys:
                    print(f"     {key}: {person[key]}")
            else:
                print(f"  📌 No keys containing 'custom' found")
            
            # Method 4: Look for tags
            tags = person.get('tags', [])
            print(f"  📌 Tags: {tags}")
            
            # Method 5: Show full person object for first person (to see everything)
            if i == 1:
                print(f"\n📄 FULL PERSON OBJECT (Person 1):")
                print("=" * 60)
                pprint(person, indent=2)
                print("=" * 60)
            
        print(f"\n🔍 DIAGNOSIS COMPLETE")
        print("=" * 60)
        print("📝 Next steps:")
        print("1. Check if custom fields appear in the data above")
        print("2. Note the exact field names and structure")
        print("3. Update the extract_custom_fields() function accordingly")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")

def check_database_schema():
    """
    Quick check to see what columns exist in your stage_changes table
    """
    print("\n🗄️  DATABASE SCHEMA CHECK")
    print("=" * 60)
    
    # You can run this query in your Supabase SQL editor:
    query = """
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'stage_changes'
    ORDER BY ordinal_position;
    """
    
    print("Run this query in your Supabase SQL editor to check your table structure:")
    print("-" * 60)
    print(query)
    print("-" * 60)
    print("Look for these columns:")
    print("- campaign_id")
    print("- who_pushed_lead") 
    print("- parcel_county")
    print("- parcel_state")
    print("- lead_source_tag")

def test_custom_field_extraction():
    """
    Test the current custom field extraction logic with sample data
    """
    print("\n🧪 TESTING CUSTOM FIELD EXTRACTION")
    print("=" * 60)
    
    # Sample test data structures to test different scenarios
    test_cases = [
        {
            "name": "Direct custom fields",
            "person": {
                "id": "123",
                "firstName": "John",
                "lastName": "Doe",
                "customCampaignID": "CAMP001",
                "customWhoPushedTheLead": "Agent Smith",
                "customParcelCounty": "Orange County",
                "customParcelState": "CA",
                "tags": ["ReadyMode", "Premium"]
            }
        },
        {
            "name": "Custom fields in object",
            "person": {
                "id": "456", 
                "firstName": "Jane",
                "lastName": "Smith",
                "customFields": {
                    "campaignID": "CAMP002",
                    "whoPushedTheLead": "Agent Jones",
                    "parcelCounty": "Los Angeles County",
                    "parcelState": "CA"
                },
                "tags": ["Roor"]
            }
        },
        {
            "name": "No custom fields",
            "person": {
                "id": "789",
                "firstName": "Bob", 
                "lastName": "Wilson",
                "tags": []
            }
        }
    ]
    
    from fub_stage_tracker import extract_custom_fields, extract_lead_source_tag
    
    for test_case in test_cases:
        print(f"\n📋 Test Case: {test_case['name']}")
        print("-" * 30)
        
        person = test_case['person']
        custom_fields = extract_custom_fields(person)
        lead_source = extract_lead_source_tag(person.get('tags'))
        
        print(f"Input person: {person.get('firstName')} {person.get('lastName')}")
        print(f"Extracted custom fields: {custom_fields}")
        print(f"Extracted lead source: {lead_source}")
        
        # Check for NULLs
        null_fields = [key for key, value in custom_fields.items() if value is None]
        if null_fields:
            print(f"⚠️  NULL fields detected: {null_fields}")
        else:
            print(f"✅ All fields populated")

if __name__ == "__main__":
    print("🚀 FUB DATA STRUCTURE DEBUGGER")
    print("=" * 60)
    print("This script will help diagnose why custom fields are NULL")
    print()
    
    # Step 1: Check actual API response structure
    debug_fub_api_response()
    
    # Step 2: Show how to check database schema
    check_database_schema()
    
    # Step 3: Test extraction logic
    test_custom_field_extraction()
    
    print(f"\n💡 TROUBLESHOOTING TIPS:")
    print("=" * 60)
    print("1. Custom field names in FUB might be different than expected")
    print("2. Custom fields might be in a nested 'customFields' object")
    print("3. Field names might have different capitalization")
    print("4. Your database columns might not exist or have wrong names")
    print("5. The data might actually be NULL in FUB (not all leads have custom data)")
    print("\nRun this script first, then we'll fix the extraction logic!")
