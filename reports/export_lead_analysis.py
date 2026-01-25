#!/usr/bin/env python3
"""
Export lead-level data to CSV for statistical analysis.

This script exports three datasets:
1. All Signed Contracts - with full lifecycle timestamps
2. Contracts Sent But Not Signed
3. Verbal Offers Made But No Contract Sent

Used for correlation analysis of acquisition manager performance.
"""

import os
import sys
import base64
import csv
import json
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

# Agents to include
INCLUDED_AGENTS = [
    "Dante Hernandez",
    "Madeleine Penales",
]

# Stage names
STAGE_OFFERS_MADE = "ACQ - Offers Made"
STAGE_CONTRACT_SENT = "ACQ - Contract Sent"
STAGE_UNDER_CONTRACT = "ACQ - Under Contract"


def get_agent_name(row):
    """Get agent name from row using fallback logic."""
    assigned_user_name = row.get('assigned_user_name')
    payload_assigned_to = row.get('payload_assigned_to')
    changed_at = row.get('changed_at')

    if assigned_user_name:
        return assigned_user_name
    if payload_assigned_to and payload_assigned_to != 'null':
        return payload_assigned_to
    # Before Dec 19, 2025, default to Madeleine (she was the only acquisition agent)
    if changed_at:
        # Handle both naive and aware datetimes
        cutoff = datetime(2025, 12, 19)
        if hasattr(changed_at, 'tzinfo') and changed_at.tzinfo is not None:
            cutoff = cutoff.replace(tzinfo=changed_at.tzinfo)
        if changed_at < cutoff:
            return 'Madeleine Penales'
    return 'Unassigned'


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
                # API error, stop pagination for this period
                break
        except Exception as e:
            print(f"    WARNING: Error fetching calls: {e}")
            break

    return all_calls


def fetch_all_calls(start_date, end_date):
    """Fetch all calls from FUB API by breaking into weekly chunks."""
    if not FUB_API_KEY:
        print("WARNING: FUB_API_KEY not set, skipping call data")
        return []

    auth_string = base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()

    print(f"Fetching calls from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}...")
    print("  (fetching in weekly chunks to avoid API limits)")

    all_calls = []
    current_start = start_date

    while current_start < end_date:
        # Fetch one week at a time
        current_end = min(current_start + timedelta(days=7), end_date)

        start_str = current_start.strftime('%Y-%m-%d')
        end_str = current_end.strftime('%Y-%m-%d')

        calls = fetch_calls_for_period(auth_string, start_str, end_str)
        all_calls.extend(calls)

        print(f"    {start_str} to {end_str}: {len(calls)} calls")

        current_start = current_end

    print(f"  Total calls fetched: {len(all_calls)}")
    return all_calls


def get_first_connection_by_lead(calls):
    """
    Build a dict mapping person_id (as string) -> first connection timestamp.
    A connection is a call lasting >= 120 seconds.
    """
    first_connections = {}

    for call in calls:
        person_id = call.get('personId')
        if not person_id:
            continue

        # Convert to string to match database format
        person_id = str(person_id)

        duration = call.get('duration', 0) or 0
        if duration < 120:
            continue

        created = call.get('created')
        if not created:
            continue

        # Parse timestamp
        try:
            call_time = datetime.fromisoformat(created.replace('Z', '+00:00'))
        except:
            continue

        # Keep earliest connection
        if person_id not in first_connections or call_time < first_connections[person_id]:
            first_connections[person_id] = call_time

    return first_connections


