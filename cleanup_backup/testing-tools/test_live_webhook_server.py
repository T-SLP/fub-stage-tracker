"""
Live Webhook Server Test
Tests the actual 24/7 webhook server to verify it captures real stage changes
"""

import requests
import json
import time
import datetime
import psycopg2
import psycopg2.extras

# Configuration
WEBHOOK_SERVER_URL = "https://web-production-cd698.up.railway.app"
SUPABASE_DB_URL = "postgresql://postgres.jefrfayzrxfcjeviwfhw:UnVen%25SUBJd%26%237%40@aws-0-us-east-2.pooler.supabase.com:5432/postgres"
FUB_API_KEY = "fka_0DxOlS07NmHLDLVjKXB7N9qJyOSM4QtM2u"

class LiveWebhookTest:
    def __init__(self):
        self.test_start_time = datetime.datetime.utcnow()

    def check_server_status(self):
        """Check current webhook server status"""
        print("🏥 Checking Live Webhook Server Status")
        print("=" * 50)
        
        try:
            # Try health endpoint
            response = requests.get(f"{WEBHOOK_SERVER_URL}/health", timeout=10)
            if response.status_code == 200:
                health = response.json()
                print("✅ Health endpoint responding:")
                print(f"   Status: {health.get('status', 'unknown')}")
                print(f"   Healthy: {health.get('healthy', False)}")
                print(f"   Uptime: {health.get('uptime_hours', 0)} hours")
                print(f"   Webhooks processed: {health.get('webhooks_processed', 0)}")
                print(f"   Stage changes captured: {health.get('stage_changes_captured', 0)}")
                print(f"   Queue size: {health.get('queue_size', 0)}")
                return True
            else:
                print(f"❌ Health endpoint failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Cannot reach health endpoint: {e}")
            
        try:
            # Try stats endpoint as backup
            response = requests.get(f"{WEBHOOK_SERVER_URL}/stats", timeout=10)
            if response.status_code == 200:
                stats = response.json()
                print("📊 Stats endpoint responding:")
                health = stats.get('health', {})
                print(f"   Webhooks processed: {health.get('webhooks_processed', 0)}")
                print(f"   Stage changes captured: {health.get('stage_changes_captured', 0)}")
                print(f"   Success rate: {health.get('success_rate', 0)}%")
                return True
            else:
                print(f"❌ Stats endpoint failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Cannot reach stats endpoint: {e}")
            
        return False

    def send_test_webhook(self, person_id: str, stage_from: str, stage_to: str):
        """Send a test webhook to the live server"""
        print(f"📤 Sending test webhook: {stage_from} → {stage_to}")
        
        # Create realistic webhook payload matching FUB format
        webhook_payload = {
            "event": "peopleStageUpdated",
            "uri": f"/v1/people/{person_id}",
            "eventId": f"test_{person_id}_{int(time.time())}_{stage_to.replace(' ', '_')}",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "created": datetime.datetime.utcnow().isoformat()
        }
        
        try:
            response = requests.post(
                f"{WEBHOOK_SERVER_URL}/webhook/fub/stage-change",
                json=webhook_payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "FollowUpBoss-Webhooks/1.0"
                },
                timeout=10
            )
            
            if response.status_code == 200:
                print(f"   ✅ Webhook accepted by server")
                return True
            else:
                print(f"   ❌ Webhook rejected: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"   ❌ Webhook send failed: {e}")
            return False

    def check_fub_api_connectivity(self):
        """Test if the webhook server can reach FUB API"""
        print("\n🔗 Testing FUB API Connectivity")
        print("=" * 40)
        
        try:
            # Test FUB API access directly
            headers = {
                "Authorization": f"Basic {requests.auth._basic_auth_str(FUB_API_KEY, '')}",
                "Content-Type": "application/json"
            }
            
            response = requests.get(
                "https://api.followupboss.com/v1/people?limit=1",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                print("✅ FUB API accessible")
                data = response.json()
                if data.get('people'):
                    person = data['people'][0]
                    print(f"   Sample person: {person.get('firstName', 'N/A')} {person.get('lastName', 'N/A')}")
                    print(f"   Current stage: {person.get('stage', 'N/A')}")
                    return True
            else:
                print(f"❌ FUB API failed: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ FUB API test failed: {e}")
            return False

    def check_recent_webhook_activity(self):
        """Check for recent webhook activity in database"""
        print("\n📊 Checking Recent Webhook Activity")
        print("=" * 40)
        
        try:
            conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                # Check for any recent stage changes from webhooks
                cur.execute("""
                    SELECT source, COUNT(*) as count, MAX(received_at) as latest
                    FROM stage_changes 
                    WHERE received_at >= NOW() - INTERVAL '24 hours'
                    GROUP BY source
                    ORDER BY count DESC
                """, ())
                
                recent_activity = cur.fetchall()
                
                if recent_activity:
                    print("Recent 24-hour activity by source:")
                    webhook_activity = False
                    for row in recent_activity:
                        print(f"   {row['source']}: {row['count']} records (latest: {row['latest']})")
                        if 'webhook' in row['source']:
                            webhook_activity = True
                    
                    if not webhook_activity:
                        print("⚠️  No webhook activity in past 24 hours - server may not be processing webhooks")
                    
                    return webhook_activity
                else:
                    print("❌ No stage change activity in past 24 hours")
                    return False
                    
        except Exception as e:
            print(f"❌ Database check failed: {e}")
            return False
        finally:
            if 'conn' in locals():
                conn.close()

    def simulate_rapid_stage_test(self):
        """Simulate the rapid stage scenario that caused Rose Hutton's issue"""
        print("\n🚀 Simulating Rapid Stage Test")
        print("=" * 40)
        
        test_person_id = "999998"  # Use unique test ID
        
        # Record baseline stats
        try:
            response = requests.get(f"{WEBHOOK_SERVER_URL}/health", timeout=5)
            if response.status_code == 200:
                baseline_stats = response.json()
                baseline_captured = baseline_stats.get('stage_changes_captured', 0)
                print(f"📊 Baseline stage changes captured: {baseline_captured}")
            else:
                baseline_captured = None
        except:
            baseline_captured = None
        
        # Send rapid stage progression
        stages = [
            ("ACQ - Qualified", "ACQ - Offers Made"),
            ("ACQ - Offers Made", "ACQ - Price Motivated"), 
            ("ACQ - Price Motivated", "ACQ - Under Contract")
        ]
        
        print("📤 Sending rapid stage progression...")
        webhook_success = []
        
        for stage_from, stage_to in stages:
            success = self.send_test_webhook(test_person_id, stage_from, stage_to)
            webhook_success.append(success)
            time.sleep(2)  # 2-second intervals (rapid)
        
        # Wait for processing
        print("⏳ Waiting 10 seconds for processing...")
        time.sleep(10)
        
        # Check if server processed them
        try:
            response = requests.get(f"{WEBHOOK_SERVER_URL}/health", timeout=5)
            if response.status_code == 200:
                new_stats = response.json()
                new_captured = new_stats.get('stage_changes_captured', 0)
                print(f"📊 New stage changes captured: {new_captured}")
                
                if baseline_captured is not None:
                    increase = new_captured - baseline_captured
                    print(f"📈 Increase: +{increase}")
                    
                    if increase > 0:
                        print("✅ Server IS processing webhooks into stage changes!")
                        return True
                    else:
                        print("❌ Server NOT converting webhooks to stage changes (race condition issue)")
                        return False
        except Exception as e:
            print(f"❌ Could not verify processing: {e}")
        
        return False

    def verify_webhook_registration(self):
        """Check if webhooks are properly registered with FUB"""
        print("\n🔗 Checking Webhook Registration")
        print("=" * 40)
        
        try:
            response = requests.get(f"{WEBHOOK_SERVER_URL}/list-webhooks", timeout=10)
            if response.status_code == 200:
                webhooks = response.json()
                if webhooks.get('count', 0) > 0:
                    print(f"✅ {webhooks['count']} webhooks registered with FUB")
                    for webhook in webhooks.get('webhooks', []):
                        print(f"   Event: {webhook.get('event')} - Status: {webhook.get('status')}")
                    return True
                else:
                    print("❌ No webhooks registered with FUB")
                    return False
            else:
                print(f"❌ Could not check webhook registration: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Webhook registration check failed: {e}")
            return False

    def run_comprehensive_test(self):
        """Run comprehensive test of live webhook server"""
        print("🧪 LIVE WEBHOOK SERVER COMPREHENSIVE TEST")
        print("=" * 80)
        print(f"Server: {WEBHOOK_SERVER_URL}")
        print(f"Test time: {self.test_start_time}")
        print()
        
        results = {
            'server_responding': False,
            'fub_api_accessible': False,
            'recent_webhook_activity': False,
            'webhook_registration': False,
            'rapid_stage_processing': False
        }
        
        # Test 1: Server status
        results['server_responding'] = self.check_server_status()
        
        # Test 2: FUB API connectivity
        results['fub_api_accessible'] = self.check_fub_api_connectivity()
        
        # Test 3: Recent webhook activity
        results['recent_webhook_activity'] = self.check_recent_webhook_activity()
        
        # Test 4: Webhook registration
        results['webhook_registration'] = self.verify_webhook_registration()
        
        # Test 5: Live rapid stage test
        if results['server_responding']:
            results['rapid_stage_processing'] = self.simulate_rapid_stage_test()
        
        # Summary
        print("\n📋 COMPREHENSIVE TEST RESULTS")
        print("=" * 80)
        
        passed_tests = sum(results.values())
        total_tests = len(results)
        
        for test, result in results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{test.replace('_', ' ').title()}: {status}")
        
        print(f"\nOverall: {passed_tests}/{total_tests} tests passed")
        
        if results['rapid_stage_processing']:
            print("\n🎉 SUCCESS: Live webhook server IS capturing rapid stage changes!")
            print("The race condition fixes are working in production.")
        elif results['server_responding']:
            print("\n⚠️  PARTIAL: Server running but not processing stage changes properly")
            print("Race condition fixes may need deployment or debugging.")
        else:
            print("\n❌ FAILURE: Webhook server not responding or not configured properly")
        
        return results

if __name__ == "__main__":
    test = LiveWebhookTest()
    results = test.run_comprehensive_test()
    
    # Exit with appropriate code
    if results.get('rapid_stage_processing', False):
        print("\n✅ Test Result: Webhook server successfully processing rapid stage changes")
        exit(0)
    else:
        print("\n❌ Test Result: Issues found with webhook server stage change processing")
        exit(1)