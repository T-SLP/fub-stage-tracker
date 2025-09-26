#!/usr/bin/env python3
"""
Direct deployment of enhanced webhook server to Railway
"""
import requests
import json
import time

def deploy_webhook_fix():
    """Test if the enhanced person ID extraction works with our server"""
    webhook_url = "https://fub-stage-tracker-production.up.railway.app/webhook/fub/stage-change"

    # Test with different webhook formats that FUB might use
    test_webhooks = [
        {
            "name": "URI format",
            "data": {
                "uri": "/people/63334/stage-changes",
                "event": "peopleStageUpdated"
            }
        },
        {
            "name": "personId format",
            "data": {
                "personId": 63334,
                "event": "peopleStageUpdated"
            }
        },
        {
            "name": "subject format",
            "data": {
                "subject": {"id": 63334},
                "event": "peopleStageUpdated"
            }
        },
        {
            "name": "data.person format",
            "data": {
                "data": {"person": {"id": 63334}},
                "event": "peopleStageUpdated"
            }
        }
    ]

    print("Testing enhanced person ID extraction patterns...")

    for test in test_webhooks:
        print(f"\nTesting {test['name']}...")
        try:
            response = requests.post(
                webhook_url,
                json=test["data"],
                timeout=10
            )
            print(f"  Response: {response.status_code}")
            if response.text:
                print(f"  Message: {response.json()}")

        except Exception as e:
            print(f"  Error: {e}")

    print("\nTest complete. Check webhook server health for processing stats.")

if __name__ == "__main__":
    deploy_webhook_fix()