import requests
import base64
import os
import json

# Get environment variables
fub_api_key = os.getenv('FUB_API_KEY')
fub_system_key = os.getenv('FUB_SYSTEM_KEY')

print("=== CUSTOM FIELDS ANALYSIS ===")

# Get custom fields list
url = "https://api.followupboss.com/v1/customFields"
auth_string = base64.b64encode(f"{fub_api_key}:".encode("utf-8")).decode("utf-8")
headers = {
    "Authorization": f"Basic {auth_string}",
    "X-System": "SynergyFUBLeadMetrics",
    "X-System-Key": fub_system_key
}

response = requests.get(url, headers=headers)
data = response.json()

print("Fields available in your FollowUpBoss account:")
print("=" * 50)

custom_fields = data['customfields']
for field in custom_fields:
    name = field['name']
    label = field['label']
    field_type = field['type']
    print(f"API Name: {name}")
    print(f"  Label: '{label}'")
    print(f"  Type: {field_type}")
    print()

print("=" * 50)
print("ANALYSIS:")

# Check what we're looking for vs what exists
our_fields = {
    'campaign_id': 'customCampaignId',
    'who_pushed_lead': 'customWhoPushedTheLead',
    'parcel_county': 'customParcelCounty',
    'parcel_state': 'customParcelState'
}

existing_names = [f['name'] for f in custom_fields]

print("\nWhat our script is looking for vs what exists:")
for db_field, api_field in our_fields.items():
    if api_field in existing_names:
        print(f"✅ {db_field}: Looking for '{api_field}' - FOUND")
    else:
        print(f"❌ {db_field}: Looking for '{api_field}' - NOT FOUND")

print(f"\nPotential campaign fields (looking for 'campaign' or 'marketing'):")
for field in custom_fields:
    name = field['name']
    label = field['label'].lower()
    if 'campaign' in label or 'marketing' in label or 'source' in label:
        print(f"  🎯 {name} ('{field['label']}')")

print(f"\nPotential county/state fields:")
for field in custom_fields:
    name = field['name']
    label = field['label'].lower()
    if 'county' in label or 'state' in label or 'location' in label or 'address' in label:
        print(f"  📍 {name} ('{field['label']}')")

print(f"\n🔧 RECOMMENDED FIXES:")
print("Based on your available fields, update your script to use:")

# Find the best matches
marketing_field = None
who_pushed_field = None

for field in custom_fields:
    name = field['name']
    label = field['label'].lower()

    if name == 'customWhoPushedTheLead':
        who_pushed_field = name

    if 'marketing' in label and 'channel' in label:
        marketing_field = name

if marketing_field:
    print(f"  campaign_id: '{marketing_field}' instead of 'customCampaignId'")
else:
    print("  campaign_id: No obvious campaign field found")

if who_pushed_field:
    print(f"  who_pushed_lead: '{who_pushed_field}' (correct)")
else:
    print("  who_pushed_lead: Field not found")

print("  parcel_county: No county field found - may need to be created")
print("  parcel_state: No state field found - may need to be created")