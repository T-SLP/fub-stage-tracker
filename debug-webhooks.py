#!/usr/bin/env python3
"""
Debug FUB Webhook Registration
Check if webhooks are properly registered with Follow Up Boss
"""

import os
import requests
import base64
import json
from datetime import datetime, timedelta

# Configuration
FUB_API_KEY = "fka_0DxOlS07NmHLDLVjKXB7N9qJyOSM4QtM2u"
FUB_SYSTEM_KEY = "390b59dea776f1d5216843d3dfd5a127"

def check_existing_webhooks():
    """List all existing webhooks registered with FUB"""
    print("Checking existing FUB webhooks...")
    
    try:
        response = requests.get(
            'https://api.followupboss.com/v1/webhooks',
            headers={
                'Authorization': f"Basic {base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()}",
                'X-System': 'SynergyFUBLeadMetrics',
                'X-System-Key': FUB_SYSTEM_KEY
            },
            timeout=30
        )

        if response.status_code == 200:
            webhooks = response.json().get('webhooks', [])
            print(f"Found {len(webhooks)} registered webhooks:")
            for webhook in webhooks:
                print(f"   - {webhook.get('event')} -> {webhook.get('url')} (ID: {webhook.get('id')})")
            return webhooks
        else:
            print(f"Failed to list webhooks: {response.status_code} - {response.text}")
            return []

    except Exception as e:
        print(f"Error listing webhooks: {e}")
        return []

def check_recent_fub_activity():
    """Check recent activity in FUB to see if anything should have triggered webhooks"""
    print("\nChecking recent FUB activity...")
    
    try:
        # Check people updated in last 24 hours
        yesterday = (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
        
        response = requests.get(
            f'https://api.followupboss.com/v1/people?updated={yesterday}&sort=-updated',
            headers={
                'Authorization': f"Basic {base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()}",
                'X-System': 'SynergyFUBLeadMetrics'
            },
            timeout=30
        )

        if response.status_code == 200:
            data = response.json()
            people = data.get('people', [])
            print(f"Found {len(people)} people updated since yesterday")
            
            # Check for offers made today
            offers_made_today = []
            for person in people:
                if person.get('stage') == 'ACQ - Offers Made':
                    offers_made_today.append(f"{person.get('firstName', '')} {person.get('lastName', '')} (ID: {person.get('id')})")
            
            if offers_made_today:
                print(f"Found {len(offers_made_today)} people currently in 'ACQ - Offers Made' stage:")
                for person in offers_made_today:
                    print(f"   - {person}")
            else:
                print("No people currently in 'ACQ - Offers Made' stage")
                
            return len(offers_made_today)
        else:
            print(f"Failed to check FUB activity: {response.status_code} - {response.text}")
            return 0

    except Exception as e:
        print(f"Error checking FUB activity: {e}")
        return 0

def test_webhook_endpoint():
    """Test if our webhook endpoint is accessible"""
    print("\nTesting webhook endpoint accessibility...")
    
    webhook_url = "https://fub-stage-tracker-production.up.railway.app/webhook/fub/stage-change"
    
    try:
        response = requests.post(
            webhook_url,
            json={"event": "test", "resourceIds": []},
            timeout=30
        )
        
        if response.status_code == 200:
            print(f"Webhook endpoint is accessible and responding")
            print(f"   Response: {response.text}")
            return True
        else:
            print(f"Webhook endpoint issue: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"Error testing webhook endpoint: {e}")
        return False

if __name__ == "__main__":
    print("FUB Webhook Debug Report")
    print("=" * 50)
    
    # Check existing webhook registrations
    webhooks = check_existing_webhooks()
    
    # Check recent FUB activity
    offers_count = check_recent_fub_activity()
    
    # Test webhook endpoint
    webhook_works = test_webhook_endpoint()
    
    print("\nSUMMARY:")
    print(f"   Registered webhooks: {len(webhooks)}")
    print(f"   Current offers made: {offers_count}")
    print(f"   Webhook endpoint working: {'Yes' if webhook_works else 'No'}")
    
    if len(webhooks) == 0:
        print("\nISSUE: No webhooks registered with FUB!")
        print("   Solution: Re-register webhooks using the registration script")
    elif offers_count > 0 and webhook_works:
        print("\nISSUE: Webhooks registered and endpoint works, but no recent webhook activity")
        print("   Possible causes:")
        print("   - FUB webhooks may have been disabled")
        print("   - Stage changes happened before webhook registration")
        print("   - FUB webhook delivery issues")
    else:
        print("\nSystem appears configured correctly")