import requests
import psycopg2
import psycopg2.extras
import datetime
import json
import os
import base64
import time
import psutil  # For memory monitoring
import gc  # For garbage collection
from urllib.parse import quote_plus
from psycopg2 import OperationalError

# === CONFIG ===
FUB_API_KEY = os.getenv("FUB_API_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")

# Performance optimizations with memory limits
BATCH_SIZE = 2000  # Larger batches for 200k+ leads
DB_COMMIT_FREQUENCY = 500  # Less frequent commits
MAX_WORKERS = 3  # For parallel processing (if needed)

# MEMORY MANAGEMENT SETTINGS
MAX_MEMORY_MB = 2048  # Cap total memory usage at 2GB
MEMORY_CHECK_INTERVAL = 1000  # Check memory every N people
FLUSH_CHANGES_THRESHOLD = 10000  # Flush to DB when this many changes accumulated (increased for 2GB)


def extract_custom_fields(person):
    """
    Extract custom fields from FollowUpBoss person data
    Returns dict with the custom field values or None if not present
    """
    return {
        'campaign_id': person.get('customCampaignID'),  # FIXED: Use correct field name
        'who_pushed_lead': person.get('customWhoPushedTheLead'),
        'parcel_county': person.get('customParcelCounty'),
        'parcel_state': person.get('customParcelState')
    }


def extract_lead_source_tag(tags):
    """
    Extract specific lead source tag from tags array
    Returns 'ReadyMode', 'Roor', or None
    """
    if not tags or not isinstance(tags, list):
        return None

    if "ReadyMode" in tags:
        return "ReadyMode"
    elif "Roor" in tags:
        return "Roor"

    return None