def query_leads_by_stage(cursor, target_stage, start_date, end_date):
    """
    Query all leads that reached a specific stage within the date range.
    Returns dict mapping person_id -> lead info.
    """
    cursor.execute("""
        SELECT DISTINCT ON (person_id)
            person_id,
            first_name,
            last_name,
            parcel_county,
            parcel_state,
            changed_at,
            assigned_user_name,
            raw_payload->>'assignedTo' as payload_assigned_to
        FROM stage_changes
        WHERE stage_to = %s
          AND changed_at >= %s
          AND changed_at < %s
        ORDER BY person_id, changed_at
    """, (target_stage, start_date, end_date))

    leads = {}
    for row in cursor.fetchall():
        row_dict = dict(row)
        agent = get_agent_name(row_dict)

        # Only include specified agents
        if agent not in INCLUDED_AGENTS:
            continue

        person_id = row['person_id']
        leads[person_id] = {
            'person_id': person_id,
            'first_name': row['first_name'],
            'last_name': row['last_name'],
            'county': row['parcel_county'],
            'state': row['parcel_state'],
            'agent': agent,
            f'{target_stage}_date': row['changed_at'],
        }

    return leads


def get_stage_timestamps(cursor, person_ids, start_date, end_date):
    """
    Get all stage timestamps for a set of person_ids.
    Returns dict mapping person_id -> {stage: timestamp}.
    """
    if not person_ids:
        return {}

    cursor.execute("""
        SELECT
            person_id,
            stage_to,
            MIN(changed_at) as first_reached
        FROM stage_changes
        WHERE person_id = ANY(%s)
          AND changed_at >= %s
          AND changed_at < %s
          AND stage_to IN (%s, %s, %s)
        GROUP BY person_id, stage_to
    """, (list(person_ids), start_date, end_date,
          STAGE_OFFERS_MADE, STAGE_CONTRACT_SENT, STAGE_UNDER_CONTRACT))

    timestamps = {}
    for row in cursor.fetchall():
        person_id = row['person_id']
        if person_id not in timestamps:
            timestamps[person_id] = {}
        timestamps[person_id][row['stage_to']] = row['first_reached']

    return timestamps


def get_lead_created_dates(cursor, person_ids):
    """
    Get the earliest stage change date for each lead (approximates when they entered system).
    """
    if not person_ids:
        return {}

    cursor.execute("""
        SELECT
            person_id,
            MIN(changed_at) as first_seen
        FROM stage_changes
        WHERE person_id = ANY(%s)
        GROUP BY person_id
    """, (list(person_ids),))

    return {row['person_id']: row['first_seen'] for row in cursor.fetchall()}


def format_date(dt):
    """Format datetime as YYYY-MM-DD or empty string if None."""
    if dt is None:
        return ''
    if isinstance(dt, datetime):
        return dt.strftime('%Y-%m-%d')
    return str(dt)


def export_signed_contracts(cursor, start_date, end_date, first_connections, output_dir):
    """Export Dataset 1: All Signed Contracts."""
    print("\n" + "=" * 60)
    print("Dataset 1: All Signed Contracts")
    print("=" * 60)

    # Get all leads that reached Under Contract
    signed_leads = query_leads_by_stage(cursor, STAGE_UNDER_CONTRACT, start_date, end_date)
    print(f"Found {len(signed_leads)} signed contracts")


    if not signed_leads:
        return

    # Get all stage timestamps for these leads
    person_ids = list(signed_leads.keys())
    stage_timestamps = get_stage_timestamps(cursor, person_ids, start_date, end_date)
    created_dates = get_lead_created_dates(cursor, person_ids)

    # Build output rows
    rows = []
    inferred_count = 0
    for person_id, lead in signed_leads.items():
        timestamps = stage_timestamps.get(person_id, {})

        signed_date = timestamps.get(STAGE_UNDER_CONTRACT)
        contract_sent_date = timestamps.get(STAGE_CONTRACT_SENT)

        # If contract was signed but "Contract Sent" stage was skipped,
        # infer contract_sent_date from signed_date (contract must have been sent to be signed)
        contract_sent_inferred = False
        if signed_date and not contract_sent_date:
            contract_sent_date = signed_date
            contract_sent_inferred = True
            inferred_count += 1

        row = {
            'person_id': person_id,
            'lead_name': f"{lead['first_name']} {lead['last_name']}".strip(),
            'county': lead['county'] or '',
            'state': lead['state'] or '',
            'agent': lead['agent'],
            'entered_system': format_date(created_dates.get(person_id)),
            'first_connection': format_date(first_connections.get(person_id)),
            'verbal_offer_date': format_date(timestamps.get(STAGE_OFFERS_MADE)),
            'contract_sent_date': format_date(contract_sent_date),
            'contract_sent_inferred': 'Yes' if contract_sent_inferred else '',
            'signed_date': format_date(signed_date),
        }
        rows.append(row)

    if inferred_count > 0:
        print(f"  Note: {inferred_count} leads skipped 'Contract Sent' stage - date inferred from signed date")

    # Sort by signed date
    rows.sort(key=lambda x: x['signed_date'])

    # Write CSV
    output_file = output_dir / 'dataset1_signed_contracts.csv'
    fieldnames = ['person_id', 'lead_name', 'county', 'state', 'agent',
                  'entered_system', 'first_connection', 'verbal_offer_date',
                  'contract_sent_date', 'contract_sent_inferred', 'signed_date']

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Exported {len(rows)} rows to {output_file}")

    # Print summary by agent
    by_agent = {}
    for row in rows:
        agent = row['agent']
        by_agent[agent] = by_agent.get(agent, 0) + 1

    print("\nBy Agent:")
    for agent, count in sorted(by_agent.items()):
        print(f"  {agent}: {count}")


