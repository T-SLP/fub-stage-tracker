#!/usr/bin/env python3
"""
Fix FUB Webhook Registration - Optimized Version
Delete old webhooks and register new ones with correct URL
Uses shared utilities for consistency and reduced duplication
"""

import sys
import os
import time

# Add the project root to Python path so we can import shared utilities
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from shared.fub_api import get_fub_client

# Configuration
CORRECT_WEBHOOK_URL = "https://fub-stage-tracker-production.up.railway.app/webhook/fub/stage-change"

RELEVANT_WEBHOOK_EVENTS = [
    'peopleStageUpdated',  # Most important - direct stage changes
    'peopleCreated',       # New leads
    'peopleUpdated',       # General updates that might include stage changes
    'peopleTagsCreated'    # Tag changes (for lead source tracking)
]

def fix_webhooks():
    """Delete old webhooks and register new ones with correct URL"""
    fub = get_fub_client()
    
    print("FUB Webhook Fix Script (Optimized)")
    print("=" * 50)
    
    # Step 1: Get existing webhooks
    print("1. Getting existing webhooks...")
    existing_webhooks = fub.list_webhooks()
    print(f"   Found {len(existing_webhooks)} existing webhooks")
    
    # Step 2: Delete old webhooks with wrong URL
    print("\n2. Deleting old webhooks...")
    deleted_count = 0
    for webhook in existing_webhooks:
        webhook_id = webhook.get('id')
        webhook_url = webhook.get('url', '')
        if 'web-production-cd698.up.railway.app' in webhook_url:
            if fub.delete_webhook(webhook_id):
                print(f"  Deleted webhook ID {webhook_id}")
                deleted_count += 1
            time.sleep(1)  # Rate limiting
    
    print(f"   Deleted {deleted_count} old webhooks")
    
    # Step 3: Register new webhooks
    print("\n3. Registering new webhooks...")
    print(f"   Target URL: {CORRECT_WEBHOOK_URL}")
    
    success_count = 0
    for event in RELEVANT_WEBHOOK_EVENTS:
        print(f"   Registering {event}...")
        result = fub.register_webhook(event, CORRECT_WEBHOOK_URL)
        if result:
            print(f"  Successfully registered {event} webhook (ID: {result.get('id')})")
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

if __name__ == "__main__":
    fix_webhooks()