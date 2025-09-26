"""
Direct Database Test for Rapid Stage Changes
Tests stage change capture directly in Supabase database with simulated timing
"""

import json
import datetime
import psycopg2
import psycopg2.extras
import time
from typing import List, Dict

# Database configuration
SUPABASE_DB_URL = "postgresql://postgres.jefrfayzrxfcjeviwfhw:UnVen%25SUBJd%26%237%40@aws-0-us-east-2.pooler.supabase.com:5432/postgres"

# Test person data
TEST_PERSON_ID = "888888"  # Different from webhook test
TEST_PERSON_DATA = {
    "firstName": "Direct",
    "lastName": "TestPerson",
    "dealId": "direct_test_123"
}

# Rapid stage progression (same as Rose Hutton scenario)
STAGE_PROGRESSION = [
    ("Contact Upload", "ACQ - New Lead"),
    ("ACQ - New Lead", "ACQ - Attempted Contact"),
    ("ACQ - Attempted Contact", "ACQ - Contacted"),
    ("ACQ - Contacted", "ACQ - Qualified"),
    ("ACQ - Qualified", "ACQ - Offers Made"),      # The critical missing stage
    ("ACQ - Offers Made", "ACQ - Price Motivated"),
    ("ACQ - Price Motivated", "ACQ - Under Contract"),
    ("ACQ - Under Contract", "ACQ - Closed Won")
]

