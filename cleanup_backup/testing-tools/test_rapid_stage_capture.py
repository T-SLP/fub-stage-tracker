"""
Comprehensive Test for Rapid Stage Change Capture
Tests that rapid stage transitions (5-10 seconds) are properly captured in Supabase database
"""

import requests
import json
import time
import datetime
import psycopg2
import psycopg2.extras
from typing import List, Dict, Any
import threading

# Configuration - Update these with your actual values
WEBHOOK_SERVER_URL = "https://web-production-cd698.up.railway.app"
SUPABASE_DB_URL = "postgresql://postgres.jefrfayzrxfcjeviwfhw:UnVen%25SUBJd%26%237%40@aws-0-us-east-2.pooler.supabase.com:5432/postgres"

# Test person data
TEST_PERSON_ID = "999999"  # Use a unique test ID
TEST_PERSON_DATA = {
    "id": TEST_PERSON_ID,
    "firstName": "Test",
    "lastName": "RapidStager", 
    "dealId": "test_deal_123",
    "customCampaignID": "test_campaign",
    "customWhoPushedTheLead": "TestSystem",
    "customParcelCounty": "Test County",
    "customParcelState": "TX",
    "tags": ["TestTag", "ReadyMode"]
}

# Rapid stage progression to test (5-10 second intervals)
RAPID_STAGE_PROGRESSION = [
    "ACQ - New Lead",
    "ACQ - Attempted Contact", 
    "ACQ - Contacted",
    "ACQ - Qualified",
    "ACQ - Offers Made",        # This is the critical one we were missing
    "ACQ - Price Motivated",
    "ACQ - Under Contract",
    "ACQ - Closed Won"
]

