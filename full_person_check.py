import requests, base64, os, json

person_id = '197187'
fub_api_key = os.getenv('FUB_API_KEY')
fub_system_key = os.getenv('FUB_SYSTEM_KEY')

url = f'https://api.followupboss.com/v1/people/{person_id}'
auth = base64.b64encode(f'{fub_api_key}:'.encode()).decode()
headers = {
    'Authorization': f'Basic {auth}', 
    'X-System': 'SynergyFUBLeadMetrics', 
    'X-System-Key': fub_system_key
}

print(f"Fetching complete data for person {person_id}...")
response = requests.get(url, headers=headers)

if response.status_code == 200:
    person = response.json()
    print(f'Person: {person.get("firstName", "")} {person.get("lastName", "")}')
    print(f'ID: {person.get("id")}')
    print(f'Stage: {person.get("stage", "N/A")}')
    
    # Print the ENTIRE response formatted
    print(f"\n=== COMPLETE PERSON DATA ===")
    print(json.dumps(person, indent=2))
    
    print(f"\n=== SUMMARY ===")
    print(f"Total fields in response: {len(person.keys())}")
    
    # Count custom fields
    custom_fields = [k for k in person.keys() if k.startswith('custom')]
    print(f"Custom field keys found: {len(custom_fields)}")
    
    if custom_fields:
        print("Custom fields (ALL, including empty):")
        for field in sorted(custom_fields):
            value = person.get(field)
            print(f"  {field}: {repr(value)}")
    
else:
    print(f'Error: HTTP {response.status_code}')
    print(response.text)