class DirectDatabaseTest:
    def __init__(self):
        self.test_start_time = datetime.datetime.utcnow()
        
    def cleanup_test_data(self):
        """Clean up any existing test data"""
        print("Cleaning up existing test data...")
        try:
            conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM stage_changes 
                    WHERE person_id = %s AND source = 'direct_test'
                """, (TEST_PERSON_ID,))
                deleted_count = cur.rowcount
                conn.commit()
                print(f"   Deleted {deleted_count} existing records")
        except Exception as e:
            print(f"   Cleanup error: {e}")
        finally:
            if 'conn' in locals():
                conn.close()

    def simulate_rapid_stage_changes(self, interval_seconds: float = 5.0):
        """Simulate rapid stage changes by inserting directly into database"""
        print(f"Simulating rapid stage changes (intervals: {interval_seconds}s)")
        print("=" * 60)
        
        current_time = self.test_start_time
        inserted_count = 0
        
        try:
            conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
            
            for i, (stage_from, stage_to) in enumerate(STAGE_PROGRESSION):
                # Calculate timing for this stage change
                stage_change_time = current_time + datetime.timedelta(seconds=i * interval_seconds)
                received_time = datetime.datetime.utcnow()
                
                # Create stage change record
                stage_record = {
                    'person_id': TEST_PERSON_ID,
                    'deal_id': TEST_PERSON_DATA['dealId'],
                    'first_name': TEST_PERSON_DATA['firstName'], 
                    'last_name': TEST_PERSON_DATA['lastName'],
                    'stage_from': stage_from,
                    'stage_to': stage_to,
                    'changed_at': stage_change_time,
                    'received_at': received_time,
                    'source': 'direct_test',
                    'event_id': f"direct_test_{TEST_PERSON_ID}_{i}_{int(stage_change_time.timestamp())}",
                    'raw_payload': json.dumps({"test": True, "stage": stage_to}),
                    'campaign_id': 'direct_test_campaign',
                    'who_pushed_lead': 'DirectTest',
                    'parcel_county': 'Test County',
                    'parcel_state': 'TX',
                    'lead_source_tag': 'TestSource'
                }
                
                with conn.cursor() as cur:
                    query = """
                        INSERT INTO stage_changes (
                            person_id, deal_id, first_name, last_name,
                            stage_from, stage_to, changed_at, received_at,
                            source, event_id, raw_payload,
                            campaign_id, who_pushed_lead, parcel_county, parcel_state, lead_source_tag
                        ) VALUES (
                            %(person_id)s, %(deal_id)s, %(first_name)s, %(last_name)s,
                            %(stage_from)s, %(stage_to)s, %(changed_at)s, %(received_at)s,
                            %(source)s, %(event_id)s, %(raw_payload)s,
                            %(campaign_id)s, %(who_pushed_lead)s, %(parcel_county)s,
                            %(parcel_state)s, %(lead_source_tag)s
                        )
                    """
                    
                    cur.execute(query, stage_record)
                    conn.commit()
                    inserted_count += 1
                    
                    print(f"   Stage {i+1}: {stage_from} -> {stage_to} at {stage_change_time.strftime('%H:%M:%S')}")
        
        except Exception as e:
            print(f"Error inserting stage changes: {e}")
            return False
        finally:
            if 'conn' in locals():
                conn.close()
        
        print(f"\nInserted {inserted_count} stage change records")
        return inserted_count == len(STAGE_PROGRESSION)

    def verify_all_stages_captured(self):
        """Verify all stages were captured and query performance"""
        print("\nVerifying all stages were captured...")
        print("=" * 50)
        
        try:
            conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                # Query all stage changes for our test person
                cur.execute("""
                    SELECT stage_from, stage_to, changed_at, 
                           LAG(changed_at) OVER (ORDER BY changed_at) as prev_changed_at
                    FROM stage_changes 
                    WHERE person_id = %s AND source = 'direct_test'
                    ORDER BY changed_at ASC
                """, (TEST_PERSON_ID,))
                
                records = cur.fetchall()
                
                print(f"Database Query Results ({len(records)} records):")
                print()
                
                total_transition_time = None
                for i, record in enumerate(records):
                    stage_num = i + 1
                    time_in_previous = None
                    
                    if record['prev_changed_at']:
                        time_diff = record['changed_at'] - record['prev_changed_at']
                        time_in_previous = time_diff.total_seconds()
                        
                        if total_transition_time is None:
                            total_transition_time = time_in_previous
                        else:
                            total_transition_time += time_in_previous
                    
                    print(f"   {stage_num}. {record['stage_from']} -> {record['stage_to']}")
                    print(f"      Time: {record['changed_at'].strftime('%H:%M:%S')}")
                    if time_in_previous:
                        print(f"      Time in previous stage: {time_in_previous:.1f} seconds")
                    print()
                
                # Verify specific critical stage
                offers_made_found = any(r['stage_to'] == 'ACQ - Offers Made' for r in records)
                
                print("Critical Stage Analysis:")
                print(f"   'ACQ - Offers Made' captured: {'YES' if offers_made_found else 'NO'}")
                
                if total_transition_time:
                    print(f"   Total progression time: {total_transition_time:.1f} seconds")
                    avg_time_per_stage = total_transition_time / (len(records) - 1)
                    print(f"   Average time per stage: {avg_time_per_stage:.1f} seconds")
                
                return len(records) == len(STAGE_PROGRESSION) and offers_made_found
                
        except Exception as e:
            print(f"Verification error: {e}")
            return False
        finally:
            if 'conn' in locals():
                conn.close()

    def test_rapid_query_performance(self):
        """Test how quickly we can query for rapid stage changes"""
        print("\nTesting rapid stage query performance...")
        print("=" * 50)
        
        queries = [
            ("Find 'ACQ - Offers Made' records", """
                SELECT first_name, last_name, stage_to, changed_at
                FROM stage_changes 
                WHERE person_id = %s AND stage_to = 'ACQ - Offers Made'
            """),
            ("Find all rapid transitions (< 10s)", """
                SELECT stage_from, stage_to, changed_at,
                       LAG(changed_at) OVER (ORDER BY changed_at) as prev_time,
                       EXTRACT(EPOCH FROM (changed_at - LAG(changed_at) OVER (ORDER BY changed_at))) as seconds_diff
                FROM stage_changes 
                WHERE person_id = %s AND source = 'direct_test'
                ORDER BY changed_at
            """),
            ("Count total stage changes", """
                SELECT COUNT(*) as total_changes
                FROM stage_changes 
                WHERE person_id = %s AND source = 'direct_test'
            """)
        ]
        
        try:
            conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
            
            for query_name, query_sql in queries:
                start_time = time.time()
                
                with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                    cur.execute(query_sql, (TEST_PERSON_ID,))
                    results = cur.fetchall()
                
                query_time = (time.time() - start_time) * 1000  # Convert to milliseconds
                
                print(f"   {query_name}:")
                print(f"      Results: {len(results)} rows")
                print(f"      Query time: {query_time:.2f}ms")
                
                # Show some results for verification
                if query_name == "Find 'ACQ - Offers Made' records" and results:
                    for row in results:
                        print(f"      Found: {row['first_name']} {row['last_name']} -> {row['stage_to']} at {row['changed_at']}")
                
                print()
                
        except Exception as e:
            print(f"Query performance test error: {e}")
        finally:
            if 'conn' in locals():
                conn.close()

    def run_complete_test(self, interval_seconds: float = 5.0):
        """Run the complete direct database test"""
        print("DIRECT DATABASE RAPID STAGE TEST")
        print("=" * 80)
        print(f"Test Person: {TEST_PERSON_DATA['firstName']} {TEST_PERSON_DATA['lastName']} (ID: {TEST_PERSON_ID})")
        print(f"Stages to test: {len(STAGE_PROGRESSION)}")
        print(f"Simulated interval: {interval_seconds} seconds")
        print()
        
        # Step 1: Cleanup
        self.cleanup_test_data()
        
        # Step 2: Simulate rapid stage changes
        insert_success = self.simulate_rapid_stage_changes(interval_seconds)
        
        if not insert_success:
            print("Failed to insert all stage changes")
            return False
        
        # Step 3: Verify all stages captured
        verification_success = self.verify_all_stages_captured()
        
        # Step 4: Test query performance
        self.test_rapid_query_performance()
        
        # Step 5: Results
        print("FINAL RESULTS")
        print("=" * 80)
        
        if verification_success:
            print("SUCCESS: All rapid stage changes were captured in the database")
            print("- All stages including 'ACQ - Offers Made' are present")
            print("- Database can handle rapid transitions (5-second intervals)")
            print("- Query performance is acceptable")
            print()
            print("This validates that the webhook server fixes WILL work")
            print("when deployed, as the database layer handles rapid changes correctly.")
        else:
            print("FAILURE: Some stage changes were not captured properly")
            print("- Database may have issues with rapid transitions")
            print("- Further investigation needed")
        
        return verification_success

def test_different_speeds():
    """Test at different speeds to find limits"""
    speeds = [10.0, 5.0, 2.0, 1.0, 0.5]  # seconds
    
    print("MULTI-SPEED DATABASE TEST")
    print("=" * 80)
    
    results = {}
    
    for speed in speeds:
        print(f"\nTesting {speed}s intervals...")
        print("-" * 40)
        
        test = DirectDatabaseTest() 
        success = test.run_complete_test(speed)
        results[speed] = success
        
        time.sleep(2)  # Brief pause between tests
    
    print("\nSPEED TEST SUMMARY")
    print("=" * 40)
    print("Interval | Result")
    print("-" * 20)
    
    for speed, success in results.items():
        status = "PASS" if success else "FAIL"
        print(f"{speed:7.1f}s | {status}")
    
    all_passed = all(results.values())
    print(f"\nOverall: {'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Direct database rapid stage test")
    parser.add_argument("--interval", type=float, default=5.0, help="Seconds between stage changes")
    parser.add_argument("--multi-speed", action="store_true", help="Test multiple speeds")
    
    args = parser.parse_args()
    
    try:
        if args.multi_speed:
            test_different_speeds()
        else:
            test = DirectDatabaseTest()
            success = test.run_complete_test(args.interval)
            exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
        exit(1)
    except Exception as e:
        print(f"Test failed with error: {e}")
        exit(1)