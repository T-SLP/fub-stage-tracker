#!/usr/bin/env python3
"""
Export lead-level call activity data for statistical analysis.

This script exports call metrics for leads that received verbal offers,
to analyze which calling behaviors predict signed contracts.
"""

import os
import sys
import base64
import csv
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path

# Load .env file from project root (for local development)
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / '.env'
    load_dotenv(env_path)
except ImportError:
    pass

import psycopg2
import psycopg2.extras
import requests

# Configuration
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
FUB_API_KEY = os.getenv("FUB_API_KEY")

EASTERN_TZ = ZoneInfo("America/New_York")

# Connection threshold in seconds
CONNECTION_THRESHOLD = 120

# Stage name for verbal offers
STAGE_OFFERS_MADE = "ACQ - Offers Made"


def fetch_calls_for_period(auth_string, start_str, end_str):
    """Fetch all calls for a specific date range with pagination."""
    all_calls = []
    offset = 0
    limit = 100

    while True:
        try:
            response = requests.get(
                'https://api.followupboss.com/v1/calls',
                params={
                    'createdAfter': start_str,
                    'createdBefore': end_str,
                    'limit': limit,
                    'offset': offset
                },
                headers={
                    'Authorization': f'Basic {auth_string}',
                    'Content-Type': 'application/json'
                },
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                calls = data.get('calls', [])
                all_calls.extend(calls)

                if len(calls) < limit:
                    break
                offset += limit
            else:
                break
        except Exception as e:
            print(f"    WARNING: Error fetching calls: {e}")
            break

    return all_calls


def fetch_all_calls(start_date, end_date):
    """Fetch all calls from FUB API by breaking into weekly chunks."""
    if not FUB_API_KEY:
        print("ERROR: FUB_API_KEY not set")
        return []

    auth_string = base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()

    print(f"Fetching calls from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}...")
    print("  (fetching in weekly chunks to avoid API limits)")

    all_calls = []
    current_start = start_date

    while current_start < end_date:
        current_end = min(current_start + timedelta(days=7), end_date)

        start_str = current_start.strftime('%Y-%m-%d')
        end_str = current_end.strftime('%Y-%m-%d')

        calls = fetch_calls_for_period(auth_string, start_str, end_str)
        all_calls.extend(calls)

        print(f"    {start_str} to {end_str}: {len(calls)} calls")

        current_start = current_end

    print(f"  Total calls fetched: {len(all_calls)}")
    return all_calls


def get_leads_with_offers(cursor, start_date, end_date):
    """Get all leads that received verbal offers in the date range."""
    cursor.execute("""
        SELECT DISTINCT ON (person_id)
            person_id,
            changed_at as offer_date,
            COALESCE(
                assigned_user_name,
                raw_payload->>'assignedTo',
                CASE WHEN changed_at < '2025-12-19' THEN 'Madeleine Penales' ELSE 'Unassigned' END
            ) as agent
        FROM stage_changes
        WHERE stage_to = %s
          AND changed_at >= %s
          AND changed_at < %s
        ORDER BY person_id, changed_at
    """, (STAGE_OFFERS_MADE, start_date, end_date))

    leads = {}
    for row in cursor.fetchall():
        person_id = str(row['person_id'])
        leads[person_id] = {
            'person_id': person_id,
            'offer_date': row['offer_date'],
            'agent': row['agent'],
        }

    return leads


def build_calls_by_lead(all_calls, target_person_ids):
    """
    Organize calls by person_id for the target leads.
    Returns dict: person_id -> list of call records
    """
    calls_by_lead = {pid: [] for pid in target_person_ids}

    for call in all_calls:
        person_id = call.get('personId')
        if not person_id:
            continue

        person_id_str = str(person_id)
        if person_id_str not in target_person_ids:
            continue

        # Only include outbound calls
        if call.get('isIncoming') == True:
            continue

        # Parse call timestamp
        created = call.get('created')
        if not created:
            continue

        try:
            call_time = datetime.fromisoformat(created.replace('Z', '+00:00'))
        except:
            continue

        duration = call.get('duration', 0) or 0

        calls_by_lead[person_id_str].append({
            'call_datetime': call_time,
            'call_date': call_time.date(),
            'call_time': call_time.strftime('%H:%M:%S'),
            'duration': duration,
            'is_connection': duration >= CONNECTION_THRESHOLD,
            'user_name': call.get('userName', ''),
            'to_number': call.get('toNumber', ''),
        })

    # Sort calls by datetime for each lead
    for person_id in calls_by_lead:
        calls_by_lead[person_id].sort(key=lambda x: x['call_datetime'])

    return calls_by_lead


def calculate_aggregated_metrics(person_id, calls, offer_date):
    """Calculate aggregated call metrics for a single lead."""
    if not calls:
        return {
            'person_id': person_id,
            'total_calls': 0,
            'total_connections': 0,
            'total_talk_time_seconds': 0,
            'longest_call_seconds': 0,
            'avg_call_duration_seconds': 0,
            'first_call_date': '',
            'first_connection_date': '',
            'last_call_date': '',
            'calls_before_first_connection': 0,
            'days_first_call_to_first_connection': '',
            'calls_to_offer': 0,
            'connections_to_offer': 0,
            'calls_after_offer': 0,
        }

    total_calls = len(calls)
    connections = [c for c in calls if c['is_connection']]
    total_connections = len(connections)

    durations = [c['duration'] for c in calls]
    total_talk_time = sum(durations)
    longest_call = max(durations) if durations else 0
    avg_duration = round(total_talk_time / total_calls, 1) if total_calls > 0 else 0

    first_call_date = calls[0]['call_date']
    last_call_date = calls[-1]['call_date']

    # First connection date and calls before first connection
    first_connection_date = ''
    calls_before_first_connection = 0
    days_to_first_connection = ''

    for i, call in enumerate(calls):
        if call['is_connection']:
            first_connection_date = call['call_date']
            calls_before_first_connection = i  # calls before this one
            days_diff = (call['call_date'] - first_call_date).days
            days_to_first_connection = days_diff
            break
    else:
        # No connection found
        calls_before_first_connection = total_calls

    # Calls relative to offer date
    offer_date_only = offer_date.date() if isinstance(offer_date, datetime) else offer_date

    calls_to_offer = 0
    connections_to_offer = 0
    calls_after_offer = 0

    for call in calls:
        if call['call_date'] < offer_date_only:
            calls_to_offer += 1
            if call['is_connection']:
                connections_to_offer += 1
        else:
            calls_after_offer += 1

    return {
        'person_id': person_id,
        'total_calls': total_calls,
        'total_connections': total_connections,
        'total_talk_time_seconds': total_talk_time,
        'longest_call_seconds': longest_call,
        'avg_call_duration_seconds': avg_duration,
        'first_call_date': str(first_call_date) if first_call_date else '',
        'first_connection_date': str(first_connection_date) if first_connection_date else '',
        'last_call_date': str(last_call_date) if last_call_date else '',
        'calls_before_first_connection': calls_before_first_connection,
        'days_first_call_to_first_connection': days_to_first_connection if days_to_first_connection != '' else '',
        'calls_to_offer': calls_to_offer,
        'connections_to_offer': connections_to_offer,
        'calls_after_offer': calls_after_offer,
    }


def get_call_disposition(duration):
    """Determine call disposition based on duration."""
    if duration >= CONNECTION_THRESHOLD:
        return 'connected'
    elif duration >= 30:
        return 'brief_contact'
    elif duration > 0:
        return 'voicemail_or_no_answer'
    else:
        return 'no_answer'


def export_aggregated_metrics(leads, calls_by_lead, output_dir):
    """Export aggregated call metrics per lead."""
    print("\n" + "=" * 60)
    print("Exporting Aggregated Call Metrics")
    print("=" * 60)

    rows = []
    leads_with_calls = 0
    leads_without_calls = 0

    for person_id, lead_info in leads.items():
        calls = calls_by_lead.get(person_id, [])
        metrics = calculate_aggregated_metrics(person_id, calls, lead_info['offer_date'])

        if metrics['total_calls'] > 0:
            leads_with_calls += 1
        else:
            leads_without_calls += 1

        rows.append(metrics)

    # Sort by person_id
    rows.sort(key=lambda x: x['person_id'])

    # Write CSV
    output_file = output_dir / 'call_activity_aggregated.csv'
    fieldnames = [
        'person_id',
        'total_calls',
        'total_connections',
        'total_talk_time_seconds',
        'longest_call_seconds',
        'avg_call_duration_seconds',
        'first_call_date',
        'first_connection_date',
        'last_call_date',
        'calls_before_first_connection',
        'days_first_call_to_first_connection',
        'calls_to_offer',
        'connections_to_offer',
        'calls_after_offer',
    ]

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Exported {len(rows)} leads to {output_file}")
    print(f"  Leads with call data: {leads_with_calls}")
    print(f"  Leads without call data: {leads_without_calls}")

    # Summary stats
    total_calls = sum(r['total_calls'] for r in rows)
    total_connections = sum(r['total_connections'] for r in rows)
    print(f"\nTotal outbound calls: {total_calls}")
    print(f"Total connections (2+ min): {total_connections}")


def export_call_detail(leads, calls_by_lead, output_dir):
    """Export call-level detail for each lead."""
    print("\n" + "=" * 60)
    print("Exporting Call-Level Detail")
    print("=" * 60)

    rows = []

    for person_id, lead_info in leads.items():
        calls = calls_by_lead.get(person_id, [])

        for call in calls:
            rows.append({
                'person_id': person_id,
                'call_date': str(call['call_date']),
                'call_time': call['call_time'],
                'call_duration_seconds': call['duration'],
                'call_disposition': get_call_disposition(call['duration']),
                'agent': call['user_name'],
            })

    # Sort by person_id then call date/time
    rows.sort(key=lambda x: (x['person_id'], x['call_date'], x['call_time']))

    # Write CSV
    output_file = output_dir / 'call_activity_detail.csv'
    fieldnames = [
        'person_id',
        'call_date',
        'call_time',
        'call_duration_seconds',
        'call_disposition',
        'agent',
    ]

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Exported {len(rows)} call records to {output_file}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Export call activity data for leads with verbal offers')
    parser.add_argument('--start-date', type=str, default='2025-07-28',
                        help='Start date for verbal offers (YYYY-MM-DD), default: 2025-07-28')
    parser.add_argument('--end-date', type=str, default='2026-01-12',
                        help='End date for verbal offers (YYYY-MM-DD), default: 2026-01-12')
    parser.add_argument('--output-dir', type=str, default='exports',
                        help='Output directory for CSV files')
    parser.add_argument('--skip-detail', action='store_true',
                        help='Skip exporting call-level detail')
    args = parser.parse_args()

    # Parse dates
    start_date = datetime.strptime(args.start_date, '%Y-%m-%d').replace(tzinfo=EASTERN_TZ)
    end_date = datetime.strptime(args.end_date, '%Y-%m-%d').replace(tzinfo=EASTERN_TZ)
    end_date = end_date + timedelta(days=1)  # Include full end date

    print("=" * 60)
    print("Call Activity Export for Statistical Analysis")
    print("=" * 60)
    print(f"Verbal offers period: {args.start_date} to {args.end_date}")

    # Create output directory
    output_dir = Path(__file__).resolve().parent.parent / args.output_dir
    output_dir.mkdir(exist_ok=True)
    print(f"Output directory: {output_dir}")

    # Connect to database
    print("\nConnecting to database...")
    if not SUPABASE_DB_URL:
        print("ERROR: SUPABASE_DB_URL not set")
        sys.exit(1)

    conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # Get leads with verbal offers
    print("\nFetching leads with verbal offers...")
    leads = get_leads_with_offers(cursor, start_date, end_date)
    print(f"Found {len(leads)} leads with verbal offers")

    cursor.close()
    conn.close()

    if not leads:
        print("No leads found. Exiting.")
        return

    # Fetch call data
    # Extend date range to capture calls before and after the offer period
    call_start = start_date - timedelta(days=90)  # 90 days before for lead nurturing calls
    call_end = end_date + timedelta(days=30)  # 30 days after for follow-up calls

    all_calls = fetch_all_calls(call_start, call_end)

    # Build calls by lead
    print("\nProcessing calls for target leads...")
    target_person_ids = set(leads.keys())
    calls_by_lead = build_calls_by_lead(all_calls, target_person_ids)

    leads_with_calls = sum(1 for pid in calls_by_lead if calls_by_lead[pid])
    print(f"  Leads with call data: {leads_with_calls} of {len(leads)}")

    # Export aggregated metrics
    export_aggregated_metrics(leads, calls_by_lead, output_dir)

    # Export call detail (unless skipped)
    if not args.skip_detail:
        export_call_detail(leads, calls_by_lead, output_dir)

    print("\n" + "=" * 60)
    print("Export complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
