"""
FollowUpBoss Webhook Server - FIXED VERSION
Dedicated server for real-time stage change capture
Deploy this as a persistent service (Railway, Heroku, etc.)
"""

import os
import json
import datetime
import psycopg2
import psycopg2.extras
import base64
import time
import logging
import threading
import requests
from collections import deque
from flask import Flask, request, jsonify
import hashlib
import hmac

# Configuration
FUB_API_KEY = os.getenv("FUB_API_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
FUB_SYSTEM_KEY = os.getenv("FUB_SYSTEM_KEY")
WEBHOOK_BASE_URL = os.getenv("WEBHOOK_BASE_URL")  # Your deployed webhook URL
WEBHOOK_PORT = int(os.getenv("PORT", os.getenv("WEBHOOK_PORT", 5000)))

# Webhook settings
WEBHOOK_QUEUE_SIZE = 10000
MAX_RETRIES = 3

# Enhanced logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('webhook_server.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Relevant webhook events for stage tracking
RELEVANT_WEBHOOK_EVENTS = [
    'peopleStageUpdated',  # Most important - direct stage changes
    'peopleCreated',  # New leads
    'peopleUpdated',  # General updates that might include stage changes
    'peopleTagsCreated'  # Tag changes (for lead source tracking)
]


# Shared utility functions
def extract_custom_fields(person):
    return {
        'campaign_id': person.get('customCampaignID'),
        'who_pushed_lead': person.get('customWhoPushedTheLead'),
        'parcel_county': person.get('customParcelCounty'),
        'parcel_state': person.get('customParcelState')
    }


def extract_lead_source_tag(tags):
    if not tags or not isinstance(tags, list):
        return None
    if "ReadyMode" in tags:
        return "ReadyMode"
    elif "Roor" in tags:
        return "Roor"
    return None


def get_stage_priority(stage_name: str) -> int:
    STANDARD_FUB_STAGES = [
        "Contact Upload", "ACQ - New Lead", "ACQ - Attempted Contact",
        "ACQ - Contacted", "ACQ - Qualified", "ACQ - Offers Made",
        "ACQ - Price Motivated", "ACQ - Under Contract", "ACQ - Closed Won",
        "ACQ - Closed Lost", "ACQ - On Hold", "ACQ - Not Qualified"
    ]
    try:
        return STANDARD_FUB_STAGES.index(stage_name)
    except ValueError:
        return 999


def calculate_time_in_stage(stage_from_timestamp, stage_to_timestamp):
    if not stage_from_timestamp or not stage_to_timestamp:
        return 0.0, 0, 0

    time_diff = stage_to_timestamp - stage_from_timestamp
    total_seconds = time_diff.total_seconds()

    days_float = total_seconds / (24 * 60 * 60)
    hours_int = int(total_seconds // 3600)
    minutes_int = int((total_seconds % 3600) // 60)

    return round(days_float, 2), hours_int, minutes_int


# FIXED: Correct FUB signature verification
def verify_fub_signature(payload, signature):
    """
    FIXED: Verify FUB signature using their documented method
    FUB Method: base64 encode JSON payload, then SHA256 HMAC with system key
    """
    if not FUB_SYSTEM_KEY or not signature:
        logger.warning("FUB signature verification skipped - missing system key or signature")
        return True  # Skip if not configured, but log warning

    try:
        # Step 1: Base64 encode the raw JSON payload (non-prettified)
        encoded_payload = base64.b64encode(payload).decode('utf-8')

        # Step 2: Create HMAC-SHA256 with encoded payload and system key
        expected = hmac.new(
            FUB_SYSTEM_KEY.encode('utf-8'),
            encoded_payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        # Use timing-safe comparison
        is_valid = hmac.compare_digest(expected, signature)

        if not is_valid:
            logger.error(f"FUB signature mismatch. Expected: {expected}, Got: {signature}")

        return is_valid

    except Exception as e:
        logger.error(f"Error verifying FUB signature: {e}")
        return False


# NEW: Webhook registration function
def register_fub_webhooks():
    """Register webhooks with Follow Up Boss"""
    if not WEBHOOK_BASE_URL:
        logger.error("WEBHOOK_BASE_URL not set - cannot register webhooks")
        return False

    if not FUB_API_KEY or not FUB_SYSTEM_KEY:
        logger.error("FUB_API_KEY or FUB_SYSTEM_KEY not set - cannot register webhooks")
        return False

    webhook_url = f"{WEBHOOK_BASE_URL.rstrip('/')}/webhook/fub/stage-change"
    logger.info(f"Registering webhooks with URL: {webhook_url}")

    success_count = 0

    for event in RELEVANT_WEBHOOK_EVENTS:
        try:
            response = requests.post(
                'https://api.followupboss.com/v1/webhooks',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f"Basic {base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()}",
                    'X-System': 'SynergyFUBLeadMetrics',
                    'X-System-Key': FUB_SYSTEM_KEY
                },
                json={
                    'event': event,
                    'url': webhook_url
                },
                timeout=30
            )

            if response.status_code == 201:
                webhook_data = response.json()
                logger.info(f"✅ Successfully registered {event} webhook (ID: {webhook_data.get('id')})")
                success_count += 1
            elif response.status_code == 400 and "already exists" in response.text.lower():
                logger.info(f"ℹ️  {event} webhook already exists")
                success_count += 1
            else:
                logger.error(f"❌ Failed to register {event} webhook: {response.status_code} - {response.text}")

        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Network error registering {event} webhook: {e}")
        except Exception as e:
            logger.error(f"❌ Unexpected error registering {event} webhook: {e}")

        # Rate limiting between requests
        time.sleep(1)

    logger.info(f"Webhook registration complete: {success_count}/{len(RELEVANT_WEBHOOK_EVENTS)} successful")
    return success_count > 0


# NEW: List existing webhooks for debugging
def list_existing_webhooks():
    """List existing webhooks for debugging"""
    if not FUB_API_KEY or not FUB_SYSTEM_KEY:
        logger.error("Cannot list webhooks - missing API credentials")
        return []

    try:
        response = requests.get(
            'https://api.followupboss.com/v1/webhooks',
            headers={
                'Authorization': f"Basic {base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()}",
                'X-System': 'SynergyFUBLeadMetrics',
                'X-System-Key': FUB_SYSTEM_KEY
            },
            timeout=30
        )

        if response.status_code == 200:
            webhooks = response.json().get('webhooks', [])
            logger.info(f"Found {len(webhooks)} existing webhooks:")
            for webhook in webhooks:
                logger.info(f"  - {webhook.get('event')} -> {webhook.get('url')} (ID: {webhook.get('id')})")
            return webhooks
        else:
            logger.error(f"Failed to list webhooks: {response.status_code} - {response.text}")
            return []

    except Exception as e:
        logger.error(f"Error listing webhooks: {e}")
        return []


class WebhookProcessor:
    def __init__(self):
        self.webhook_queue = deque(maxlen=WEBHOOK_QUEUE_SIZE)
        self.processed_webhooks = set()
        
        # FIXED: Enhanced deduplication for rapid transitions
        self.recent_webhooks = {}  # person_id -> {"last_stage": stage, "last_time": timestamp, "count": int}
        self.webhook_dedup_window = 30  # seconds to consider for deduplication

        # Stats tracking
        self.stats = {
            'webhooks_received': 0,
            'webhooks_processed': 0,
            'webhooks_failed': 0,
            'webhooks_ignored': 0,  # Track ignored events
            'webhooks_deduplicated': 0,  # Track deduplicated webhooks
            'stage_changes_captured': 0,
            'rapid_transitions_captured': 0,
            'last_webhook_time': None,
            'system_start_time': datetime.datetime.utcnow()
        }

        # Start processor thread
        self.start_webhook_processor()

    def start_webhook_processor(self):
        def process_queue():
            logger.info("Webhook processor thread started")
            while True:
                try:
                    if self.webhook_queue:
                        webhook_data = self.webhook_queue.popleft()
                        self.process_fub_webhook_event(webhook_data)
                    else:
                        time.sleep(0.1)
                except Exception as e:
                    logger.error(f"Webhook processor error: {e}")
                    time.sleep(1)

        processor_thread = threading.Thread(target=process_queue, daemon=True)
        processor_thread.start()

    def add_webhook_to_queue(self, webhook_data):
        webhook_id = webhook_data.get('eventId', f"webhook_{int(datetime.datetime.utcnow().timestamp())}")
        event_type = webhook_data.get('event', 'unknown')

        # FIXED: Filter for relevant events only
        if event_type not in RELEVANT_WEBHOOK_EVENTS:
            logger.info(f"Ignoring non-stage event: {event_type}")
            self.stats['webhooks_ignored'] += 1
            return False

        if webhook_id in self.processed_webhooks:
            logger.warning(f"Duplicate webhook ignored: {webhook_id}")
            return False

        # FIXED: Enhanced deduplication for rapid stage transitions
        if self.is_duplicate_rapid_transition(webhook_data):
            logger.info(f"Rapid transition duplicate ignored: {event_type} - {webhook_id}")
            self.stats['webhooks_deduplicated'] += 1
            return False

        self.webhook_queue.append(webhook_data)
        self.processed_webhooks.add(webhook_id)
        self.stats['webhooks_received'] += 1
        self.stats['last_webhook_time'] = datetime.datetime.utcnow()

        logger.info(f"Webhook queued: {event_type} - {webhook_id} (Queue: {len(self.webhook_queue)})")
        return True

    def is_duplicate_rapid_transition(self, webhook_data):
        """FIXED: Check if this webhook is a duplicate rapid transition"""
        try:
            # Extract person info from webhook data
            resource_uri = webhook_data.get('uri', '')
            if not resource_uri:
                return False
            
            # Extract person ID from URI (e.g., "/v1/people/265312" -> "265312")
            person_id = resource_uri.split('/')[-1] if '/' in resource_uri else None
            if not person_id:
                return False

            current_time = datetime.datetime.utcnow()
            
            # Check if we've seen recent webhooks for this person
            if person_id in self.recent_webhooks:
                recent = self.recent_webhooks[person_id]
                time_since_last = (current_time - recent['last_time']).total_seconds()
                
                # If within dedup window, it's likely a duplicate
                if time_since_last < self.webhook_dedup_window:
                    recent['count'] += 1
                    logger.info(f"Rapid webhook detected for person {person_id}: {recent['count']} webhooks in {time_since_last:.1f}s")
                    
                    # If more than 2 webhooks in dedup window, it's likely spam
                    if recent['count'] > 2:
                        return True
                else:
                    # Reset counter if outside dedup window
                    recent['count'] = 1
                    recent['last_time'] = current_time
            else:
                # First webhook for this person
                self.recent_webhooks[person_id] = {
                    'last_time': current_time,
                    'count': 1
                }

            # Clean up old entries (memory management)
            self.cleanup_recent_webhooks()
            return False

        except Exception as e:
            logger.error(f"Error in duplicate detection: {e}")
            return False

    def cleanup_recent_webhooks(self):
        """Clean up old webhook tracking data"""
        try:
            current_time = datetime.datetime.utcnow()
            cutoff_time = current_time - datetime.timedelta(seconds=self.webhook_dedup_window * 2)
            
            # Remove entries older than 2x the dedup window
            to_remove = [
                person_id for person_id, data in self.recent_webhooks.items()
                if data['last_time'] < cutoff_time
            ]
            
            for person_id in to_remove:
                del self.recent_webhooks[person_id]
                
            if to_remove:
                logger.info(f"Cleaned up {len(to_remove)} old webhook tracking entries")
                
        except Exception as e:
            logger.error(f"Error cleaning up recent webhooks: {e}")

    def process_fub_webhook_event(self, webhook_data):
        """Process FUB webhook event by fetching person data and checking for stage changes"""
        try:
            event_type = webhook_data.get('event')
            resource_uri = webhook_data.get('uri')

            if not resource_uri:
                # Some webhooks (like peopleDeleted) don't have URIs
                logger.info(f"No resource URI for {event_type} webhook")
                self.stats['webhooks_processed'] += 1
                return True

            # Fetch the actual person data from FUB
            person_data = self.fetch_fub_resource(resource_uri)
            if not person_data:
                self.stats['webhooks_failed'] += 1
                return False

            # Process each person for stage changes
            people_list = person_data.get('people', [])
            if not people_list:
                # Might be a single person object
                if person_data.get('id'):
                    people_list = [person_data]

            total_processed = 0
            for person in people_list:
                if self.process_person_stage_change(person, event_type):
                    total_processed += 1

            if total_processed > 0:
                self.stats['webhooks_processed'] += 1
                logger.info(f"Processed {total_processed} people from {event_type} webhook")
            else:
                # Still count as processed even if no stage changes detected
                self.stats['webhooks_processed'] += 1

            return True

        except Exception as e:
            logger.error(f"Error processing webhook event: {e}")
            self.stats['webhooks_failed'] += 1
            return False

    def fetch_fub_resource(self, resource_uri):
        """Fetch person data from FUB API with custom fields"""
        try:
            # Add fields=allFields to get custom fields
            separator = '&' if '?' in resource_uri else '?'
            full_uri = f"{resource_uri}{separator}fields=allFields"

            headers = {
                "Authorization": f"Basic {base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()}",
                "X-System": "SynergyFUBLeadMetrics"
            }

            if FUB_SYSTEM_KEY:
                headers["X-System-Key"] = FUB_SYSTEM_KEY

            response = requests.get(full_uri, headers=headers, timeout=30)
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to fetch FUB resource: {response.status_code} - {response.text}")
                return None

        except Exception as e:
            logger.error(f"Error fetching FUB resource: {e}")
            return None

    def process_person_stage_change(self, person, event_type):
        """FIXED: Process a single person for stage changes with race condition protection"""
        try:
            person_id = str(person.get('id', ''))
            current_stage = person.get('stage')

            if not person_id or not current_stage:
                return False

            # Skip "Contact Upload" stage as it's not meaningful for tracking
            if current_stage == "Contact Upload":
                return False

            # FIXED: Use transaction-safe stage change detection
            return self.process_stage_change_with_lock(person, current_stage, event_type)

        except Exception as e:
            logger.error(f"Error processing person stage change: {e}")
            return False

    def process_stage_change_with_lock(self, person, current_stage, event_type):
        """FIXED: Process stage change with database transaction lock to prevent race conditions"""
        person_id = str(person.get('id', ''))
        conn = None
        
        try:
            conn = self.get_connection()
            conn.autocommit = False  # Start transaction
            
            with conn.cursor() as cur:
                # FIXED: Use SELECT FOR UPDATE to lock the person's records during check
                cur.execute("""
                    SELECT stage_to, changed_at FROM stage_changes 
                    WHERE person_id = %s 
                    ORDER BY changed_at DESC 
                    LIMIT 1
                    FOR UPDATE
                """, (person_id,))
                
                result = cur.fetchone()
                last_known_stage = result[0] if result else None
                last_change_time = result[1] if result else None

                # Check if this is actually a stage change
                if last_known_stage != current_stage:
                    logger.info(f"STAGE CHANGE DETECTED: {person.get('firstName', '')} {person.get('lastName', '')} - {last_known_stage or 'NEW'} → {current_stage}")
                    
                    # Create the stage change record
                    stage_change_data = self.create_stage_change_record(person, last_known_stage, current_stage, event_type)
                    
                    if stage_change_data:
                        # Add time-in-stage calculations
                        if last_change_time:
                            stage_change_data['previous_stage_timestamp'] = last_change_time
                        self.add_time_tracking_data(stage_change_data)

                        # FIXED: Save within the same transaction to prevent race conditions
                        success = self.save_stage_change_in_transaction(stage_change_data, cur)
                        
                        if success:
                            conn.commit()  # Commit the transaction
                            self.stats['stage_changes_captured'] += 1
                            logger.info(f"✅ Stage change saved: {person.get('firstName', '')} {person.get('lastName', '')} - {last_known_stage or 'NEW'} → {current_stage}")
                            return True
                        else:
                            conn.rollback()
                            logger.error(f"❌ Failed to save stage change for {person.get('firstName', '')} {person.get('lastName', '')}")
                            return False
                else:
                    conn.commit()  # Release the lock
                    # Not a stage change, but log for peopleStageUpdated events
                    if event_type == 'peopleStageUpdated':
                        logger.info(f"peopleStageUpdated webhook but no change: {person.get('firstName', '')} {person.get('lastName', '')} (still {current_stage})")
                    return False

        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Error in stage change processing: {e}")
            return False
        finally:
            if conn:
                conn.close()

    def get_person_last_stage(self, person_id):
        """Get person's last known stage from database"""
        try:
            conn = self.get_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT stage_to FROM stage_changes 
                    WHERE person_id = %s 
                    ORDER BY changed_at DESC 
                    LIMIT 1
                """, (person_id,))
                result = cur.fetchone()
                return result[0] if result else None
        except Exception as e:
            logger.error(f"Error getting last stage: {e}")
            return None
        finally:
            if 'conn' in locals():
                conn.close()

    def create_stage_change_record(self, person, stage_from, stage_to, event_type):
        """Create stage change record from person data"""
        try:
            custom_fields = extract_custom_fields(person)
            lead_source_tag = extract_lead_source_tag(person.get('tags'))

            return {
                'person_id': str(person.get('id')),
                'deal_id': person.get('dealId'),
                'first_name': person.get('firstName'),
                'last_name': person.get('lastName'),
                'stage_from': stage_from or 'Unknown',
                'stage_to': stage_to,
                'changed_at': datetime.datetime.utcnow(),
                # Use current time since FUB doesn't provide exact change time in webhook
                'received_at': datetime.datetime.utcnow(),
                'source': f'webhook_{event_type}',  # Include event type for better tracking
                'event_id': f"webhook_{person.get('id')}_{int(datetime.datetime.utcnow().timestamp())}",
                'raw_payload': json.dumps(person),
                'campaign_id': custom_fields['campaign_id'],
                'who_pushed_lead': custom_fields['who_pushed_lead'],
                'parcel_county': custom_fields['parcel_county'],
                'parcel_state': custom_fields['parcel_state'],
                'lead_source_tag': lead_source_tag,
                # Enhanced fields (will be filled by add_time_tracking_data)
                'time_in_previous_stage_days': 0.0,
                'time_in_previous_stage_hours': 0,
                'time_in_previous_stage_minutes': 0,
                'previous_stage_entered_at': None,
                'stage_priority_from': None,
                'stage_priority_to': None,
                'is_forward_progression': None
            }
        except Exception as e:
            logger.error(f"Error creating stage change record: {e}")
            return None

    def add_time_tracking_data(self, stage_change_data):
        """Add time tracking data to stage change record"""
        try:
            person_id = stage_change_data['person_id']
            stage_from = stage_change_data['stage_from']

            if stage_from and stage_from != 'Unknown':
                # Get stage history for time calculations
                stage_history = self.get_person_stage_history(person_id)

                if stage_history:
                    # Find when they entered the previous stage
                    for entry in reversed(stage_history):
                        if entry['stage_to'] == stage_from:
                            days, hours, minutes = calculate_time_in_stage(
                                entry['changed_at'],
                                stage_change_data['changed_at']
                            )

                            stage_change_data.update({
                                'time_in_previous_stage_days': days,
                                'time_in_previous_stage_hours': hours,
                                'time_in_previous_stage_minutes': minutes,
                                'previous_stage_entered_at': entry['changed_at']
                            })

                            if days < 1 and hours < 1:
                                self.stats['rapid_transitions_captured'] += 1
                                logger.info(
                                    f"⚡ RAPID TRANSITION: {stage_change_data['first_name']} {stage_change_data['last_name']} spent {minutes} minutes in {stage_from}")
                            break

            # Add progression analysis
            stage_change_data.update({
                'stage_priority_from': get_stage_priority(stage_change_data['stage_from']),
                'stage_priority_to': get_stage_priority(stage_change_data['stage_to']),
                'is_forward_progression': get_stage_priority(stage_change_data['stage_to']) > get_stage_priority(
                    stage_change_data['stage_from'])
            })

        except Exception as e:
            logger.error(f"Error adding time tracking data: {e}")

    def get_person_stage_history(self, person_id):
        """Get person's stage history for time calculations"""
        try:
            conn = self.get_connection()
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                query = """
                    SELECT stage_from, stage_to, changed_at, source
                    FROM stage_changes 
                    WHERE person_id = %s 
                    ORDER BY changed_at ASC
                """
                cur.execute(query, (person_id,))
                return [dict(row) for row in cur.fetchall()]
        except Exception as e:
            logger.error(f"Error getting stage history: {e}")
            return []
        finally:
            if 'conn' in locals():
                conn.close()

    def save_stage_change_in_transaction(self, stage_change_data, cursor):
        """FIXED: Save stage change within an existing transaction to prevent race conditions"""
        try:
            # Ensure enhanced schema exists
            self.ensure_enhanced_schema(cursor)

            query = """
                INSERT INTO stage_changes (
                    person_id, deal_id, first_name, last_name,
                    stage_from, stage_to, changed_at, received_at, 
                    source, event_id, raw_payload,
                    campaign_id, who_pushed_lead, parcel_county, parcel_state, lead_source_tag,
                    time_in_previous_stage_days, time_in_previous_stage_hours, time_in_previous_stage_minutes,
                    previous_stage_entered_at, stage_priority_from, stage_priority_to, is_forward_progression
                ) VALUES (
                    %(person_id)s, %(deal_id)s, %(first_name)s, %(last_name)s,
                    %(stage_from)s, %(stage_to)s, %(changed_at)s, %(received_at)s,
                    %(source)s, %(event_id)s, %(raw_payload)s,
                    %(campaign_id)s, %(who_pushed_lead)s, %(parcel_county)s, 
                    %(parcel_state)s, %(lead_source_tag)s,
                    %(time_in_previous_stage_days)s, %(time_in_previous_stage_hours)s, %(time_in_previous_stage_minutes)s,
                    %(previous_stage_entered_at)s, %(stage_priority_from)s, %(stage_priority_to)s, %(is_forward_progression)s
                )
                ON CONFLICT (event_id) DO NOTHING
            """

            cursor.execute(query, stage_change_data)
            
            # Check if the record was actually inserted (not a duplicate)
            if cursor.rowcount > 0:
                logger.info(f"Stage change record inserted successfully")
                return True
            else:
                logger.warning(f"Stage change record already exists (duplicate event_id)")
                return True  # Still consider it success since the data is there
                
        except Exception as e:
            logger.error(f"Error saving stage change in transaction: {e}")
            return False

    def save_enhanced_stage_change(self, stage_change_data):
        """Save enhanced stage change with time tracking - FIXED version"""
        for attempt in range(MAX_RETRIES + 1):
            try:
                conn = self.get_connection()

                with conn.cursor() as cur:
                    # Ensure enhanced schema exists
                    self.ensure_enhanced_schema(cur)

                    query = """
                        INSERT INTO stage_changes (
                            person_id, deal_id, first_name, last_name,
                            stage_from, stage_to, changed_at, received_at, 
                            source, event_id, raw_payload,
                            campaign_id, who_pushed_lead, parcel_county, parcel_state, lead_source_tag,
                            time_in_previous_stage_days, time_in_previous_stage_hours, time_in_previous_stage_minutes,
                            previous_stage_entered_at, stage_priority_from, stage_priority_to, is_forward_progression
                        ) VALUES (
                            %(person_id)s, %(deal_id)s, %(first_name)s, %(last_name)s,
                            %(stage_from)s, %(stage_to)s, %(changed_at)s, %(received_at)s,
                            %(source)s, %(event_id)s, %(raw_payload)s,
                            %(campaign_id)s, %(who_pushed_lead)s, %(parcel_county)s, 
                            %(parcel_state)s, %(lead_source_tag)s,
                            %(time_in_previous_stage_days)s, %(time_in_previous_stage_hours)s, %(time_in_previous_stage_minutes)s,
                            %(previous_stage_entered_at)s, %(stage_priority_from)s, %(stage_priority_to)s, %(is_forward_progression)s
                        )
                        ON CONFLICT (event_id) DO NOTHING
                    """

                    cur.execute(query, stage_change_data)
                    conn.commit()
                    return True

            except psycopg2.OperationalError as e:
                if "SSL SYSCALL error" in str(e) or "connection" in str(e).lower():
                    if attempt < MAX_RETRIES:
                        wait_time = (attempt + 1) * 2
                        logger.warning(f"Database connection error, retrying in {wait_time}s: {e}")
                        time.sleep(wait_time)
                        continue
                    else:
                        logger.error(f"Failed to save after {MAX_RETRIES} retries: {e}")
                        return False
                else:
                    logger.error(f"Database error: {e}")
                    return False
            except Exception as e:
                logger.error(f"Unexpected error saving stage change: {e}")
                return False
            finally:
                if 'conn' in locals():
                    try:
                        conn.close()
                    except:
                        pass

        return False

    def ensure_enhanced_schema(self, cursor):
        """FIXED: Ensure enhanced columns exist with safer SQL"""
        enhanced_columns = [
            ('time_in_previous_stage_days', 'NUMERIC(10,2)'),
            ('time_in_previous_stage_hours', 'INTEGER'),
            ('time_in_previous_stage_minutes', 'INTEGER'),
            ('previous_stage_entered_at', 'TIMESTAMP'),
            ('stage_priority_from', 'INTEGER'),
            ('stage_priority_to', 'INTEGER'),
            ('is_forward_progression', 'BOOLEAN')
        ]

        for column_name, column_type in enhanced_columns:
            try:
                cursor.execute(f"""
                    DO $$ 
                    BEGIN 
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name='stage_changes' AND column_name='{column_name}'
                        ) THEN
                            ALTER TABLE stage_changes ADD COLUMN {column_name} {column_type};
                        END IF;
                    END $$;
                """)
            except Exception as e:
                logger.warning(f"Could not add column {column_name}: {e}")

        # Create indexes for better performance
        try:
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_stage_changes_time_tracking 
                ON stage_changes(person_id, changed_at, time_in_previous_stage_days)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_stage_changes_webhook_source 
                ON stage_changes(source, changed_at) WHERE source LIKE 'webhook_%'
            """)
        except Exception as e:
            logger.warning(f"Could not create indexes: {e}")

    def get_connection(self):
        """Get database connection with better error handling"""
        if not SUPABASE_DB_URL:
            raise Exception("SUPABASE_DB_URL not configured")
        return psycopg2.connect(SUPABASE_DB_URL, sslmode='require')

    def get_health_status(self):
        """Enhanced health status with more metrics"""
        uptime = datetime.datetime.utcnow() - self.stats['system_start_time']
        uptime_hours = uptime.total_seconds() / 3600

        webhook_rate = self.stats['webhooks_received'] / max(uptime_hours, 0.001)
        success_rate = (self.stats['webhooks_processed'] /
                        max(self.stats['webhooks_received'], 1) * 100) if self.stats['webhooks_received'] > 0 else 100

        is_healthy = True
        health_issues = []

        last_webhook = self.stats['last_webhook_time']
        if last_webhook:
            webhook_silence = (datetime.datetime.utcnow() - last_webhook).total_seconds()
            if webhook_silence > 3600:  # No webhooks for 1 hour
                is_healthy = False
                health_issues.append(f"No webhooks for {webhook_silence // 60:.0f} minutes")

        if success_rate < 95:
            is_healthy = False
            health_issues.append(f"Low success rate: {success_rate:.1f}%")

        if len(self.webhook_queue) > WEBHOOK_QUEUE_SIZE * 0.8:
            is_healthy = False
            health_issues.append(f"High queue size: {len(self.webhook_queue)}")

        return {
            'healthy': is_healthy,
            'uptime_hours': round(uptime_hours, 1),
            'webhook_rate_per_hour': round(webhook_rate, 1),
            'success_rate': round(success_rate, 1),
            'queue_size': len(self.webhook_queue),
            'health_issues': health_issues,
            **self.stats
        }


# Global processor instance
processor = WebhookProcessor()

# Flask app
app = Flask(__name__)


# FIXED: Webhook handler with proper event filtering and signature verification
@app.route('/webhook/fub/stage-change', methods=['POST'])
def fub_webhook_handler():
    """FIXED: Main webhook handler with proper filtering and verification"""
    try:
        raw_payload = request.get_data()

        # Verify FUB signature
        fub_signature = request.headers.get('FUB-Signature')
        if not verify_fub_signature(raw_payload, fub_signature):
            logger.error("Invalid FUB signature")
            return jsonify({'error': 'Invalid signature'}), 401

        webhook_data = request.get_json()
        if not webhook_data:
            return jsonify({'error': 'No JSON data'}), 400

        event_type = webhook_data.get('event', 'unknown')
        resource_ids = webhook_data.get('resourceIds', [])

        logger.info(f"Received FUB webhook: {event_type} for {len(resource_ids)} people")

        # Add to processing queue (will be filtered inside)
        queued = processor.add_webhook_to_queue(webhook_data)

        # IMPORTANT: Return success immediately (FUB requires response within 10 seconds)
        return jsonify({
            'status': 'received',
            'timestamp': datetime.datetime.utcnow().isoformat(),
            'event': event_type,
            'resource_count': len(resource_ids),
            'queued': queued
        }), 200

    except Exception as e:
        logger.error(f"Webhook handler error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    """Enhanced health check"""
    health_status = processor.get_health_status()
    status_code = 200 if health_status['healthy'] else 503

    return jsonify({
        'status': 'healthy' if health_status['healthy'] else 'unhealthy',
        'message': 'Real-time stage tracking active' if health_status['healthy'] else 'Health issues detected',
        'webhook_url': f"{WEBHOOK_BASE_URL}/webhook/fub/stage-change" if WEBHOOK_BASE_URL else "WEBHOOK_BASE_URL not configured",
        **health_status
    }), status_code



@app.route('/register', methods=['POST'])
def register_webhooks():
    """Register webhooks with FollowUpBoss"""
    try:
        success = register_fub_webhooks()
        if success:
            return jsonify({
                'status': 'success',
                'message': 'Webhooks registered successfully',
                'events_registered': RELEVANT_WEBHOOK_EVENTS,
                'webhook_url': f"{WEBHOOK_BASE_URL.rstrip('/')}/webhook/fub/stage-change"
            }), 200
        else:
            return jsonify({
                'status': 'error',
                'message': 'Failed to register some or all webhooks. Check server logs for details.',
                'events_attempted': RELEVANT_WEBHOOK_EVENTS
            }), 500
    except Exception as e:
        logger.error(f"Webhook registration endpoint error: {e}")
        return jsonify({
            'status': 'error',
            'message': f'Registration failed: {str(e)}'
        }), 500


@app.route('/stats', methods=['GET'])
def system_stats():
    """System statistics"""
    return jsonify({
        'system_type': 'FUB Webhook Server',
        'version': '2.0-fixed',
        'health': processor.get_health_status(),
        'configuration': {
            'webhook_base_url': WEBHOOK_BASE_URL,
            'fub_api_configured': bool(FUB_API_KEY),
            'fub_system_key_configured': bool(FUB_SYSTEM_KEY),
            'database_configured': bool(SUPABASE_DB_URL),
            'relevant_events': RELEVANT_WEBHOOK_EVENTS
        },
        'capabilities': {
            'real_time_webhooks': True,
            'time_in_stage_tracking': True,
            'rapid_transition_capture': True,
            'enhanced_analytics': True
        }
    })


if __name__ == '__main__':
    """Development server - Railway will use gunicorn in production"""
    app.run(host='0.0.0.0', port=WEBHOOK_PORT, debug=False)