def export_contracts_not_signed(cursor, start_date, end_date, first_connections, output_dir):
    """Export Dataset 2: Contracts Sent But Not Signed."""
    print("\n" + "=" * 60)
    print("Dataset 2: Contracts Sent But Not Signed")
    print("=" * 60)

    # Get all leads that reached Contract Sent
    contract_sent_leads = query_leads_by_stage(cursor, STAGE_CONTRACT_SENT, start_date, end_date)

    # Get all leads that reached Under Contract
    signed_leads = query_leads_by_stage(cursor, STAGE_UNDER_CONTRACT, start_date, end_date)
    signed_person_ids = set(signed_leads.keys())

    # Filter to only those NOT signed
    not_signed = {pid: lead for pid, lead in contract_sent_leads.items()
                  if pid not in signed_person_ids}

    print(f"Found {len(not_signed)} contracts sent but not signed")

    if not not_signed:
        return

    # Get all stage timestamps for these leads
    person_ids = list(not_signed.keys())
    stage_timestamps = get_stage_timestamps(cursor, person_ids, start_date, end_date)
    created_dates = get_lead_created_dates(cursor, person_ids)

    # Build output rows
    rows = []
    for person_id, lead in not_signed.items():
        timestamps = stage_timestamps.get(person_id, {})

        row = {
            'person_id': person_id,
            'lead_name': f"{lead['first_name']} {lead['last_name']}".strip(),
            'county': lead['county'] or '',
            'state': lead['state'] or '',
            'agent': lead['agent'],
            'entered_system': format_date(created_dates.get(person_id)),
            'first_connection': format_date(first_connections.get(person_id)),
            'verbal_offer_date': format_date(timestamps.get(STAGE_OFFERS_MADE)),
            'contract_sent_date': format_date(timestamps.get(STAGE_CONTRACT_SENT)),
        }
        rows.append(row)

    # Sort by contract sent date
    rows.sort(key=lambda x: x['contract_sent_date'])

    # Write CSV
    output_file = output_dir / 'dataset2_contracts_not_signed.csv'
    fieldnames = ['person_id', 'lead_name', 'county', 'state', 'agent',
                  'entered_system', 'first_connection', 'verbal_offer_date',
                  'contract_sent_date']

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Exported {len(rows)} rows to {output_file}")

    # Print summary by agent
    by_agent = {}
    for row in rows:
        agent = row['agent']
        by_agent[agent] = by_agent.get(agent, 0) + 1

    print("\nBy Agent:")
    for agent, count in sorted(by_agent.items()):
        print(f"  {agent}: {count}")