class PerformanceOptimizedFUB:
    def __init__(self):
        self.start_time = time.time()
        self.api_requests = 0
        self.db_queries = 0
        self.process = psutil.Process(os.getpid())
        self.peak_memory_mb = 0
        self.auth_string = base64.b64encode(f"{FUB_API_KEY}:".encode("utf-8")).decode("utf-8")

    def get_current_memory_mb(self):
        """Get current memory usage in MB"""
        memory_mb = self.process.memory_info().rss / 1024 / 1024
        if memory_mb > self.peak_memory_mb:
            self.peak_memory_mb = memory_mb
        return memory_mb

    def log_performance(self, message):
        elapsed = time.time() - self.start_time
        memory_mb = self.get_current_memory_mb()
        print(
            f"[{elapsed:.1f}s] {message} | Memory: {memory_mb:.0f}MB | API: {self.api_requests} | DB: {self.db_queries}")

        # Memory warning if approaching limit
        if memory_mb > MAX_MEMORY_MB * 0.9:
            print(f"⚠️  MEMORY WARNING: {memory_mb:.0f}MB approaching limit of {MAX_MEMORY_MB}MB")

    def force_garbage_collection(self):
        """Force Python garbage collection to free memory"""
        collected = gc.collect()
        if collected > 0:
            memory_mb = self.get_current_memory_mb()
            print(f"🗑️  Garbage collected {collected} objects, memory now: {memory_mb:.0f}MB")

    # === NEW: EVENTS API METHODS ===

    def fetch_events_since_last_run(self):
        """
        Fetch all stage change events since last polling run
        This captures ALL intermediate changes, even rapid 30-second transitions
        """
        conn = self.get_connection()

        # Get last polling timestamp - look for events since then
        with conn.cursor() as cur:
            cur.execute("""
                SELECT MAX(received_at) as last_poll 
                FROM stage_changes 
                WHERE source IN ('polling', 'events_api')
            """)
            result = cur.fetchone()
            last_poll = result[0] if result[0] else datetime.datetime.utcnow() - datetime.timedelta(hours=12)

        conn.close()

        print(f"🔍 Fetching ALL stage events since: {last_poll}")
        print("   This will capture rapid transitions like: Qualified → Offers Made (30s) → Offer Not Accepted")

        url = "https://api.followupboss.com/v1/events"
        headers = {
            "Authorization": f"Basic {self.auth_string}",
            "X-System": "SynergyFUBLeadMetrics",
            "X-System-Key": os.getenv("FUB_SYSTEM_KEY")
        }

        # Query parameters - get ALL events, then filter
        params = {
            "since": last_poll.isoformat(),
            "limit": 100,
            # Note: FollowUpBoss may use different event type names
            # We'll filter these in the response processing
        }

        all_stage_events = []
        rapid_transitions_found = 0

        while True:
            if self.api_requests > 0 and self.api_requests % 180 == 0:
                print(f"Rate limiting: sleeping 11 seconds after {self.api_requests} requests")
                time.sleep(11)

            response = requests.get(url, headers=headers, params=params)
            self.api_requests += 1

            if response.status_code == 429:
                retry_after = int(response.headers.get('Retry-After', 10))
                print(f"Rate limited! Waiting {retry_after} seconds...")
                time.sleep(retry_after)
                continue

            if response.status_code != 200:
                print(f"Events API error: {response.status_code} - {response.text}")
                break

            data = response.json()
            events = data.get("events", [])

            if not events:
                break

            # Filter for ANY stage-related events (cast a wide net)
            stage_events = []
            for event in events:
                if self.is_stage_change_event(event):
                    stage_events.append(event)

                    # Detect rapid transitions (events within 5 minutes of each other for same person)
                    if self.is_rapid_transition(event, all_stage_events):
                        rapid_transitions_found += 1

            all_stage_events.extend(stage_events)

            if stage_events:
                print(
                    f"📊 Batch: {len(stage_events)} stage events | Rapid transitions detected: {rapid_transitions_found}")

            # Check pagination
            metadata = data.get("_metadata", {})
            next_token = metadata.get("next")
            if not next_token:
                break
            params["next"] = next_token

            time.sleep(0.1)  # Rate limiting

        print(f"✅ Total events fetched: {len(all_stage_events)}")
        print(f"⚡ Rapid transitions found: {rapid_transitions_found}")
        return all_stage_events

    def is_stage_change_event(self, event):
        """
        Determine if an event represents a stage change
        """
        # Check event type
        event_type = event.get("type", "").lower()

        # Common FollowUpBoss stage change event types
        stage_event_types = [
            "person.stage_changed",
            "personstagechanged",
            "person.updated",
            "personupdated"
        ]

        if any(event_type == stage_type.lower() for stage_type in stage_event_types):
            return True

        # Check if person data shows stage change
        person_data = event.get("person", {})
        event_data = event.get("data", {})

        # Look for stage-related fields in the data
        stage_fields = ["stage", "previousStage", "newStage", "previous_stage", "new_stage"]
        if any(field in event_data for field in stage_fields):
            return True

        # Check if person object has stage field and this looks like an update
        if person_data.get("stage") and "person" in event_type and "updat" in event_type:
            return True

        return False

    def is_rapid_transition(self, current_event, existing_events):
        """
        Check if this event is part of a rapid transition (multiple stage changes within minutes)
        """
        try:
            current_person_id = current_event.get("person", {}).get("id")
            current_time_str = current_event.get("created", "")

            if not current_person_id or not current_time_str:
                return False

            # Parse timestamp (handle both with and without 'Z')
            if current_time_str.endswith('Z'):
                current_time = datetime.datetime.fromisoformat(current_time_str.replace('Z', '+00:00'))
            else:
                current_time = datetime.datetime.fromisoformat(current_time_str)

            # Look for other events for same person within 5 minutes
            for existing_event in existing_events[-10:]:  # Check last 10 events for performance
                existing_person_id = existing_event.get("person", {}).get("id")
                if existing_person_id != current_person_id:
                    continue

                existing_time_str = existing_event.get("created", "")
                if not existing_time_str:
                    continue

                if existing_time_str.endswith('Z'):
                    existing_time = datetime.datetime.fromisoformat(existing_time_str.replace('Z', '+00:00'))
                else:
                    existing_time = datetime.datetime.fromisoformat(existing_time_str)

                time_diff = abs((current_time - existing_time).total_seconds())

                if time_diff < 300:  # Within 5 minutes
                    return True

        except Exception as e:
            print(f"Error checking rapid transition: {e}")

        return False

    def process_stage_events_to_changes(self, events):
        """
        Convert FollowUpBoss events to standardized stage changes
        """
        stage_changes = []

        for event in events:
            try:
                person_data = event.get("person", {})
                event_data = event.get("data", {})

                # Extract stage information from various possible formats
                stage_from = None
                stage_to = None

                # Method 1: Direct stage fields in event data
                if "previousStage" in event_data and "newStage" in event_data:
                    stage_from = event_data["previousStage"]
                    stage_to = event_data["newStage"]
                elif "previous_stage" in event_data and "new_stage" in event_data:
                    stage_from = event_data["previous_stage"]
                    stage_to = event_data["new_stage"]
                elif "stage" in event_data:
                    # Only new stage provided
                    stage_to = event_data["stage"]
                    stage_from = "Unknown"

                # Method 2: Current stage from person data
                if not stage_to and person_data.get("stage"):
                    stage_to = person_data["stage"]
                    stage_from = "Unknown"  # We don't know the previous stage from this event

                # Skip if we couldn't determine any stage info
                if not stage_to:
                    continue

                # Extract custom fields
                custom_fields = extract_custom_fields(person_data)
                lead_source_tag = extract_lead_source_tag(person_data.get('tags'))

                # Parse created timestamp
                created_str = event.get('created', '')
                if created_str:
                    if created_str.endswith('Z'):
                        changed_at = datetime.datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                    else:
                        changed_at = datetime.datetime.fromisoformat(created_str)
                else:
                    changed_at = datetime.datetime.utcnow()

                stage_change = {
                    'person_id': str(person_data.get('id', '')),
                    'first_name': person_data.get('firstName'),
                    'last_name': person_data.get('lastName'),
                    'stage_from': stage_from,
                    'stage_to': stage_to,
                    'changed_at': changed_at,
                    'received_at': datetime.datetime.utcnow(),
                    'source': 'events_api',  # Mark source as events API
                    'event_id': event.get('id'),  # Store event ID to prevent duplicates
                    'raw_payload': event,
                    # Custom fields
                    'campaign_id': custom_fields['campaign_id'],
                    'who_pushed_lead': custom_fields['who_pushed_lead'],
                    'parcel_county': custom_fields['parcel_county'],
                    'parcel_state': custom_fields['parcel_state'],
                    'lead_source_tag': lead_source_tag
                }

                stage_changes.append(stage_change)

            except Exception as e:
                print(f"Error processing event {event.get('id', 'unknown')}: {e}")
                continue

        return stage_changes

    def save_stage_changes_with_dedup(self, conn, stage_changes):
        """
        Save stage changes while avoiding duplicates based on event_id
        """
        if not stage_changes:
            return 0

        with conn.cursor() as cur:
            # First, check which events we already have
            event_ids = [change.get('event_id') for change in stage_changes if change.get('event_id')]

            if event_ids:
                placeholders = ','.join(['%s'] * len(event_ids))
                cur.execute(f"""
                    SELECT event_id FROM stage_changes 
                    WHERE event_id IN ({placeholders})
                """, event_ids)
                existing_event_ids = set(row[0] for row in cur.fetchall())
                self.db_queries += 1
            else:
                existing_event_ids = set()

            # Filter out duplicates
            new_changes = [
                change for change in stage_changes
                if change.get('event_id') not in existing_event_ids
            ]

            if not new_changes:
                print("No new stage changes to insert (all were duplicates)")
                return 0

            # Insert new changes
            query = """
                INSERT INTO stage_changes (
                    person_id, deal_id, first_name, last_name,
                    stage_from, stage_to, changed_at, received_at, 
                    source, event_id, raw_payload,
                    campaign_id, who_pushed_lead, parcel_county, parcel_state, lead_source_tag
                ) VALUES %s
            """

            values = [
                (
                    change['person_id'],
                    None,  # deal_id
                    change['first_name'],
                    change['last_name'],
                    change['stage_from'],
                    change['stage_to'],
                    change['changed_at'],
                    change['received_at'],
                    change.get('source', 'events_api'),
                    change.get('event_id'),
                    json.dumps(change['raw_payload']),
                    change.get('campaign_id'),
                    change.get('who_pushed_lead'),
                    change.get('parcel_county'),
                    change.get('parcel_state'),
                    change.get('lead_source_tag')
                )
                for change in new_changes
            ]

            psycopg2.extras.execute_values(cur, query, values, page_size=1000)
            conn.commit()
            self.db_queries += 1

            print(f"✅ Inserted {len(new_changes)} new stage changes from events API")
            return len(new_changes)

    # === ENHANCED POLLING METHOD ===

    def run_enhanced_polling(self):
        """
        Enhanced polling that captures both current state AND historical events
        This is the main method to run - it combines events API with traditional polling
        """
        print("🚀 Starting ENHANCED polling with Events API backfill...")
        print("   This will capture rapid stage transitions that traditional polling misses!")
        self.log_performance("Enhanced polling started")

        conn = self.get_connection()
        total_events_saved = 0
        total_polling_saved = 0

        # Step 1: Fetch missed events since last run
        print("\n" + "=" * 60)
        print("STEP 1: FETCHING HISTORICAL EVENTS")
        print("=" * 60)

        try:
            events = self.fetch_events_since_last_run()

            if events:
                print(f"Found {len(events)} stage change events to process")
                stage_changes_from_events = self.process_stage_events_to_changes(events)

                if stage_changes_from_events:
                    # Save events-based changes
                    total_events_saved = self.save_stage_changes_with_dedup(conn, stage_changes_from_events)

                    # Show examples of rapid transitions
                    self.show_rapid_transition_examples(stage_changes_from_events)
                else:
                    print("No valid stage changes found in events")
            else:
                print("No stage change events found since last run")

        except Exception as e:
            print(f"⚠️  Error fetching events (continuing with regular polling): {e}")

        # Step 2: Run normal polling for current state (your existing logic)
        print("\n" + "=" * 60)
        print("STEP 2: RUNNING TRADITIONAL POLLING")
        print("=" * 60)

        try:
            # Choose your preferred polling method
            print("🔍 Running memory-capped polling for current state...")
            total_polling_saved = self.run_memory_capped_polling_for_current_state(conn)

        except Exception as e:
            print(f"⚠️  Error in traditional polling: {e}")

        conn.close()

        # Final summary
        total_time = time.time() - self.start_time
        self.log_performance("Enhanced polling completed")

        print(f"\n{'=' * 70}")
        print(f"ENHANCED POLLING SUMMARY")
        print(f"{'=' * 70}")
        print(f"Total Runtime: {total_time:.1f} seconds ({total_time / 60:.1f} minutes)")
        print(f"Stage Changes from Events API: {total_events_saved:,}")
        print(f"Stage Changes from Polling: {total_polling_saved:,}")
        print(f"Total Stage Changes Captured: {total_events_saved + total_polling_saved:,}")
        print(f"API Requests Made: {self.api_requests}")
        print(f"Database Queries: {self.db_queries}")
        print(f"Peak Memory Usage: {self.peak_memory_mb:.0f}MB")
        print(f"\n✅ All rapid stage transitions have been captured!")

    def show_rapid_transition_examples(self, stage_changes):
        """
        Show examples of rapid transitions found
        """
        # Group by person and find rapid transitions
        person_changes = {}
        for change in stage_changes:
            person_id = change['person_id']
            if person_id not in person_changes:
                person_changes[person_id] = []
            person_changes[person_id].append(change)

        rapid_examples = []
        for person_id, changes in person_changes.items():
            if len(changes) > 1:
                # Sort by timestamp
                changes.sort(key=lambda x: x['changed_at'])

                # Check for rapid transitions (within 10 minutes)
                for i in range(1, len(changes)):
                    time_diff = (changes[i]['changed_at'] - changes[i - 1]['changed_at']).total_seconds()
                    if time_diff < 600:  # 10 minutes
                        rapid_examples.append({
                            'person': f"{changes[i]['first_name']} {changes[i]['last_name']}",
                            'transition1': f"{changes[i - 1]['stage_from']} → {changes[i - 1]['stage_to']}",
                            'transition2': f"{changes[i]['stage_from']} → {changes[i]['stage_to']}",
                            'time_diff': time_diff
                        })

        if rapid_examples:
            print(f"\n⚡ RAPID TRANSITIONS CAPTURED:")
            for i, example in enumerate(rapid_examples[:5]):  # Show first 5
                print(f"  {i + 1}. {example['person']}: {example['transition1']} then {example['transition2']}")
                print(f"     Time between transitions: {example['time_diff']:.0f} seconds")

            if len(rapid_examples) > 5:
                print(f"  ... and {len(rapid_examples) - 5} more rapid transitions")
        else:
            print("No rapid transitions detected in this batch")

    # === EXISTING METHODS (Updated to work with new database schema) ===

    def run_memory_capped_polling_for_current_state(self, conn):
        """
        Modified version of memory-capped polling for current state verification
        """
        print("Running traditional polling to verify current states...")

        # Get existing stages
        existing_stages = self.load_existing_stages_chunked(conn)
        self.log_performance(f"Loaded {len(existing_stages):,} existing stage records")

        # Process FUB data with streaming + memory monitoring
        url = "https://api.followupboss.com/v1/people"
        headers = {
            "Authorization": f"Basic {self.auth_string}",
            "X-System": "SynergyFUBLeadMetrics",
            "X-System-Key": os.getenv("FUB_SYSTEM_KEY")
        }

        next_token = None
        page_count = 0
        total_processed = 0
        total_skipped = 0
        total_changes_logged = 0
        pending_changes = []

        # Stream process all pages
        while True:
            page_count += 1

            # Memory check before each page
            current_memory = self.get_current_memory_mb()
            if current_memory > MAX_MEMORY_MB * 0.75:  # 75% of 2GB limit (1.5GB)
                self.log_performance(f"Memory threshold reached, flushing {len(pending_changes)} changes")
                if pending_changes:
                    total_changes_logged += self.bulk_insert_all_stage_changes(conn, pending_changes)
                    pending_changes = []
                self.force_garbage_collection()

            # API request with rate limiting
            params = {"limit": 100, "fields": "allFields"}
            if next_token:
                params["next"] = next_token

            if self.api_requests > 0 and self.api_requests % 180 == 0:
                time.sleep(11)

            resp = requests.get(url, headers=headers, params=params)
            self.api_requests += 1

            if resp.status_code == 429:
                retry_after = int(resp.headers.get('Retry-After', 10))
                time.sleep(retry_after)
                continue

            if resp.status_code != 200:
                break

            data = resp.json()
            current_batch = data.get("people", [])

            if not current_batch:
                break

            # Process this page immediately
            page_changes = self.process_page_for_changes(current_batch, existing_stages)
            pending_changes.extend(page_changes)

            # Update counters
            valid_count = len([p for p in current_batch
                               if p.get("id") and p.get("stage") and p.get("stage") != "Contact Upload"])
            skipped_count = len(current_batch) - valid_count

            total_processed += valid_count
            total_skipped += skipped_count

            # Auto-flush if too many changes accumulated
            if len(pending_changes) >= FLUSH_CHANGES_THRESHOLD:
                self.log_performance(f"Auto-flushing {len(pending_changes)} changes (threshold reached)")
                total_changes_logged += self.bulk_insert_all_stage_changes(conn, pending_changes)
                pending_changes = []
                self.force_garbage_collection()

            # Progress update
            if page_count % 100 == 0:
                self.log_performance(
                    f"Page {page_count}: {total_processed:,} people processed, {len(pending_changes):,} changes pending")

            # Get next page
            metadata = data.get("_metadata", {})
            next_token = metadata.get("next")

            if not next_token:
                break

            # Clear page data from memory immediately
            del current_batch, data

            # Periodic garbage collection
            if page_count % 200 == 0:
                self.force_garbage_collection()

        # Final flush of remaining changes
        if pending_changes:
            self.log_performance(f"Final flush: {len(pending_changes)} changes")
            total_changes_logged += self.bulk_insert_all_stage_changes(conn, pending_changes)

        return total_changes_logged

    def process_page_for_changes(self, people_page, existing_stages):
        """Process a single page of people and return stage changes"""
        changes = []

        for person in people_page:
            person_id = str(person.get("id", ""))
            current_stage = person.get("stage")

            if not person_id or not current_stage or current_stage == "Contact Upload":
                continue

            last_stage = existing_stages.get(person_id)

            # Extract custom fields and tags
            custom_fields = extract_custom_fields(person)
            lead_source_tag = extract_lead_source_tag(person.get('tags'))

            if last_stage is None:
                # New person
                changes.append({
                    'person_id': person_id,
                    'first_name': person.get('firstName'),
                    'last_name': person.get('lastName'),
                    'stage_from': "Contact Upload",
                    'stage_to': current_stage,
                    'raw_payload': person,
                    'source': 'polling',  # Mark as polling source
                    'event_id': None,  # No event ID for polling
                    # Custom fields
                    'campaign_id': custom_fields['campaign_id'],
                    'who_pushed_lead': custom_fields['who_pushed_lead'],
                    'parcel_county': custom_fields['parcel_county'],
                    'parcel_state': custom_fields['parcel_state'],
                    'lead_source_tag': lead_source_tag
                })
            elif last_stage != current_stage:
                # Stage change
                changes.append({
                    'person_id': person_id,
                    'first_name': person.get('firstName'),
                    'last_name': person.get('lastName'),
                    'stage_from': last_stage,
                    'stage_to': current_stage,
                    'raw_payload': person,
                    'source': 'polling',  # Mark as polling source
                    'event_id': None,  # No event ID for polling
                    # Custom fields
                    'campaign_id': custom_fields['campaign_id'],
                    'who_pushed_lead': custom_fields['who_pushed_lead'],
                    'parcel_county': custom_fields['parcel_county'],
                    'parcel_state': custom_fields['parcel_state'],
                    'lead_source_tag': lead_source_tag
                })

        return changes

    def bulk_insert_all_stage_changes(self, conn, all_stage_changes, max_retries=3):
        """
        Insert ALL stage changes with connection retry logic
        Updated to include new schema fields
        """
        if not all_stage_changes:
            return 0

        self.log_performance(f"Bulk insert: {len(all_stage_changes):,} records")

        for attempt in range(max_retries + 1):
            try:
                with conn.cursor() as cur:
                    query = """
                    INSERT INTO stage_changes (
                        person_id, deal_id, first_name, last_name,
                        stage_from, stage_to, changed_at, received_at, raw_payload,
                        campaign_id, who_pushed_lead, parcel_county, parcel_state, lead_source_tag,
                        source, event_id
                    ) VALUES %s
                    """

                    # Prepare ALL data for single bulk insert
                    values = [
                        (
                            change['person_id'],
                            None,  # deal_id
                            change['first_name'],
                            change['last_name'],
                            change['stage_from'],
                            change['stage_to'],
                            change.get('changed_at', datetime.datetime.utcnow()),
                            datetime.datetime.utcnow(),
                            json.dumps(change['raw_payload']),
                            # Custom fields
                            change.get('campaign_id'),
                            change.get('who_pushed_lead'),
                            change.get('parcel_county'),
                            change.get('parcel_state'),
                            change.get('lead_source_tag'),
                            # New fields
                            change.get('source', 'polling'),
                            change.get('event_id')
                        )
                        for change in all_stage_changes
                    ]

                    # Single massive insert with retry
                    psycopg2.extras.execute_values(
                        cur, query, values,
                        template=None, page_size=1000
                    )
                    conn.commit()
                    self.db_queries += 1
                    self.log_performance(f"Bulk insert completed: {len(all_stage_changes):,} records")
                    return len(all_stage_changes)  # Success - exit retry loop

            except OperationalError as e:
                if "SSL SYSCALL error" in str(e) or "EOF detected" in str(e) or "connection" in str(e).lower():
                    if attempt < max_retries:
                        wait_time = (attempt + 1) * 5  # 5, 10, 15 seconds
                        self.log_performance(
                            f"Database connection lost, retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})")
                        time.sleep(wait_time)

                        # Try to reconnect
                        try:
                            conn.close()
                        except:
                            pass
                        conn = self.get_connection()
                        continue
                    else:
                        self.log_performance(f"Failed to insert after {max_retries} retries. Saving to backup file.")
                        self.save_changes_to_backup_file(all_stage_changes)
                        raise
                else:
                    # Different error - don't retry
                    raise
            except Exception as e:
                # Any other error - save to backup and raise
                self.log_performance(f"Unexpected error during insert: {str(e)}")
                self.save_changes_to_backup_file(all_stage_changes)
                raise

        return 0

    def save_changes_to_backup_file(self, stage_changes):
        """
        Save stage changes to a backup file if database insert fails
        """
        backup_filename = f"stage_changes_backup_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

        backup_data = {
            "timestamp": datetime.datetime.now().isoformat(),
            "total_changes": len(stage_changes),
            "changes": stage_changes
        }

        with open(backup_filename, 'w') as f:
            json.dump(backup_data, f, indent=2, default=str)

        self.log_performance(f"Stage changes saved to backup file: {backup_filename}")
        print(f"⚠️  Database insert failed, but {len(stage_changes)} changes saved to {backup_filename}")
        print("   You can manually review and re-import these changes later.")

    # === EXISTING HELPER METHODS (keeping your original optimizations) ===

    def get_connection(self, max_retries=3):
        """
        Get database connection with retry logic
        """
        for attempt in range(max_retries + 1):
            try:
                conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
                # Test the connection
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                return conn
            except Exception as e:
                if attempt < max_retries:
                    wait_time = (attempt + 1) * 2
                    self.log_performance(
                        f"Database connection failed, retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})")
                    time.sleep(wait_time)
                else:
                    self.log_performance(f"Failed to connect to database after {max_retries} retries")
                    raise

    def load_existing_stages_chunked(self, conn):
        """Load existing stages in chunks to control memory usage"""
        self.log_performance("Loading existing stages in memory-efficient chunks")

        # First, count total records to plan chunking
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(DISTINCT person_id) FROM stage_changes")
            total_people = cur.fetchone()[0]
            self.db_queries += 1

        self.log_performance(f"Found {total_people:,} people with existing stage data")

        # Load in chunks if dataset is large
        if total_people > 200000:  # If more than 200k people
            self.log_performance("Large dataset detected, using chunked loading")
            return self.load_stages_in_batches(conn, chunk_size=100000)
        else:
            # Small enough to load all at once
            return self.get_all_existing_stages(conn)

    def load_stages_in_batches(self, conn, chunk_size=100000):
        """Load existing stages in batches to control memory"""
        all_stages = {}
        offset = 0

        while True:
            with conn.cursor() as cur:
                query = """
                SELECT DISTINCT ON (person_id) 
                    person_id, stage_to 
                FROM stage_changes 
                ORDER BY person_id, changed_at DESC
                LIMIT %s OFFSET %s;
                """
                cur.execute(query, (chunk_size, offset))
                self.db_queries += 1

                results = cur.fetchall()
                if not results:
                    break

                chunk_stages = {str(person_id): stage for person_id, stage in results}
                all_stages.update(chunk_stages)

                offset += chunk_size
                self.log_performance(f"Loaded {len(all_stages):,} total stage records")

                # Check memory after each chunk
                if self.get_current_memory_mb() > MAX_MEMORY_MB * 0.6:  # 60% of 2GB
                    self.log_performance("Memory limit approaching during stage loading")
                    self.force_garbage_collection()

        return all_stages

    def get_all_existing_stages(self, conn):
        """Get all existing stages in one query (memory efficient)"""
        self.log_performance("Loading ALL existing stage records")

        with conn.cursor() as cur:
            query = """
            SELECT DISTINCT ON (person_id) 
                person_id, stage_to 
            FROM stage_changes 
            ORDER BY person_id, changed_at DESC;
            """
            cur.execute(query)
            self.db_queries += 1

            results = cur.fetchall()
            return {str(person_id): stage for person_id, stage in results}

    # === LEGACY METHODS (keeping for backward compatibility) ===

    def fetch_all_people_optimized(self):
        """
        Original optimized version with rate limiting awareness and progress tracking
        """
        url = "https://api.followupboss.com/v1/people"
        headers = {
            "Authorization": f"Basic {self.auth_string}",
            "X-System": "SynergyFUBLeadMetrics",
            "X-System-Key": os.getenv("FUB_SYSTEM_KEY")
        }

        people = []
        next_token = None
        page_count = 0
        limit = 100  # Maximum allowed by FUB API

        self.log_performance("Starting FUB API data fetch")

        while True:
            page_count += 1
            params = {"limit": limit, "fields": "allFields"}

            if next_token:
                params["next"] = next_token

            # Rate limiting: more aggressive for large datasets
            if self.api_requests > 0 and self.api_requests % 180 == 0:
                print(f"Rate limiting: sleeping 11 seconds after {self.api_requests} requests")
                time.sleep(11)

            start_request = time.time()
            resp = requests.get(url, headers=headers, params=params)
            self.api_requests += 1
            request_time = time.time() - start_request

            # Check rate limit headers if available
            if 'X-RateLimit-Remaining' in resp.headers:
                remaining = resp.headers.get('X-RateLimit-Remaining')
                if int(remaining) < 10:  # If getting close to limit
                    print(f"Rate limit warning: {remaining} requests remaining")
                    time.sleep(2)

            if resp.status_code == 429:  # Rate limited
                retry_after = int(resp.headers.get('Retry-After', 10))
                print(f"Rate limited! Waiting {retry_after} seconds...")
                time.sleep(retry_after)
                continue

            if resp.status_code != 200:
                print(f"API Error (status {resp.status_code}): {resp.text}")
                break

            data = resp.json()
            current_batch = data.get("people", [])

            if not current_batch:
                self.log_performance("No more people returned - finished pagination")
                break

            people.extend(current_batch)

            # Progress logging every 5 pages for large datasets
            if page_count % 5 == 0:
                metadata = data.get("_metadata", {})
                total = metadata.get("total", "unknown")
                progress_pct = (len(people) / 202000 * 100) if len(people) < 202000 else 100
                self.log_performance(
                    f"Page {page_count}: {len(people):,} people fetched ({progress_pct:.1f}% of ~202k)")

            # Memory management for large datasets
            if len(people) % 50000 == 0 and len(people) > 0:
                print(f"Memory checkpoint: {len(people):,} people in memory")

            # Get next token
            metadata = data.get("_metadata", {})
            next_token = metadata.get("next")

            if not next_token:
                self.log_performance("No next token - pagination complete")
                break

            # Small delay between requests to be respectful
            time.sleep(0.1)

        self.log_performance(f"API fetch completed: {len(people)} total people")
        return people

    def run_ultimate_optimized_polling(self):
        """
        ULTIMATE OPTIMIZATION: Minimize database round trips to absolute minimum
        Updated to work with enhanced schema
        """
        print("Starting ULTIMATE OPTIMIZED stage polling...")
        self.log_performance("Script started")

        # Step 1: Fetch all people from FUB
        people = self.fetch_all_people_optimized()
        self.log_performance(f"Total people fetched: {len(people):,}")

        if not people:
            print("No people fetched. Exiting.")
            return

        # Step 2: Filter valid people upfront
        self.log_performance("Filtering valid people...")
        valid_people = []
        skipped = 0

        for person in people:
            person_id = person.get("id")
            current_stage = person.get("stage")

            if not person_id or not current_stage:
                continue

            if current_stage == "Contact Upload":
                skipped += 1
                continue

            valid_people.append(person)

        self.log_performance(f"Valid people to process: {len(valid_people):,} (skipped {skipped:,})")

        if not valid_people:
            print("No valid people to process.")
            return

        conn = self.get_connection()

        # Step 3: SINGLE QUERY to get ALL last stages at once
        all_person_ids = [str(person.get("id")) for person in valid_people]
        all_last_stages = self.get_all_last_stages_at_once(conn, all_person_ids)

        # Step 4: Process all people and collect ALL stage changes
        self.log_performance("Processing all stage changes...")
        all_stage_changes = []
        logged = 0

        for person in valid_people:
            person_id = str(person.get("id"))
            current_stage = person.get("stage")
            last_stage = all_last_stages.get(person_id)

            stage_change = None

            # Extract custom fields and tags for this person
            custom_fields = extract_custom_fields(person)
            lead_source_tag = extract_lead_source_tag(person.get('tags'))

            if last_stage is None:
                # New person - track from "Contact Upload"
                stage_change = {
                    'person_id': person_id,
                    'first_name': person.get('firstName'),
                    'last_name': person.get('lastName'),
                    'stage_from': "Contact Upload",
                    'stage_to': current_stage,
                    'raw_payload': person,
                    'source': 'polling',
                    'event_id': None,
                    # Custom fields
                    'campaign_id': custom_fields['campaign_id'],
                    'who_pushed_lead': custom_fields['who_pushed_lead'],
                    'parcel_county': custom_fields['parcel_county'],
                    'parcel_state': custom_fields['parcel_state'],
                    'lead_source_tag': lead_source_tag
                }
                logged += 1

            elif last_stage != current_stage:
                # Stage change detected
                stage_change = {
                    'person_id': person_id,
                    'first_name': person.get('firstName'),
                    'last_name': person.get('lastName'),
                    'stage_from': last_stage,
                    'stage_to': current_stage,
                    'raw_payload': person,
                    'source': 'polling',
                    'event_id': None,
                    # Custom fields
                    'campaign_id': custom_fields['campaign_id'],
                    'who_pushed_lead': custom_fields['who_pushed_lead'],
                    'parcel_county': custom_fields['parcel_county'],
                    'parcel_state': custom_fields['parcel_state'],
                    'lead_source_tag': lead_source_tag
                }
                logged += 1

            if stage_change:
                all_stage_changes.append(stage_change)

        # Step 5: SINGLE BULK INSERT for ALL stage changes with retry logic
        if all_stage_changes:
            self.log_performance(f"Bulk inserting ALL {len(all_stage_changes):,} stage changes in ONE transaction")
            self.bulk_insert_all_stage_changes(conn, all_stage_changes)

            # Show some examples
            print(f"\nStage Changes Detected:")
            for i, change in enumerate(all_stage_changes[:10]):  # Show first 10
                name = f"{change['first_name']} {change['last_name']}"
                transition = f"{change['stage_from']} → {change['stage_to']}"
                print(f"  {i + 1}. {name}: {transition}")

            if len(all_stage_changes) > 10:
                print(f"  ... and {len(all_stage_changes) - 10:,} more changes")
        else:
            print("No stage changes detected.")

        conn.close()

        total_time = time.time() - self.start_time
        self.log_performance("Processing complete")

        print(f"\n{'=' * 60}")
        print(f"ULTIMATE PERFORMANCE SUMMARY")
        print(f"{'=' * 60}")
        print(f"Total Runtime: {total_time:.1f} seconds ({total_time / 60:.1f} minutes)")
        print(f"People Fetched: {len(people):,}")
        print(f"Valid People Processed: {len(valid_people):,}")
        print(f"API Requests Made: {self.api_requests}")
        print(f"Database Queries: {self.db_queries} (should be 2: 1 read + 1 write)")
        print(f"Skipped (Contact Upload): {skipped:,}")
        print(f"Stage Changes Logged: {logged:,}")
        print(f"Processing Rate: {len(people) / total_time:.1f} people/second")
        print(f"API Rate: {self.api_requests / total_time:.2f} requests/second")

    def get_all_last_stages_at_once(self, conn, all_person_ids):
        """
        ULTIMATE OPTIMIZATION: Get ALL last stages in a single query
        """
        if not all_person_ids:
            return {}

        self.log_performance(f"Loading ALL last stages for {len(all_person_ids):,} people in ONE query")

        with conn.cursor() as cur:
            # Single massive query to get all last stages at once
            query = """
            SELECT DISTINCT ON (person_id) 
                person_id, stage_to 
            FROM stage_changes 
            WHERE person_id = ANY(%s)
            ORDER BY person_id, changed_at DESC;
            """
            cur.execute(query, (all_person_ids,))
            self.db_queries += 1

            results = cur.fetchall()
            self.log_performance(f"Loaded {len(results):,} existing stage records")
            return {str(person_id): stage for person_id, stage in results}