class RapidStageTest:
    def __init__(self):
        self.results = {
            "webhooks_sent": 0,
            "webhooks_accepted": 0,
            "stages_in_db": 0,
            "missing_stages": [],
            "test_start_time": datetime.datetime.utcnow(),
            "all_stages_captured": False
        }
        
    def cleanup_test_data(self):
        """Clean up any existing test data"""
        print("🧹 Cleaning up existing test data...")
        try:
            conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM stage_changes 
                    WHERE person_id = %s AND source LIKE 'test_%'
                """, (TEST_PERSON_ID,))
                deleted_count = cur.rowcount
                conn.commit()
                print(f"   Deleted {deleted_count} existing test records")
        except Exception as e:
            print(f"   Cleanup error (may be expected): {e}")
        finally:
            if 'conn' in locals():
                conn.close()

    def send_webhook(self, stage_from: str, stage_to: str, delay_seconds: float = 0) -> bool:
        """Send a webhook to simulate stage change"""
        if delay_seconds > 0:
            time.sleep(delay_seconds)
            
        # Create test person data with current stage
        person_data = TEST_PERSON_DATA.copy()
        person_data["stage"] = stage_to
        
        # Create webhook payload matching FUB format
        webhook_payload = {
            "event": "peopleStageUpdated",
            "uri": f"/v1/people/{TEST_PERSON_ID}",
            "eventId": f"test_stage_change_{TEST_PERSON_ID}_{stage_to.replace(' ', '_').replace('-', '_')}_{int(time.time())}",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "data": {
                "people": [person_data]
            }
        }
        
        try:
            # Send webhook to our server
            response = requests.post(
                f"{WEBHOOK_SERVER_URL}/webhook/fub/stage-change",
                json=webhook_payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Signature": "test_signature"  # For testing
                },
                timeout=10
            )
            
            self.results["webhooks_sent"] += 1
            
            if response.status_code == 200:
                self.results["webhooks_accepted"] += 1
                print(f"   ✅ Webhook sent: {stage_from or 'NEW'} → {stage_to}")
                return True
            else:
                print(f"   ❌ Webhook failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"   ❌ Webhook error: {e}")
            return False

    def send_rapid_stage_progression(self, interval_seconds: float = 5.0):
        """Send rapid stage progression with specified intervals"""
        print(f"🚀 Sending rapid stage progression (intervals: {interval_seconds}s)")
        print("=" * 60)
        
        previous_stage = None
        
        for i, current_stage in enumerate(RAPID_STAGE_PROGRESSION):
            stage_num = i + 1
            print(f"📤 Stage {stage_num}/{len(RAPID_STAGE_PROGRESSION)}: {current_stage}")
            
            # Send webhook (with delay except for first one)
            delay = interval_seconds if i > 0 else 0
            success = self.send_webhook(previous_stage, current_stage, delay)
            
            if not success:
                print(f"   ⚠️  Failed to send webhook for stage: {current_stage}")
            
            previous_stage = current_stage
        
        print(f"\n📊 Webhooks Summary:")
        print(f"   Sent: {self.results['webhooks_sent']}")
        print(f"   Accepted: {self.results['webhooks_accepted']}")

    def wait_for_processing(self, timeout_seconds: int = 60):
        """Wait for webhook server to process all webhooks"""
        print(f"⏳ Waiting up to {timeout_seconds}s for webhook processing...")
        
        start_time = time.time()
        while time.time() - start_time < timeout_seconds:
            try:
                # Check webhook server stats
                response = requests.get(f"{WEBHOOK_SERVER_URL}/health", timeout=5)
                if response.status_code == 200:
                    stats = response.json()
                    queue_size = stats.get("queue_size", 0)
                    stage_changes = stats.get("stage_changes_captured", 0)
                    
                    print(f"   Queue: {queue_size}, Stage changes captured: {stage_changes}")
                    
                    if queue_size == 0 and stage_changes > 0:
                        print("   ✅ Processing appears complete")
                        break
                        
            except Exception as e:
                print(f"   Server check error: {e}")
            
            time.sleep(2)
        
        print("   Processing wait completed")

    def verify_database_capture(self) -> bool:
        """Verify all stages were captured in the database"""
        print("\n🔍 Verifying database capture...")
        print("=" * 50)
        
        try:
            conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                # Get all stage changes for our test person
                cur.execute("""
                    SELECT stage_from, stage_to, changed_at, source, event_id
                    FROM stage_changes 
                    WHERE person_id = %s 
                    AND changed_at >= %s
                    ORDER BY changed_at ASC
                """, (TEST_PERSON_ID, self.results["test_start_time"]))
                
                captured_stages = cur.fetchall()
                self.results["stages_in_db"] = len(captured_stages)
                
                print(f"📋 Database Results ({len(captured_stages)} records found):")
                
                if captured_stages:
                    for i, record in enumerate(captured_stages):
                        stage_num = i + 1
                        print(f"   {stage_num}. {record['stage_from'] or 'NEW'} → {record['stage_to']}")
                        print(f"      Time: {record['changed_at']}")
                        print(f"      Source: {record['source']}")
                        print()
                else:
                    print("   ❌ No stage changes found in database!")
                    return False
                
                # Check if all expected stages were captured
                captured_stage_names = [r['stage_to'] for r in captured_stages]
                missing_stages = []
                
                for expected_stage in RAPID_STAGE_PROGRESSION:
                    if expected_stage not in captured_stage_names:
                        missing_stages.append(expected_stage)
                
                self.results["missing_stages"] = missing_stages
                
                if missing_stages:
                    print(f"❌ Missing stages ({len(missing_stages)}):")
                    for stage in missing_stages:
                        print(f"   - {stage}")
                    return False
                else:
                    print("✅ All expected stages captured!")
                    self.results["all_stages_captured"] = True
                    return True
                    
        except Exception as e:
            print(f"❌ Database verification error: {e}")
            return False
        finally:
            if 'conn' in locals():
                conn.close()

    def check_server_health(self):
        """Check webhook server health before testing"""
        print("🏥 Checking webhook server health...")
        try:
            response = requests.get(f"{WEBHOOK_SERVER_URL}/health", timeout=10)
            if response.status_code == 200:
                health = response.json()
                print("   ✅ Server is healthy")
                print(f"   Webhooks processed: {health.get('webhooks_processed', 0)}")
                print(f"   Stage changes captured: {health.get('stage_changes_captured', 0)}")
                print(f"   Queue size: {health.get('queue_size', 0)}")
                return True
            else:
                print(f"   ❌ Server health check failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"   ❌ Cannot reach server: {e}")
            return False

    def run_test(self, interval_seconds: float = 5.0):
        """Run the complete rapid stage change test"""
        print("🧪 RAPID STAGE CHANGE CAPTURE TEST")
        print("=" * 80)
        print(f"Test Person: {TEST_PERSON_DATA['firstName']} {TEST_PERSON_DATA['lastName']} (ID: {TEST_PERSON_ID})")
        print(f"Stages to test: {len(RAPID_STAGE_PROGRESSION)}")
        print(f"Transition interval: {interval_seconds} seconds")
        print(f"Target server: {WEBHOOK_SERVER_URL}")
        print()
        
        # Step 1: Check server health
        if not self.check_server_health():
            print("❌ Test aborted - server not healthy")
            return False
        
        # Step 2: Clean up test data
        self.cleanup_test_data()
        
        # Step 3: Send rapid stage progression
        self.send_rapid_stage_progression(interval_seconds)
        
        # Step 4: Wait for processing
        self.wait_for_processing()
        
        # Step 5: Verify database capture
        success = self.verify_database_capture()
        
        # Step 6: Final results
        self.print_final_results()
        
        return success

    def print_final_results(self):
        """Print comprehensive test results"""
        print("\n📊 FINAL TEST RESULTS")
        print("=" * 80)
        
        print("📤 Webhook Performance:")
        print(f"   Webhooks sent: {self.results['webhooks_sent']}")
        print(f"   Webhooks accepted: {self.results['webhooks_accepted']}")
        webhook_success_rate = (self.results['webhooks_accepted'] / max(self.results['webhooks_sent'], 1)) * 100
        print(f"   Success rate: {webhook_success_rate:.1f}%")
        
        print("\n💾 Database Capture:")
        print(f"   Expected stages: {len(RAPID_STAGE_PROGRESSION)}")
        print(f"   Captured stages: {self.results['stages_in_db']}")
        capture_rate = (self.results['stages_in_db'] / len(RAPID_STAGE_PROGRESSION)) * 100
        print(f"   Capture rate: {capture_rate:.1f}%")
        
        if self.results['missing_stages']:
            print(f"\n❌ Missing stages ({len(self.results['missing_stages'])}):")
            for stage in self.results['missing_stages']:
                print(f"   - {stage}")
        
        print(f"\n🎯 Overall Result:")
        if self.results['all_stages_captured']:
            print("   ✅ SUCCESS - All rapid stage changes captured!")
            print("   The webhook server fixes are working correctly.")
        else:
            print("   ❌ FAILURE - Some stage changes were missed.")
            print("   The webhook server may still have issues.")
        
        print(f"\n⏱️  Test Duration: {(datetime.datetime.utcnow() - self.results['test_start_time']).total_seconds():.1f}s")

def run_multiple_speed_tests():
    """Run tests at multiple speeds to verify robustness"""
    speeds = [10.0, 5.0, 2.0, 1.0]  # seconds between stage changes
    results = {}
    
    print("🏃 MULTIPLE SPEED TESTS")
    print("=" * 80)
    
    for speed in speeds:
        print(f"\n🏃 Testing {speed}s intervals...")
        print("-" * 40)
        
        test = RapidStageTest()
        success = test.run_test(speed)
        results[speed] = {
            "success": success,
            "capture_rate": (test.results['stages_in_db'] / len(RAPID_STAGE_PROGRESSION)) * 100,
            "missing_count": len(test.results['missing_stages'])
        }
        
        # Wait between tests
        if speed != speeds[-1]:
            print("⏳ Waiting 10s before next test...")
            time.sleep(10)
    
    # Summary of all tests
    print("\n📊 MULTI-SPEED TEST SUMMARY")
    print("=" * 80)
    print("Speed (s) | Success | Capture Rate | Missing Stages")
    print("-" * 50)
    
    for speed, result in results.items():
        status = "✅ PASS" if result["success"] else "❌ FAIL"
        print(f"{speed:8.1f} | {status:7} | {result['capture_rate']:10.1f}% | {result['missing_count']:12}")
    
    all_passed = all(r["success"] for r in results.values())
    print(f"\n🎯 Overall Result: {'✅ ALL TESTS PASSED' if all_passed else '❌ SOME TESTS FAILED'}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Test rapid stage change capture")
    parser.add_argument("--interval", type=float, default=5.0, help="Seconds between stage changes")
    parser.add_argument("--multi-speed", action="store_true", help="Run tests at multiple speeds")
    
    args = parser.parse_args()
    
    if args.multi_speed:
        run_multiple_speed_tests()
    else:
        test = RapidStageTest()
        success = test.run_test(args.interval)
        exit(0 if success else 1)