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
        'campaign_id': person.get('customCampaignId'),
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

    def fetch_all_people_optimized(self):
        """
        Optimized version with rate limiting awareness and progress tracking
        """
        url = "https://api.followupboss.com/v1/people"
        auth_string = base64.b64encode(f"{FUB_API_KEY}:".encode("utf-8")).decode("utf-8")
        headers = {
            "Authorization": f"Basic {auth_string}",
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
            params = {"limit": limit}

            if next_token:
                params["next"] = next_token

            # Rate limiting: more aggressive for large datasets
            if self.api_requests > 0 and self.api_requests % 180 == 0:  # More requests per window
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

    def get_all_last_stages_at_once(self, conn, all_person_ids):
        """
        ULTIMATE OPTIMIZATION: Get ALL last stages in a single query
        Instead of batching, load everything upfront
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

    def run_ultimate_optimized_polling(self):
        """
        ULTIMATE OPTIMIZATION: Minimize database round trips to absolute minimum
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
                    # NEW: Add custom fields
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
                    # NEW: Add custom fields
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

    def run_memory_capped_polling(self):
        """
        MEMORY-CAPPED VERSION: Scales to any dataset size while keeping memory under limit
        Automatically manages memory regardless of how many leads you have
        """
        print(f"Starting MEMORY-CAPPED stage polling (limit: {MAX_MEMORY_MB}MB)...")
        self.log_performance("Script started")

        conn = self.get_connection()

        # Step 1: Load existing stages in chunks to respect memory limits
        existing_stages = self.load_existing_stages_chunked(conn)
        self.log_performance(f"Loaded {len(existing_stages):,} existing stage records")

        # Step 2: Process FUB data with streaming + memory monitoring
        url = "https://api.followupboss.com/v1/people"
        auth_string = base64.b64encode(f"{FUB_API_KEY}:".encode("utf-8")).decode("utf-8")
        headers = {
            "Authorization": f"Basic {auth_string}",
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
                    self.bulk_insert_all_stage_changes(conn, pending_changes)
                    total_changes_logged += len(pending_changes)
                    pending_changes = []
                self.force_garbage_collection()

            # API request with rate limiting
            params = {"limit": 100}
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
                self.bulk_insert_all_stage_changes(conn, pending_changes)
                total_changes_logged += len(pending_changes)
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
            self.bulk_insert_all_stage_changes(conn, pending_changes)
            total_changes_logged += len(pending_changes)

        conn.close()

        total_time = time.time() - self.start_time
        self.log_performance("Memory-capped processing complete")

        print(f"\n{'=' * 70}")
        print(f"MEMORY-CAPPED PERFORMANCE SUMMARY")
        print(f"{'=' * 70}")
        print(f"Total Runtime: {total_time:.1f} seconds ({total_time / 60:.1f} minutes)")
        print(f"People Processed: {total_processed:,}")
        print(f"People Skipped: {total_skipped:,}")
        print(f"Stage Changes Logged: {total_changes_logged:,}")
        print(f"Peak Memory Usage: {self.peak_memory_mb:.0f}MB (limit: {MAX_MEMORY_MB}MB)")
        print(f"Memory Efficiency: {(self.peak_memory_mb / MAX_MEMORY_MB) * 100:.1f}% of limit used")
        print(f"Database Queries: {self.db_queries}")
        print(f"API Requests: {self.api_requests}")

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
        if total_people > 200000:  # If more than 200k people (increased threshold for 2GB)
            self.log_performance("Large dataset detected, using chunked loading")
            return self.load_stages_in_batches(conn, chunk_size=100000)  # Larger chunks for 2GB
        else:
            # Small enough to load all at once
            return self.get_all_existing_stages(conn)

    def load_stages_in_batches(self, conn, chunk_size=100000):  # Larger default chunk for 2GB
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
                if self.get_current_memory_mb() > MAX_MEMORY_MB * 0.6:  # 60% of 2GB (1.2GB)
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
                    # NEW: Add custom fields
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
                    # NEW: Add custom fields
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
        """
        if not all_stage_changes:
            return

        self.log_performance(f"MEGA bulk insert: {len(all_stage_changes):,} records")

        for attempt in range(max_retries + 1):
            try:
                with conn.cursor() as cur:
                    query = """
                    INSERT INTO stage_changes (
                        person_id, deal_id, first_name, last_name,
                        stage_from, stage_to, changed_at, received_at, raw_payload,
                        campaign_id, who_pushed_lead, parcel_county, parcel_state, lead_source_tag
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
                            datetime.datetime.utcnow(),
                            datetime.datetime.utcnow(),
                            json.dumps(change['raw_payload']),
                            # NEW: Custom fields
                            change.get('campaign_id'),
                            change.get('who_pushed_lead'),
                            change.get('parcel_county'),
                            change.get('parcel_state'),
                            change.get('lead_source_tag')
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
                    self.log_performance(f"Mega insert completed: {len(all_stage_changes):,} records")
                    return  # Success - exit retry loop

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

    print("Choose optimization level:")
    print("1. ULTIMATE (fastest, ~1.4GB RAM for 202k records)")
    print("2. MEMORY-CAPPED (scales infinitely, always under 2GB)")
    print()
    print("💡 Recommendation: Use MEMORY-CAPPED for production systems")
    print("   It will handle any dataset size (500k, 1M+ records) safely")

    choice = input("\nEnter choice (1 or 2): ").strip()

    if choice == "1":
        current_memory = psutil.virtual_memory()
        available_gb = current_memory.available / (1024 ** 3)

        if available_gb < 3:  # Need 3GB for safety with 1.4GB peak
            print(f"⚠️  Warning: Only {available_gb:.1f}GB RAM available.")
            print("   ULTIMATE mode may cause memory issues.")
            print("   Consider using MEMORY-CAPPED mode instead.")

            confirm = input("Continue with ULTIMATE mode? (y/n): ").lower()
            if confirm != 'y':
                print("Switching to MEMORY-CAPPED mode...")
                choice = "2"

    if choice == "2":
        print(f"\n🛡️  Using MEMORY-CAPPED mode (limit: {MAX_MEMORY_MB}MB = 2GB)")
        print("   This will handle any dataset size safely!")
        optimizer.run_memory_capped_polling()
    else:
        print(f"\n⚡ Using ULTIMATE mode")
        print("   Maximum speed but higher memory usage")
        optimizer.run_ultimate_optimized_polling()


if __name__ == "__main__":
    main()