def export_offers_no_contract(cursor, start_date, end_date, first_connections, output_dir):
    """Export Dataset 3: Verbal Offers Made But No Contract Sent."""
    print("\n" + "=" * 60)
    print("Dataset 3: Verbal Offers Made But No Contract Sent")
    print("=" * 60)

    # Get all leads that reached Offers Made
    offers_made_leads = query_leads_by_stage(cursor, STAGE_OFFERS_MADE, start_date, end_date)

    # Get all leads that reached Contract Sent
    contract_sent_leads = query_leads_by_stage(cursor, STAGE_CONTRACT_SENT, start_date, end_date)
    contract_sent_person_ids = set(contract_sent_leads.keys())

    # Filter to only those without contract sent
    no_contract = {pid: lead for pid, lead in offers_made_leads.items()
                   if pid not in contract_sent_person_ids}

    print(f"Found {len(no_contract)} verbal offers without contract sent")

    if not no_contract:
        return

    # Get all stage timestamps for these leads
    person_ids = list(no_contract.keys())
    stage_timestamps = get_stage_timestamps(cursor, person_ids, start_date, end_date)
    created_dates = get_lead_created_dates(cursor, person_ids)

    # Build output rows
    rows = []
    for person_id, lead in no_contract.items():
        timestamps = stage_timestamps.get(person_id, {})

        row = {
            'person_id': person_id,
            'lead_name': f"{lead['first_name']} {lead['last_name']}".strip(),
            'county': lead['county'] or '',
            'state': lead['state'] or '',
            'agent': lead['agent'],
            'entered_system': format_date(created_dates.get(person_id)),
            'first_connection': format_date(first_connections.get(person_id)),
            'verbal_offer_date': format_date(timestamps.get(STAGE_OFFERS_MADE)),
        }
        rows.append(row)

    # Sort by verbal offer date
    rows.sort(key=lambda x: x['verbal_offer_date'])

    # Write CSV
    output_file = output_dir / 'dataset3_offers_no_contract.csv'
    fieldnames = ['person_id', 'lead_name', 'county', 'state', 'agent',
                  'entered_system', 'first_connection', 'verbal_offer_date']

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Exported {len(rows)} rows to {output_file}")

    # Print summary by agent
    by_agent = {}
    for row in rows:
        agent = row['agent']
        by_agent[agent] = by_agent.get(agent, 0) + 1

    print("\nBy Agent:")
    for agent, count in sorted(by_agent.items()):
        print(f"  {agent}: {count}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Export lead-level data for statistical analysis')
    parser.add_argument('--start-date', type=str, default='2025-10-27',
                        help='Start date (YYYY-MM-DD), default: 2025-10-27')
    parser.add_argument('--end-date', type=str, default='2026-01-12',
                        help='End date (YYYY-MM-DD), default: 2026-01-12')
    parser.add_argument('--output-dir', type=str, default='exports',
                        help='Output directory for CSV files')
    args = parser.parse_args()

    # Parse dates
    start_date = datetime.strptime(args.start_date, '%Y-%m-%d').replace(tzinfo=EASTERN_TZ)
    end_date = datetime.strptime(args.end_date, '%Y-%m-%d').replace(tzinfo=EASTERN_TZ)
    # Include the full end date
    end_date = end_date + timedelta(days=1)

    print("=" * 60)
    print("Lead-Level Data Export for Statistical Analysis")
    print("=" * 60)
    print(f"Period: {args.start_date} to {args.end_date}")
    print(f"Agents: {', '.join(INCLUDED_AGENTS)}")

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

    # Fetch call data for first connection timestamps
    # Extend the date range a bit for calls (leads may have been contacted before entering stage)
    call_start = start_date - timedelta(days=60)
    all_calls = fetch_all_calls(call_start, end_date)
    first_connections = get_first_connection_by_lead(all_calls)
    print(f"Found first connections for {len(first_connections)} leads")

    # Export all three datasets
    export_signed_contracts(cursor, start_date, end_date, first_connections, output_dir)
    export_contracts_not_signed(cursor, start_date, end_date, first_connections, output_dir)
    export_offers_no_contract(cursor, start_date, end_date, first_connections, output_dir)

    cursor.close()
    conn.close()

    print("\n" + "=" * 60)
    print("Export complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
