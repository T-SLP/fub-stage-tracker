import requests, base64, os, json

person_id = '197187'
fub_api_key = os.getenv('FUB_API_KEY')
fub_system_key = os.getenv('FUB_SYSTEM_KEY')

print("=" * 60)
print("TESTING CUSTOM FIELDS WITH fields=allFields PARAMETER")
print("=" * 60)

# Test WITHOUT fields parameter first (our original approach)
print("\n1. Testing WITHOUT fields=allFields (original approach):")
url1 = f'https://api.followupboss.com/v1/people/{person_id}'
auth = base64.b64encode(f'{fub_api_key}:'.encode()).decode()
headers = {
    'Authorization': f'Basic {auth}', 
    'X-System': 'SynergyFUBLeadMetrics', 
    'X-System-Key': fub_system_key
}

response1 = requests.get(url1, headers=headers)
if response1.status_code == 200:
    person1 = response1.json()
    custom_fields1 = [k for k in person1.keys() if k.startswith('custom')]
    print(f"   Custom fields found: {len(custom_fields1)}")
else:
    print(f"   Error: {response1.status_code}")

# Test WITH fields=allFields parameter (the fix)
print("\n2. Testing WITH fields=allFields (should show custom fields):")
url2 = f'https://api.followupboss.com/v1/people/{person_id}?fields=allFields'

response2 = requests.get(url2, headers=headers)
if response2.status_code == 200:
    person2 = response2.json()
    print(f'   Person: {person2.get("firstName", "")} {person2.get("lastName", "")}')
    
    # Find custom fields
    custom_fields2 = [k for k in person2.keys() if k.startswith('custom')]
    print(f"   Custom fields found: {len(custom_fields2)}")
    
    if custom_fields2:
        print("\n   Custom fields with data:")
        has_data = False
        for field in sorted(custom_fields2):
            value = person2.get(field)
            if value:  # Only show non-empty
                print(f"     ✅ {field}: {value}")
                has_data = True
        
        if not has_data:
            print("     (All custom fields are empty/null for this person)")
        
        print(f"\n   All custom fields (including empty):")
        for field in sorted(custom_fields2):
            value = person2.get(field)
            status = "✅ HAS DATA" if value else "❌ EMPTY"
            print(f"     {field}: {repr(value)} {status}")
            
        # Look for our specific fields
        print(f"\n   CHECKING FOR OUR TARGET FIELDS:")
        target_fields = {
            'Campaign ID': ['customCampaignId', 'customMarketingChannel', 'customCampaign'],
            'Who Pushed Lead': ['customWhoPushedTheLead', 'customWhoPushed'],
            'Parcel County': ['customParcelCounty', 'customCounty'],
            'Parcel State': ['customParcelState', 'customState']
        }
        
        for label, possible_names in target_fields.items():
            found = False
            for name in possible_names:
                if name in custom_fields2:
                    value = person2.get(name)
                    status = f"✅ FOUND: {value}" if value else "⚠️  FOUND BUT EMPTY"
                    print(f"     {label}: {name} - {status}")
                    found = True
                    break
            if not found:
                print(f"     {label}: ❌ NOT FOUND (tried: {', '.join(possible_names)})")
    else:
        print("   No custom fields found even with allFields parameter")
        
else:
    print(f'   Error: HTTP {response2.status_code}')
    print(f'   Response: {response2.text}')

print(f"\n" + "=" * 60)
print("CONCLUSION:")
if response1.status_code == 200 and response2.status_code == 200:
    custom1_count = len([k for k in person1.keys() if k.startswith('custom')])
    custom2_count = len([k for k in person2.keys() if k.startswith('custom')])
    
    if custom2_count > custom1_count:
        print("✅ SUCCESS: fields=allFields parameter reveals more custom fields!")
        print(f"   Without parameter: {custom1_count} custom fields")
        print(f"   With parameter: {custom2_count} custom fields")
    elif custom2_count == custom1_count == 0:
        print("⚠️  Both requests show 0 custom fields - person may not have any data")
    else:
        print(f"📊 Both requests show {custom1_count} custom fields")
else:
    print("❌ One or both requests failed")

print("=" * 60)