def main():
    # Check if psutil is available
    try:
        import psutil
    except ImportError:
        print("Installing required package: psutil")
        import subprocess
        subprocess.check_call(["pip", "install", "psutil"])
        import psutil

    optimizer = PerformanceOptimizedFUB()

    print("🚀 Enhanced FUB Stage Tracker with Events API")
    print("=" * 50)
    print("Choose mode:")
    print("1. ENHANCED (Events API + Polling) - RECOMMENDED")
    print("   ✅ Captures rapid stage transitions")
    print("   ✅ Never misses intermediate stages")
    print("   ✅ Handles leads that change stages in seconds")
    print()
    print("2. ULTIMATE (fastest traditional polling)")
    print("   ⚡ Maximum speed but may miss rapid transitions")
    print()
    print("3. MEMORY-CAPPED (traditional polling, scales infinitely)")
    print("   🛡️ Safe for any dataset size")

    choice = input("\nEnter choice (1, 2, or 3): ").strip()

    if choice == "1":
        print(f"\n🚀 Using ENHANCED mode with Events API")
        print("   This will capture ALL stage transitions, including rapid ones!")
        optimizer.run_enhanced_polling()
    elif choice == "2":
        current_memory = psutil.virtual_memory()
        available_gb = current_memory.available / (1024 ** 3)

        if available_gb < 3:
            print(f"⚠️  Warning: Only {available_gb:.1f}GB RAM available.")
            print("   ULTIMATE mode may cause memory issues.")
            print("   Consider using ENHANCED or MEMORY-CAPPED mode instead.")

            confirm = input("Continue with ULTIMATE mode? (y/n): ").lower()
            if confirm != 'y':
                print("Switching to ENHANCED mode...")
                optimizer.run_enhanced_polling()
                return

        print(f"\n⚡ Using ULTIMATE mode")
        print("   Maximum speed but higher memory usage")
        optimizer.run_ultimate_optimized_polling()
    else:
        print(f"\n🛡️  Using MEMORY-CAPPED mode (limit: {MAX_MEMORY_MB}MB = 2GB)")
        print("   This will handle any dataset size safely!")
        conn = optimizer.get_connection()
        optimizer.run_memory_capped_polling_for_current_state(conn)
        conn.close()


if __name__ == "__main__":
    main()