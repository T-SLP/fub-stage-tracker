#!/usr/bin/env python3
"""
Fix FUB Webhook Registration
Delete old webhooks and register new ones with correct URL
"""

import requests
import base64
import json
import time

# Configuration
FUB_API_KEY = "fka_0DxOlS07NmHLDLVjKXB7N9qJyOSM4QtM2u"
FUB_SYSTEM_KEY = "390b59dea776f1d5216843d3dfd5a127"
CORRECT_WEBHOOK_URL = "https://fub-stage-tracker-production.up.railway.app/webhook/fub/stage-change"

RELEVANT_WEBHOOK_EVENTS = [
    'peopleStageUpdated',  # Most important - direct stage changes
    'peopleCreated',       # New leads
    'peopleUpdated',       # General updates that might include stage changes
    'peopleTagsCreated'    # Tag changes (for lead source tracking)
]

def get_auth_headers():
    return {
        'Authorization': f"Basic {base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()}",
        'X-System': 'SynergyFUBLeadMetrics',
        'X-System-Key': FUB_SYSTEM_KEY
    }

def get_existing_webhooks():
    """Get all existing webhooks"""
    try:
        response = requests.get(
            'https://api.followupboss.com/v1/webhooks',
            headers=get_auth_headers(),
            timeout=30
        )
        if response.status_code == 200:
            return response.json().get('webhooks', [])
        else:
            print(f"Failed to get webhooks: {response.status_code} - {response.text}")
            return []
    except Exception as e:
        print(f"Error getting webhooks: {e}")
        return []

def delete_webhook(webhook_id):
    """Delete a specific webhook"""
    try:
        response = requests.delete(
            f'https://api.followupboss.com/v1/webhooks/{webhook_id}',
            headers=get_auth_headers(),
            timeout=30
        )
        if response.status_code == 204:
            print(f"  Deleted webhook ID {webhook_id}")
            return True
        else:
            print(f"  Failed to delete webhook {webhook_id}: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"  Error deleting webhook {webhook_id}: {e}")
        return False

def register_webhook(event):
    """Register a new webhook"""
    try:
        data = {
            "event": event,
            "url": CORRECT_WEBHOOK_URL
        }
        
        response = requests.post(
            'https://api.followupboss.com/v1/webhooks',
            headers={**get_auth_headers(), 'Content-Type': 'application/json'},
            json=data,
            timeout=30
        )
        
        if response.status_code == 201:
            webhook_data = response.json()
            print(f"  Successfully registered {event} webhook (ID: {webhook_data.get('id')})")
            return True
        else:
            print(f"  Failed to register {event} webhook: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"  Error registering {event} webhook: {e}")
        return False

if __name__ == "__main__":
    print("FUB Webhook Fix Script")
    print("=" * 50)
    
    # Step 1: Get existing webhooks
    print("1. Getting existing webhooks...")
    existing_webhooks = get_existing_webhooks()
    print(f"   Found {len(existing_webhooks)} existing webhooks")
    
    # Step 2: Delete old webhooks
    print("\n2. Deleting old webhooks...")
    deleted_count = 0
    for webhook in existing_webhooks:
        webhook_id = webhook.get('id')
        webhook_url = webhook.get('url', '')
        if 'web-production-cd698.up.railway.app' in webhook_url:
            if delete_webhook(webhook_id):
                deleted_count += 1
            time.sleep(1)  # Rate limiting
    
    print(f"   Deleted {deleted_count} old webhooks")
    
    # Step 3: Register new webhooks
    print("\n3. Registering new webhooks...")
    print(f"   Target URL: {CORRECT_WEBHOOK_URL}")
    
    success_count = 0
    for event in RELEVANT_WEBHOOK_EVENTS:
        print(f"   Registering {event}...")
        if register_webhook(event):
            success_count += 1
        time.sleep(1)  # Rate limiting
    
    print(f"\n4. Summary:")
    print(f"   Deleted old webhooks: {deleted_count}")
    print(f"   Registered new webhooks: {success_count}/{len(RELEVANT_WEBHOOK_EVENTS)}")
    
    if success_count == len(RELEVANT_WEBHOOK_EVENTS):
        print("\n   SUCCESS: Webhook system is now correctly configured!")
        print(f"   Test endpoint: {CORRECT_WEBHOOK_URL}")
    else:
        print("\n   WARNING: Some webhook registrations failed")