#!/usr/bin/env python3
"""
FUB Webhook Server - Production Webhook Processing
Handles real-time stage change webhooks from FollowUpBoss with race condition protection
"""

import os
import json
import time
import datetime
import threading
import hashlib
import hmac
from typing import Dict, Optional, List, Any
from collections import defaultdict, deque
from flask import Flask, request, jsonify
import psycopg2
import psycopg2.extras
import requests
from shared.fub_api import FUBApiClient

# Configuration
FUB_API_KEY = os.getenv("FUB_API_KEY", "fka_0DxOlS07NmHLDLVjKXB7N9qJyOSM4QtM2u")
FUB_SYSTEM_KEY = os.getenv("FUB_SYSTEM_KEY", "390b59dea776f1d5216843d3dfd5a127")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "postgresql://postgres.jefrfayzrxfcjeviwfhw:UnVen%25SUBJd%26%237%40@aws-0-us-east-2.pooler.supabase.com:5432/postgres")
WEBHOOK_BASE_URL = os.getenv("WEBHOOK_BASE_URL", "https://web-production-cd698.up.railway.app")

app = Flask(__name__)

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

class WebhookProcessor:
    """Enhanced webhook processor with race condition protection and deduplication"""

    def __init__(self):
        self.webhook_queue = deque()
        self.webhook_dedup_window = 30  # seconds
        self.person_webhook_tracking = defaultdict(list)  # Track recent webhooks per person
        self.processing_lock = threading.Lock()
        self.stats = {
            'webhooks_received': 0,
            'webhooks_processed': 0,
            'webhooks_deduplicated': 0,
            'stage_changes_captured': 0,
            'errors': 0,
            'last_webhook_time': None,
            'uptime_start': datetime.datetime.utcnow(),
            'queue_size': 0,
            'success_rate': 0.0
        }
        self.fub_client = FUBApiClient(FUB_API_KEY, FUB_SYSTEM_KEY)

        # Start background processing
        self.processing_thread = threading.Thread(target=self._process_webhook_queue, daemon=True)
        self.processing_thread.start()

        # Start cleanup thread
        self.cleanup_thread = threading.Thread(target=self._cleanup_tracking_data, daemon=True)
        self.cleanup_thread.start()

        print("🚀 Webhook processor started with race condition protection")

    def add_webhook_to_queue(self, webhook_data: Dict[str, Any]) -> bool:
        """Add webhook to processing queue with deduplication"""
        try:
            with self.processing_lock:
                self.stats['webhooks_received'] += 1
                self.stats['last_webhook_time'] = datetime.datetime.utcnow()

                # Extract person ID from webhook
                person_id = self._extract_person_id(webhook_data)
                if not person_id:
                    print(f"⚠️  No person ID found in webhook: {webhook_data}")
                    return False

                # Check for rapid webhooks (deduplication)
                current_time = time.time()
                person_webhooks = self.person_webhook_tracking[person_id]

                # Clean old webhooks outside dedup window
                person_webhooks[:] = [t for t in person_webhooks if current_time - t < self.webhook_dedup_window]

                # If more than 2 webhooks in the dedup window, this might be spam
                if len(person_webhooks) >= 2:
                    print(f"🔄 Deduplicating rapid webhook for person {person_id} (recent: {len(person_webhooks)})")
                    self.stats['webhooks_deduplicated'] += 1
                    return False

                # Add to tracking and queue
                person_webhooks.append(current_time)
                self.webhook_queue.append(webhook_data)
                self.stats['queue_size'] = len(self.webhook_queue)

                print(f"📥 Webhook queued for person {person_id} (queue size: {self.stats['queue_size']})")
                return True

        except Exception as e:
            print(f"❌ Error adding webhook to queue: {e}")
            self.stats['errors'] += 1
            return False

    def _extract_person_id(self, webhook_data: Dict[str, Any]) -> Optional[str]:
        """Extract person ID from webhook data"""
        # Try different locations where person ID might be
        if 'uri' in webhook_data:
            # Extract from URI like "/v1/people/12345"
            uri = webhook_data['uri']
            if '/people/' in uri:
                person_id = uri.split('/people/')[-1].split('/')[0]
                return person_id

        # Try from data payload
        if 'data' in webhook_data:
            data = webhook_data['data']
            if isinstance(data, dict) and 'people' in data:
                people = data['people']
                if isinstance(people, list) and len(people) > 0:
                    person = people[0]
                    if isinstance(person, dict) and 'id' in person:
                        return str(person['id'])

        return None

    def _process_webhook_queue(self):
        """Background thread to process webhook queue"""
        while True:
            try:
                if self.webhook_queue:
                    webhook_data = self.webhook_queue.popleft()
                    self.stats['queue_size'] = len(self.webhook_queue)

                    success = self._process_single_webhook(webhook_data)

                    self.stats['webhooks_processed'] += 1
                    if success:
                        self.stats['stage_changes_captured'] += 1

                    # Update success rate
                    if self.stats['webhooks_processed'] > 0:
                        self.stats['success_rate'] = (self.stats['stage_changes_captured'] / self.stats['webhooks_processed']) * 100

                time.sleep(0.1)  # Small delay to prevent busy waiting

            except Exception as e:
                print(f"❌ Error in webhook processing thread: {e}")
                self.stats['errors'] += 1
                time.sleep(1)

    def _process_single_webhook(self, webhook_data: Dict[str, Any]) -> bool:
        """Process a single webhook with transaction safety"""
        try:
            # Extract person ID
            person_id = self._extract_person_id(webhook_data)
            if not person_id:
                print(f"❌ Cannot process webhook without person ID")
                return False

            # Get person data from FUB API
            person_data = self.fub_client.get_person(person_id)
            if not person_data:
                print(f"❌ Could not fetch person data for ID: {person_id}")
                return False

            # Extract person info from the response
            if 'person' in person_data:
                person_info = person_data['person']
            else:
                person_info = person_data

            # Process stage change with transaction safety
            return self.process_person_stage_change(person_info, webhook_data.get('event', 'webhookEvent'))

        except Exception as e:
            print(f"❌ Error processing webhook: {e}")
            return False

    def process_person_stage_change(self, person_data: Dict[str, Any], event_type: str) -> bool:
        """Process person stage change with SELECT FOR UPDATE protection"""
        try:
            # Database connection with transaction
            conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')

            try:
                with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                    person_id = str(person_data.get('id', ''))
                    current_stage = person_data.get('stage', 'Unknown')
                    first_name = person_data.get('firstName', 'Unknown')
                    last_name = person_data.get('lastName', 'Unknown')

                    # Enhanced lead source extraction with debugging
                    tags = person_data.get('tags', [])
                    lead_source_tag = extract_lead_source_tag(tags)

                    # Debug logging for lead source extraction
                    person_name = f"{first_name} {last_name}"
                    if lead_source_tag:
                        print(f"✅ Lead source extracted for {person_name}: {lead_source_tag} from tags: {tags}")
                    else:
                        print(f"⚠️  No lead source found for {person_name}, tags: {tags}")

                    # SELECT FOR UPDATE to lock person record during stage check
                    cur.execute("""
                        SELECT stage_to, changed_at
                        FROM stage_changes
                        WHERE person_id = %s
                        ORDER BY changed_at DESC
                        LIMIT 1
                        FOR UPDATE
                    """, (person_id,))

                    result = cur.fetchone()
                    last_recorded_stage = result['stage_to'] if result else None

                    # Check if this is actually a stage change
                    if last_recorded_stage == current_stage:
                        print(f"🔄 No stage change for {person_name}: already in {current_stage}")
                        conn.rollback()
                        return False

                    print(f"🎯 STAGE CHANGE DETECTED for {person_name}: {last_recorded_stage or 'NEW'} → {current_stage}")

                    # Insert new stage change record
                    cur.execute("""
                        INSERT INTO stage_changes (
                            person_id, first_name, last_name, stage_from, stage_to,
                            changed_at, received_at, source, lead_source_tag,
                            deal_id, campaign_id, who_pushed_lead, parcel_county, parcel_state
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        person_id,
                        first_name,
                        last_name,
                        last_recorded_stage,
                        current_stage,
                        datetime.datetime.utcnow(),  # changed_at
                        datetime.datetime.utcnow(),  # received_at
                        f"webhook_{event_type}",      # source
                        lead_source_tag,             # lead_source_tag
                        person_data.get('dealId'),
                        person_data.get('customCampaignID'),
                        person_data.get('customWhoPushedTheLead'),
                        person_data.get('customParcelCounty'),
                        person_data.get('customParcelState')
                    ))

                    # Commit transaction
                    conn.commit()
                    print(f"✅ Stage change saved: {person_name} → {current_stage}")
                    return True

            except Exception as e:
                conn.rollback()
                print(f"❌ Database transaction failed for {person_data.get('firstName', 'Unknown')}: {e}")
                return False
            finally:
                conn.close()

        except Exception as e:
            print(f"❌ Error processing stage change: {e}")
            return False

    def _cleanup_tracking_data(self):
        """Periodically clean up old tracking data"""
        while True:
            try:
                time.sleep(300)  # Clean up every 5 minutes
                current_time = time.time()

                with self.processing_lock:
                    # Clean up old webhook tracking data
                    for person_id in list(self.person_webhook_tracking.keys()):
                        person_webhooks = self.person_webhook_tracking[person_id]
                        person_webhooks[:] = [t for t in person_webhooks if current_time - t < self.webhook_dedup_window * 2]

                        if not person_webhooks:
                            del self.person_webhook_tracking[person_id]

                    print(f"🧹 Cleanup: tracking {len(self.person_webhook_tracking)} people")

            except Exception as e:
                print(f"❌ Cleanup error: {e}")

    def get_health_stats(self) -> Dict[str, Any]:
        """Get current health and statistics"""
        uptime_hours = (datetime.datetime.utcnow() - self.stats['uptime_start']).total_seconds() / 3600

        return {
            'status': 'healthy',
            'healthy': True,
            'uptime_hours': round(uptime_hours, 2),
            'webhooks_received': self.stats['webhooks_received'],
            'webhooks_processed': self.stats['webhooks_processed'],
            'webhooks_deduplicated': self.stats['webhooks_deduplicated'],
            'stage_changes_captured': self.stats['stage_changes_captured'],
            'queue_size': self.stats['queue_size'],
            'success_rate': round(self.stats['success_rate'], 1),
            'errors': self.stats['errors'],
            'last_webhook_time': self.stats['last_webhook_time'].isoformat() if self.stats['last_webhook_time'] else None,
            'dedup_window_seconds': self.webhook_dedup_window,
            'tracked_people': len(self.person_webhook_tracking)
        }

# Global webhook processor instance
webhook_processor = WebhookProcessor()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify(webhook_processor.get_health_stats())

@app.route('/stats', methods=['GET'])
def get_stats():
    """Detailed statistics endpoint"""
    stats = webhook_processor.get_health_stats()
    return jsonify({
        'health': stats,
        'timestamp': datetime.datetime.utcnow().isoformat()
    })

@app.route('/webhook/fub/stage-change', methods=['POST'])
def handle_fub_stage_webhook():
    """Handle FUB stage change webhooks"""
    try:
        # Get webhook data
        webhook_data = request.get_json()
        if not webhook_data:
            return jsonify({'error': 'No JSON payload'}), 400

        # Log incoming webhook
        event_type = webhook_data.get('event', 'unknown')
        person_id = webhook_processor._extract_person_id(webhook_data)
        print(f"📡 Incoming webhook: {event_type} for person {person_id}")

        # Add to processing queue
        success = webhook_processor.add_webhook_to_queue(webhook_data)

        if success:
            return jsonify({
                'status': 'accepted',
                'message': 'Webhook queued for processing',
                'queue_size': len(webhook_processor.webhook_queue)
            }), 200
        else:
            return jsonify({
                'status': 'rejected',
                'message': 'Webhook rejected (duplicate or invalid)'
            }), 200

    except Exception as e:
        print(f"❌ Webhook handling error: {e}")
        webhook_processor.stats['errors'] += 1
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/list-webhooks', methods=['GET'])
def list_webhooks():
    """List registered webhooks from FUB"""
    try:
        webhooks = webhook_processor.fub_client.list_webhooks()
        return jsonify({
            'webhooks': webhooks,
            'count': len(webhooks)
        })
    except Exception as e:
        print(f"❌ Error listing webhooks: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/register-webhook', methods=['POST'])
def register_webhook():
    """Register a new webhook with FUB"""
    try:
        data = request.get_json()
        event = data.get('event', 'peopleStageUpdated')
        url = f"{WEBHOOK_BASE_URL}/webhook/fub/stage-change"

        result = webhook_processor.fub_client.register_webhook(event, url)
        if result:
            return jsonify(result), 201
        else:
            return jsonify({'error': 'Failed to register webhook'}), 500

    except Exception as e:
        print(f"❌ Error registering webhook: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def root():
    """Root endpoint"""
    return jsonify({
        'service': 'FUB Webhook Server',
        'status': 'running',
        'version': '2.0',
        'endpoints': [
            '/health',
            '/stats',
            '/webhook/fub/stage-change',
            '/list-webhooks',
            '/register-webhook'
        ]
    })

if __name__ == '__main__':
    print("🚀 Starting FUB Webhook Server v2.0")
    print(f"📡 Webhook endpoint: {WEBHOOK_BASE_URL}/webhook/fub/stage-change")
    print(f"🔗 FUB API configured: {'✅' if FUB_API_KEY else '❌'}")
    print(f"💾 Database configured: {'✅' if SUPABASE_DB_URL else '❌'}")

    # Get port from environment (Railway uses PORT)
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)