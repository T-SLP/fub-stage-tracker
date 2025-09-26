#!/usr/bin/env python3
"""
Debug webhook format to understand why webhooks are being ignored
"""

import requests
import json

# Test with a more realistic FUB webhook format based on actual FUB documentation
test_webhooks = [
    {
        "name": "FUB Test Format 1 - URI based",
        "payload": {
            "event": "peopleStageUpdated",
            "uri": "https://api.followupboss.com/v1/people/123456"
        }
    },
    {
        "name": "FUB Test Format 2 - Data based",
        "payload": {
            "event": "peopleStageUpdated",
            "data": {
                "people": [{
                    "id": 123456,
                    "firstName": "Test",
                    "lastName": "Person",
                    "stage": "ACQ - Qualified"
                }]
            }
        }
    },
    {
        "name": "FUB Test Format 3 - Mixed format",
        "payload": {
            "event": "peopleStageUpdated",
            "uri": "https://api.followupboss.com/v1/people/123456",
            "data": {
                "people": [{
                    "id": "123456",
                    "firstName": "Test",
                    "lastName": "Person"
                }]
            }
        }
    }
]

webhook_url = "https://fub-stage-tracker-production.up.railway.app/webhook/fub/stage-change"

print("Testing different webhook formats to find why they're being ignored...")

for test in test_webhooks:
    print(f"\nTesting: {test['name']}")

    try:
        response = requests.post(
            webhook_url,
            json=test['payload'],
            headers={'Content-Type': 'application/json'},
            timeout=10
        )

        result = response.json()
        print(f"  Status: {response.status_code}")
        print(f"  Response: {result}")

    except Exception as e:
        print(f"  Error: {e}")

print("\nTest completed. Check Railway health endpoint to see if any were processed.")