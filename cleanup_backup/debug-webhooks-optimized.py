#!/usr/bin/env python3
"""
Debug FUB Webhook Registration - Optimized Version
Check if webhooks are properly registered with Follow Up Boss
Uses shared utilities for consistency and reduced duplication
"""

import sys
import os
import requests
from datetime import datetime, timedelta

# Add the project root to Python path so we can import shared utilities
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from shared.fub_api import get_fub_client

def check_existing_webhooks():
    """List all existing webhooks registered with FUB"""
    print("Checking existing FUB webhooks...")
    
    fub = get_fub_client()
    webhooks = fub.list_webhooks()
    
    print(f"Found {len(webhooks)} registered webhooks:")
    for webhook in webhooks:
        print(f"   - {webhook.get('event')} -> {webhook.get('url')} (ID: {webhook.get('id')})")
    
    return webhooks

def check_recent_fub_activity():
    """Check recent activity in FUB to see if anything should have triggered webhooks"""
    print("\nChecking recent FUB activity...")
    
    fub = get_fub_client()
    
    # Check people updated in last 24 hours
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
    people = fub.get_recent_people(yesterday)
    
    print(f"Found {len(people)} people updated since yesterday")
    
    # Check for offers made today
    offers_made_today = []
    for person in people:
        if person.get('stage') == 'ACQ - Offers Made':
            full_name = f"{person.get('firstName', '')} {person.get('lastName', '')}"
            offers_made_today.append(f"{full_name} (ID: {person.get('id')})")
    
    if offers_made_today:
        print(f"Found {len(offers_made_today)} people currently in 'ACQ - Offers Made' stage:")
        for person in offers_made_today:
            print(f"   - {person}")
    else:
        print("No people currently in 'ACQ - Offers Made' stage")
        
    return len(offers_made_today)

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
    print("FUB Webhook Debug Report (Optimized)")
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