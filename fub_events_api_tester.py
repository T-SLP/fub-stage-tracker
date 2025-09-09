#!/usr/bin/env python3
"""
FollowUpBoss Events API Historical Data Tester
This script explores what historical stage data is available via FUB's Events API
"""

import requests
import json
import datetime
import os
import base64
import time
from collections import defaultdict, Counter
from typing import Dict, List, Any
import sys

# Configuration
FUB_API_KEY = os.getenv("FUB_API_KEY")
FUB_SYSTEM_KEY = os.getenv("FUB_SYSTEM_KEY")

if not FUB_API_KEY:
    print("❌ ERROR: FUB_API_KEY environment variable not set!")
    print("Please set: export FUB_API_KEY=your_fub_api_key")
    sys.exit(1)


class FUBEventsAPITester:
    def __init__(self):
        self.auth_string = base64.b64encode(f"{FUB_API_KEY}:".encode("utf-8")).decode("utf-8")
        self.api_requests = 0
        self.start_time = time.time()

    def log_progress(self, message):
        """Log progress with timing"""
        elapsed = time.time() - self.start_time
        print(f"[{elapsed:.1f}s] {message} | API Requests: {self.api_requests}")

    def test_events_api_basic(self):
        """Test basic Events API connectivity and recent events"""
        print("🔍 TESTING BASIC EVENTS API CONNECTIVITY")
        print("=" * 50)

        url = "https://api.followupboss.com/v1/events"
        headers = {
            "Authorization": f"Basic {self.auth_string}",
            "X-System": "FUBHistoricalDataTester",
        }

        if FUB_SYSTEM_KEY:
            headers["X-System-Key"] = FUB_SYSTEM_KEY

        # Test with minimal parameters
        params = {"limit": 5}  # Just get 5 recent events

        try:
            response = requests.get(url, headers=headers, params=params)
            self.api_requests += 1

            print(f"📡 API Response Status: {response.status_code}")
            print(f"📋 Response Headers: {dict(response.headers)}")

            if response.status_code == 200:
                data = response.json()
                events = data.get("events", [])
                metadata = data.get("_metadata", {})

                print(f"✅ SUCCESS: Got {len(events)} events")
                print(f"📊 Metadata: {json.dumps(metadata, indent=2)}")

                if events:
                    print(f"\n📝 SAMPLE EVENT:")
                    print(json.dumps(events[0], indent=2))

                return True, data

            else:
                print(f"❌ API Error: {response.status_code}")
                print(f"📄 Error Response: {response.text}")
                return False, None

        except Exception as e:
            print(f"❌ Connection Error: {e}")
            return False, None

    def test_historical_date_ranges(self):
        """Test how far back we can go with the Events API"""
        print("\n📅 TESTING HISTORICAL DATE RANGES")
        print("=" * 50)

        url = "https://api.followupboss.com/v1/events"
        headers = {
            "Authorization": f"Basic {self.auth_string}",
            "X-System": "FUBHistoricalDataTester",
        }

        if FUB_SYSTEM_KEY:
            headers["X-System-Key"] = FUB_SYSTEM_KEY

        # Test different time periods
        test_periods = [
            ("1 day ago", 1),
            ("7 days ago", 7),
            ("30 days ago", 30),
            ("90 days ago", 90),
            ("180 days ago", 180),
            ("365 days ago", 365)
        ]

        results = {}

        for period_name, days_back in test_periods:
            print(f"\n🔍 Testing {period_name} ({days_back} days)...")

            since_date = datetime.datetime.utcnow() - datetime.timedelta(days=days_back)
            until_date = since_date + datetime.timedelta(hours=1)  # Small window

            params = {
                "since": since_date.isoformat(),
                "until": until_date.isoformat(),
                "limit": 10
            }

            try:
                response = requests.get(url, headers=headers, params=params)
                self.api_requests += 1

                if response.status_code == 429:
                    print("⏳ Rate limited, waiting...")
                    time.sleep(10)
                    response = requests.get(url, headers=headers, params=params)
                    self.api_requests += 1

                if response.status_code == 200:
                    data = response.json()
                    events = data.get("events", [])

                    results[period_name] = {
                        "days_back": days_back,
                        "events_found": len(events),
                        "date_range": f"{since_date.date()} to {until_date.date()}",
                        "has_data": len(events) > 0
                    }

                    if events:
                        print(f"   ✅ Found {len(events)} events")
                        # Show event types
                        event_types = [event.get('type', 'unknown') for event in events]
                        print(f"   📋 Event types: {list(set(event_types))}")
                    else:
                        print(f"   ❌ No events found")

                else:
                    print(f"   ❌ API Error: {response.status_code}")
                    results[period_name] = {
                        "days_back": days_back,
                        "error": response.status_code,
                        "has_data": False
                    }

                # Small delay between requests
                time.sleep(0.5)

            except Exception as e:
                print(f"   ❌ Error: {e}")
                results[period_name] = {
                    "days_back": days_back,
                    "error": str(e),
                    "has_data": False
                }

        return results

    def analyze_event_types_and_structure(self, days_back=30):
        """Analyze what types of events are available and their structure"""
        print(f"\n🔬 ANALYZING EVENT TYPES AND STRUCTURE (Last {days_back} days)")
        print("=" * 70)

        url = "https://api.followupboss.com/v1/events"
        headers = {
            "Authorization": f"Basic {self.auth_string}",
            "X-System": "FUBHistoricalDataTester",
        }

        if FUB_SYSTEM_KEY:
            headers["X-System-Key"] = FUB_SYSTEM_KEY

        since_date = datetime.datetime.utcnow() - datetime.timedelta(days=days_back)

        params = {
            "since": since_date.isoformat(),
            "limit": 100
        }

        all_events = []
        next_token = None
        page_count = 0
        max_pages = 10  # Limit to prevent excessive API calls

        print(f"📡 Fetching events since {since_date.date()}...")

        while page_count < max_pages:
            page_count += 1

            if next_token:
                params["next"] = next_token

            try:
                response = requests.get(url, headers=headers, params=params)
                self.api_requests += 1

                if response.status_code == 429:
                    print("⏳ Rate limited, waiting...")
                    time.sleep(10)
                    continue

                if response.status_code != 200:
                    print(f"❌ API Error: {response.status_code}")
                    break

                data = response.json()
                events = data.get("events", [])

                if not events:
                    print("✅ No more events found")
                    break

                all_events.extend(events)

                print(f"📄 Page {page_count}: Found {len(events)} events (Total: {len(all_events)})")

                # Check for next page
                metadata = data.get("_metadata", {})
                next_token = metadata.get("next")

                if not next_token:
                    break

                time.sleep(0.2)  # Rate limiting

            except Exception as e:
                print(f"❌ Error fetching page {page_count}: {e}")
                break

        # Analyze the events
        return self.analyze_events_data(all_events)

    def analyze_events_data(self, events):
        """Detailed analysis of events data"""
        if not events:
            print("❌ No events to analyze")
            return {}

        print(f"\n📊 ANALYZING {len(events)} EVENTS")
        print("-" * 40)

        # Count event types
        event_types = Counter([event.get('type', 'unknown') for event in events])

        print(f"📋 EVENT TYPES FOUND:")
        for event_type, count in event_types.most_common():
            print(f"   {event_type}: {count}")

        # Look for stage-related events
        stage_events = []
        potential_stage_events = []

        for event in events:
            event_type = event.get('type', '').lower()

            # Direct stage events
            if 'stage' in event_type:
                stage_events.append(event)

            # Person updated events (might contain stage changes)
            elif 'person' in event_type and 'updated' in event_type:
                potential_stage_events.append(event)

        print(f"\n🎯 STAGE-RELATED EVENTS:")
        print(f"   Direct stage events: {len(stage_events)}")
        print(f"   Potential stage events (person.updated): {len(potential_stage_events)}")

        # Analyze stage events structure
        if stage_events:
            print(f"\n📝 SAMPLE DIRECT STAGE EVENT:")
            print(json.dumps(stage_events[0], indent=2))

        # Analyze person.updated events for stage data
        person_updated_with_stages = []

        for event in potential_stage_events[:10]:  # Check first 10
            event_data = event.get('data', {})
            person_data = event.get('person', {})

            # Look for stage information
            has_stage_info = (
                    event_data.get('stage') or
                    person_data.get('stage') or
                    (event_data.get('changes', {}).get('stage'))
            )

            if has_stage_info:
                person_updated_with_stages.append(event)

        if person_updated_with_stages:
            print(f"\n📝 SAMPLE PERSON.UPDATED WITH STAGE DATA:")
            print(json.dumps(person_updated_with_stages[0], indent=2))

        # Look for historical stage changes
        historical_stage_changes = []

        for event in stage_events + person_updated_with_stages:
            stage_change = self.extract_stage_change_from_event(event)
            if stage_change:
                historical_stage_changes.append(stage_change)

        print(f"\n🏆 EXTRACTABLE HISTORICAL STAGE CHANGES: {len(historical_stage_changes)}")

        if historical_stage_changes:
            # Group by person
            people_with_history = defaultdict(list)
            for change in historical_stage_changes:
                people_with_history[change['person_id']].append(change)

            print(f"   📋 People with stage history: {len(people_with_history)}")

            # Show example
            example_person_id = list(people_with_history.keys())[0]
            example_history = people_with_history[example_person_id]

            print(f"\n📖 EXAMPLE STAGE HISTORY (Person {example_person_id}):")
            for i, change in enumerate(example_history):
                print(
                    f"   {i + 1}. {change['changed_at'].strftime('%Y-%m-%d %H:%M')} - {change['stage_from']} → {change['stage_to']}")

        # Calculate date range of available data
        event_dates = []
        for event in events:
            created_str = event.get('created', '')
            if created_str:
                try:
                    if created_str.endswith('Z'):
                        date = datetime.datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                    else:
                        date = datetime.datetime.fromisoformat(created_str)
                    event_dates.append(date)
                except:
                    pass

        if event_dates:
            earliest_date = min(event_dates)
            latest_date = max(event_dates)
            date_range_days = (latest_date - earliest_date).days

            print(f"\n📅 AVAILABLE DATA DATE RANGE:")
            print(f"   Earliest event: {earliest_date.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"   Latest event: {latest_date.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"   Date range: {date_range_days} days")

        return {
            'total_events': len(events),
            'event_types': dict(event_types),
            'stage_events': len(stage_events),
            'potential_stage_events': len(potential_stage_events),
            'extractable_stage_changes': len(historical_stage_changes),
            'people_with_history': len(set([change['person_id'] for change in historical_stage_changes])),
            'date_range_days': date_range_days if event_dates else 0,
            'earliest_date': earliest_date.isoformat() if event_dates else None,
            'latest_date': latest_date.isoformat() if event_dates else None
        }

    def extract_stage_change_from_event(self, event):
        """Extract stage change information from an event"""
        try:
            person_data = event.get('person', {})
            event_data = event.get('data', {})

            if not person_data.get('id'):
                return None

            # Parse timestamp
            created_str = event.get('created', '')
            if created_str:
                try:
                    if created_str.endswith('Z'):
                        changed_at = datetime.datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                    else:
                        changed_at = datetime.datetime.fromisoformat(created_str)
                except:
                    return None
            else:
                return None

            # Extract stage information
            stage_from = None
            stage_to = None

            # Method 1: Changes object
            changes = event_data.get('changes', {})
            if 'stage' in changes:
                stage_change = changes['stage']
                if isinstance(stage_change, dict):
                    stage_from = stage_change.get('from')
                    stage_to = stage_change.get('to')

            # Method 2: Direct stage fields
            if not stage_to:
                stage_from = event_data.get('previousStage') or event_data.get('previous_stage')
                stage_to = event_data.get('newStage') or event_data.get('new_stage') or event_data.get('stage')

            # Method 3: Person data
            if not stage_to:
                stage_to = person_data.get('stage')

            if not stage_to:
                return None

            return {
                'person_id': str(person_data['id']),
                'first_name': person_data.get('firstName', ''),
                'last_name': person_data.get('lastName', ''),
                'stage_from': stage_from,
                'stage_to': stage_to,
                'changed_at': changed_at,
                'event_type': event.get('type', ''),
                'event_id': event.get('id', '')
            }

        except Exception as e:
            return None

    def generate_report(self, date_range_results, analysis_results):
        """Generate final report on FUB Events API capabilities"""
        print("\n" + "=" * 70)
        print("📋 FOLLOWUPBOSS EVENTS API HISTORICAL DATA REPORT")
        print("=" * 70)

        # Date range availability
        print("\n📅 HISTORICAL DATA AVAILABILITY:")
        for period, result in date_range_results.items():
            if result.get('has_data'):
                print(f"   ✅ {period}: Available")
            else:
                print(f"   ❌ {period}: Not available")

        # Determine retention period
        available_periods = [r for r in date_range_results.values() if r.get('has_data')]
        if available_periods:
            max_days_back = max([p['days_back'] for p in available_periods])
            print(f"\n🕐 ESTIMATED RETENTION PERIOD: ~{max_days_back} days")

        # Analysis summary
        if analysis_results:
            print(f"\n📊 EVENT ANALYSIS SUMMARY:")
            print(f"   Total events analyzed: {analysis_results['total_events']}")
            print(f"   Stage-related events: {analysis_results['stage_events']}")
            print(f"   Extractable stage changes: {analysis_results['extractable_stage_changes']}")
            print(f"   People with stage history: {analysis_results['people_with_history']}")

            if analysis_results['date_range_days']:
                print(f"   Historical data spans: {analysis_results['date_range_days']} days")

        # Recommendations
        print(f"\n💡 RECOMMENDATIONS:")

        if analysis_results and analysis_results['extractable_stage_changes'] > 0:
            print("   ✅ GOOD: Events API contains historical stage changes")
            print("   ✅ RECOMMENDED: Extract historical data using Events API")
            print("   ✅ THEN: Set up webhooks for real-time future tracking")
        else:
            print("   ⚠️  LIMITED: Few or no historical stage changes found")
            print("   💡 RECOMMENDED: Create baseline snapshot + webhooks for future")

        # Next steps
        print(f"\n🎯 NEXT STEPS:")
        print("   1. Review this report to understand available historical data")

        if analysis_results and analysis_results['extractable_stage_changes'] > 0:
            print("   2. Run full historical extraction using Events API")
            print("   3. Save historical data to your database")
            print("   4. Set up webhooks for ongoing real-time tracking")
        else:
            print("   2. Create baseline snapshot of current lead stages")
            print("   3. Set up webhooks to track all future stage changes")

        print("\n🚀 After this setup, you'll have comprehensive stage tracking!")

    def run_comprehensive_test(self):
        """Run all tests and generate comprehensive report"""
        print("🔍 FOLLOWUPBOSS EVENTS API COMPREHENSIVE TEST")
        print("=" * 60)

        # Test 1: Basic connectivity
        basic_success, basic_data = self.test_events_api_basic()

        if not basic_success:
            print("❌ Basic connectivity failed - cannot proceed with further tests")
            return

        # Test 2: Historical date ranges
        date_range_results = self.test_historical_date_ranges()

        # Test 3: Event analysis
        analysis_results = self.analyze_event_types_and_structure(days_back=30)

        # Generate final report
        self.generate_report(date_range_results, analysis_results)

        # Log final stats
        total_time = time.time() - self.start_time
        self.log_progress(f"Testing completed in {total_time:.1f} seconds")


def main():
    """Main execution function"""
    print("🚀 FollowUpBoss Events API Historical Data Tester")
    print("This script will test what historical stage data is available\n")

    tester = FUBEventsAPITester()
    tester.run_comprehensive_test()

    print("\n" + "=" * 60)
    print("✅ TESTING COMPLETE!")
    print("\nUse this report to determine the best approach for:")
    print("- Historical stage data extraction")
    print("- Setting up ongoing stage tracking")
    print("- Choosing between webhooks vs polling")


if __name__ == "__main__":
    main()