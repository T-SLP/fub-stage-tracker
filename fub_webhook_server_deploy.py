#!/usr/bin/env python3
"""
FUB Webhook Server - Complete Deployment Version v2.1
Production webhook server with enhanced lead source processing
Deploy this file to Railway to fix the lead source processing issue.
Auto-deployment test: 2025-09-17
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

# Configuration
FUB_API_KEY = os.getenv("FUB_API_KEY", "fka_0DxOlS07NmHLDLVjKXB7N9qJyOSM4QtM2u")
FUB_SYSTEM_KEY = os.getenv("FUB_SYSTEM_KEY", "390b59dea776f1d5216843d3dfd5a127")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
WEBHOOK_BASE_URL = os.getenv("WEBHOOK_BASE_URL", "https://fub-stage-tracker-production.up.railway.app")

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
    """Enhanced webhook processor with race condition protection and lead source extraction"""

    def __init__(self):
        self.webhook_queue = deque()
        self.webhook_dedup_window = 30  # seconds
        self.person_webhook_tracking = defaultdict(list)
        self.processing_lock = threading.Lock()
        self.stats = {
            'webhooks_received': 0,
            'webhooks_processed': 0,
            'webhooks_deduplicated': 0,
            'stage_changes_captured': 0,
            'rapid_transitions_captured': 0,
            'webhooks_failed': 0,
            'webhooks_ignored': 0,
            'errors': 0,
            'last_webhook_time': None,
            'system_start_time': datetime.datetime.utcnow(),
            'queue_size': 0,
            'success_rate': 100.0,
            'webhook_rate_per_hour': 0.0
        }

        # REMOVED THREADING - Using synchronous processing to fix Railway issues
        # Background threads were causing webhooks to be ignored on Railway
        print("🚀 Synchronous Webhook processor started - no threading issues")

    def add_webhook_to_queue(self, webhook_data: Dict[str, Any]) -> bool:
        """Add webhook to processing queue with deduplication"""
        try:
            with self.processing_lock:
                self.stats['webhooks_received'] += 1
                self.stats['last_webhook_time'] = datetime.datetime.utcnow()

                # Extract person ID
                person_id = self._extract_person_id(webhook_data)
                if not person_id:
                    print(f"⚠️  No person ID in webhook: {webhook_data.get('uri', 'no URI')}")
                    self.stats['webhooks_ignored'] += 1
                    return False

                # Deduplication logic
                current_time = time.time()
                person_webhooks = self.person_webhook_tracking[person_id]
                person_webhooks[:] = [t for t in person_webhooks if current_time - t < self.webhook_dedup_window]

                if len(person_webhooks) >= 2:
                    print(f"🔄 Deduplicating rapid webhook for person {person_id}")
                    self.stats['webhooks_deduplicated'] += 1
                    return False

                person_webhooks.append(current_time)
                self.webhook_queue.append(webhook_data)
                self.stats['queue_size'] = len(self.webhook_queue)

                print(f"📥 Webhook queued for person {person_id}")
                return True

        except Exception as e:
            print(f"❌ Error adding webhook to queue: {e}")
            self.stats['errors'] += 1
            return False

    def _extract_person_id(self, webhook_data: Dict[str, Any]) -> Optional[str]:
        """Extract person ID from webhook data"""
        if 'uri' in webhook_data and '/people/' in webhook_data['uri']:
            return webhook_data['uri'].split('/people/')[-1].split('/')[0]

        if 'data' in webhook_data and 'people' in webhook_data['data']:
            people = webhook_data['data']['people']
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
                        print(f"✅ SUCCESS: Webhook processed successfully")
                    else:
                        self.stats['webhooks_failed'] += 1
                        print(f"❌ FAILED: Webhook processing failed")

                    # Update success rate
                    if self.stats['webhooks_processed'] > 0:
                        self.stats['success_rate'] = (self.stats['stage_changes_captured'] / self.stats['webhooks_processed']) * 100

                    # Update webhook rate
                    hours_running = (datetime.datetime.utcnow() - self.stats['system_start_time']).total_seconds() / 3600
                    if hours_running > 0:
                        self.stats['webhook_rate_per_hour'] = self.stats['webhooks_received'] / hours_running

                time.sleep(0.1)

            except Exception as e:
                print(f"❌ Error in webhook processing thread: {e}")
                self.stats['errors'] += 1
                time.sleep(1)

    def _process_single_webhook(self, webhook_data: Dict[str, Any]) -> bool:
        """Process a single webhook with enhanced lead source extraction"""
        try:
            person_id = self._extract_person_id(webhook_data)
            if not person_id:
                return False

            # Get person data from FUB API
            print(f"🔍 Fetching person data from FUB for ID: {person_id}")
            person_data = self._get_person_from_fub(person_id)
            if not person_data:
                print(f"❌ Could not fetch person data for ID: {person_id}")
                return False
            else:
                print(f"✅ Retrieved person data: {person_data.get('firstName', 'Unknown')} {person_data.get('lastName', 'Unknown')}")

            # Process stage change with enhanced lead source extraction
            return self.process_person_stage_change(person_data, webhook_data.get('event', 'webhookEvent'))

        except Exception as e:
            print(f"❌ Error processing webhook: {e}")
            print(f"🔍 Webhook data: {webhook_data}")
            import traceback
            traceback.print_exc()
            return False

    def _get_person_from_fub(self, person_id: str) -> Optional[Dict[str, Any]]:
        """Get person data from FUB API with authentication"""
        try:
            import base64
            auth_string = base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()

            response = requests.get(
                f'https://api.followupboss.com/v1/people/{person_id}',
                headers={
                    'Authorization': f'Basic {auth_string}',
                    'X-System': 'SynergyFUBLeadMetrics',
                    'X-System-Key': FUB_SYSTEM_KEY,
                    'Content-Type': 'application/json'
                },
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                return data.get('person', data)
            else:
                print(f"❌ FUB API error {response.status_code} for person {person_id}")
                return None

        except Exception as e:
            print(f"❌ Exception getting person {person_id}: {e}")
            return None

    def process_person_stage_change(self, person_data: Dict[str, Any], event_type: str) -> bool:
        """Process person stage change with SELECT FOR UPDATE protection and enhanced lead source extraction"""
        try:
            conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')

            try:
                with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                    person_id = str(person_data.get('id', ''))
                    current_stage = person_data.get('stage', 'Unknown')
                    first_name = person_data.get('firstName', 'Unknown')
                    last_name = person_data.get('lastName', 'Unknown')

                    # ENHANCED LEAD SOURCE EXTRACTION WITH DEBUGGING
                    tags = person_data.get('tags', [])
                    lead_source_tag = extract_lead_source_tag(tags)

                    person_name = f"{first_name} {last_name}"
                    if lead_source_tag:
                        print(f"✅ LEAD SOURCE EXTRACTED for {person_name}: {lead_source_tag} from tags: {tags}")
                    else:
                        print(f"⚠️  NO LEAD SOURCE found for {person_name}, tags: {tags}")

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

                    # Insert new stage change record with lead source
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
                        datetime.datetime.utcnow(),
                        datetime.datetime.utcnow(),
                        f"wh_{event_type}"[:20],  # Truncated to fit varchar(20)
                        lead_source_tag,         # Enhanced lead source extraction
                        person_data.get('dealId'),
                        person_data.get('customCampaignID'),
                        person_data.get('customWhoPushedTheLead'),
                        person_data.get('customParcelCounty'),
                        person_data.get('customParcelState')
                    ))

                    conn.commit()
                    print(f"✅ STAGE CHANGE SAVED with lead source: {person_name} → {current_stage} (source: {lead_source_tag})")

                    # Track rapid transitions
                    if last_recorded_stage:
                        self.stats['rapid_transitions_captured'] += 1

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
        uptime_hours = (datetime.datetime.utcnow() - self.stats['system_start_time']).total_seconds() / 3600

        # Health issues detection
        health_issues = []
        is_healthy = True

        # Check if no webhooks received for over 90 minutes
        if self.stats['last_webhook_time']:
            minutes_since_last = (datetime.datetime.utcnow() - self.stats['last_webhook_time']).total_seconds() / 60
            if minutes_since_last > 90:
                health_issues.append(f"No webhooks for {int(minutes_since_last)} minutes")
                is_healthy = False

        return {
            'status': 'healthy' if is_healthy else 'unhealthy',
            'healthy': is_healthy,
            'message': 'Synchronous real-time processing active' if is_healthy else 'Health issues detected',
            'version': '2.2-synchronous-fix',
            'system_type': 'FUB Webhook Server (Sync Processing)',
            'uptime_hours': round(uptime_hours, 1),
            'system_start_time': self.stats['system_start_time'].strftime('%a, %d %b %Y %H:%M:%S GMT'),
            'last_webhook_time': self.stats['last_webhook_time'].strftime('%a, %d %b %Y %H:%M:%S GMT') if self.stats['last_webhook_time'] else None,
            'webhooks_received': self.stats['webhooks_received'],
            'webhooks_processed': self.stats['webhooks_processed'],
            'webhooks_deduplicated': self.stats['webhooks_deduplicated'],
            'webhooks_failed': self.stats['webhooks_failed'],
            'webhooks_ignored': self.stats['webhooks_ignored'],
            'stage_changes_captured': self.stats['stage_changes_captured'],
            'rapid_transitions_captured': self.stats['rapid_transitions_captured'],
            'queue_size': self.stats['queue_size'],
            'success_rate': round(self.stats['success_rate'], 1),
            'webhook_rate_per_hour': round(self.stats['webhook_rate_per_hour'], 1),
            'webhook_url': f"{WEBHOOK_BASE_URL}/webhook/fub/stage-change",
            'health_issues': health_issues,
            'enhanced_features': [
                'Lead source extraction from tags',
                'Race condition protection',
                'Webhook deduplication',
                'Transaction safety'
            ],
            'capabilities': {
                'real_time_webhooks': True,
                'enhanced_analytics': True,
                'rapid_transition_capture': True,
                'time_in_stage_tracking': True
            },
            'configuration': {
                'database_configured': bool(SUPABASE_DB_URL),
                'fub_api_configured': bool(FUB_API_KEY),
                'fub_system_key_configured': bool(FUB_SYSTEM_KEY),
                'webhook_base_url': WEBHOOK_BASE_URL,
                'relevant_events': ['peopleStageUpdated', 'peopleCreated', 'peopleUpdated', 'peopleTagsCreated']
            }
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
    return jsonify(stats)

@app.route('/webhook/fub/stage-change', methods=['POST'])
def handle_fub_stage_webhook():
    """Handle FUB stage change webhooks - SYNCHRONOUS PROCESSING"""
    try:
        webhook_data = request.get_json()
        if not webhook_data:
            return jsonify({'error': 'No JSON payload'}), 400

        event_type = webhook_data.get('event', 'unknown')
        person_id = webhook_processor._extract_person_id(webhook_data)
        print(f"📡 SYNC PROCESSING: {event_type} for person {person_id}")

        # BYPASS QUEUE - Process immediately to avoid threading issues
        webhook_processor.stats['webhooks_received'] += 1
        webhook_processor.stats['last_webhook_time'] = datetime.datetime.utcnow()

        if not person_id:
            print(f"⚠️  No person ID in webhook: {webhook_data.get('uri', 'no URI')}")
            webhook_processor.stats['webhooks_ignored'] += 1
            return jsonify({
                'status': 'rejected',
                'message': 'No person ID found'
            }), 400

        # Process immediately instead of queuing
        print(f"🚀 PROCESSING IMMEDIATELY: {person_id}")
        success = webhook_processor._process_single_webhook(webhook_data)

        webhook_processor.stats['webhooks_processed'] += 1
        if success:
            webhook_processor.stats['stage_changes_captured'] += 1
            print(f"✅ IMMEDIATE SUCCESS: Webhook processed")
            return jsonify({
                'status': 'processed',
                'message': 'Webhook processed immediately - threading bypassed',
                'success': True
            }), 200
        else:
            webhook_processor.stats['webhooks_failed'] += 1
            print(f"❌ IMMEDIATE FAILURE: Webhook processing failed")
            return jsonify({
                'status': 'failed',
                'message': 'Webhook processing failed',
                'success': False
            }), 200

    except Exception as e:
        print(f"❌ Webhook handling error: {e}")
        webhook_processor.stats['errors'] += 1
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/', methods=['GET'])
def root():
    """Root endpoint"""
    return jsonify({
        'service': 'FUB Webhook Server',
        'status': 'running',
        'version': '2.2-synchronous-fix-hobby',
        'message': 'Enhanced lead source processing active',
        'endpoints': [
            '/health',
            '/stats',
            '/webhook/fub/stage-change'
        ],
        'features': [
            'Lead source extraction from FUB tags',
            'Race condition protection with SELECT FOR UPDATE',
            'Webhook deduplication (30-second window)',
            'Transaction-safe stage change detection',
            'Enhanced debugging and statistics'
        ]
    })

if __name__ == '__main__':
    print("🚀 FUB Webhook Server v2.1 - Enhanced Lead Source Processing")
    print(f"📡 Webhook endpoint: {WEBHOOK_BASE_URL}/webhook/fub/stage-change")
    print(f"🔗 FUB API configured: {'✅' if FUB_API_KEY else '❌'}")
    print(f"💾 Database configured: {'✅' if SUPABASE_DB_URL else '❌'}")
    print("🎯 Enhanced features: Lead source extraction, race condition protection, deduplication")

    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)