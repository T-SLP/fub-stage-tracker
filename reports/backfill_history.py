#!/usr/bin/env python3
"""
Backfill History Tab with 60 days of historical data.

This script queries the database and FUB API to generate weekly metrics
for the past 60 days and writes them to the History tab.
"""

import os
import sys
import base64
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
import gspread
from google.oauth2.service_account import Credentials

# Configuration
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
FUB_API_KEY = os.getenv("FUB_API_KEY")
GOOGLE_SHEETS_CREDENTIALS = os.getenv("GOOGLE_SHEETS_CREDENTIALS")
WEEKLY_AGENT_SHEET_ID = "1MNnP-w70h7gv7NnpRxO6GZstq9m6wW5USAozzCev6gs"

# Try to load credentials from local file if env var not set
if not GOOGLE_SHEETS_CREDENTIALS:
    creds_file = Path(__file__).resolve().parent.parent / 'google-credentials.json'
    if creds_file.exists():
        GOOGLE_SHEETS_CREDENTIALS = creds_file.read_text()

EASTERN_TZ = ZoneInfo("America/New_York")

# Agents to include
INCLUDED_AGENTS = [
    "Dante Hernandez",
    "Madeleine Penales",
]

# Stage names to track
TRACKED_STAGES = [
    "ACQ - Offers Made",
    "ACQ - Contract Sent",
    "ACQ - Under Contract",
]


def get_monday_of_week(date):
    """Get the Monday of the week containing the given date."""
    days_since_monday = date.weekday()
    return date - timedelta(days=days_since_monday)


def get_weeks_in_range(days_back=60):
    """Get list of (start_date, end_date) tuples for each week in the range."""
    today = datetime.now(EASTERN_TZ).date()
    start_date = today - timedelta(days=days_back)

    weeks = []
    current_monday = get_monday_of_week(start_date)

    while current_monday < today:
        week_start = current_monday
        week_end = current_monday + timedelta(days=6)  # Sunday

        # Don't include incomplete current week
        if week_end < today:
            weeks.append((week_start, week_end))

        current_monday += timedelta(days=7)

    return weeks


def get_fub_users():
    """Get mapping of FUB user names to IDs."""
    if not FUB_API_KEY:
        return {}

    auth_string = base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()

    try:
        response = requests.get(
            'https://api.followupboss.com/v1/users',
            headers={
                'Authorization': f'Basic {auth_string}',
                'Content-Type': 'application/json'
            },
            timeout=30
        )

        if response.status_code == 200:
            data = response.json()
            users = data.get('users', [])
            return {u.get('name', ''): u.get('id') for u in users if u.get('name')}
    except Exception as e:
        print(f"WARNING: Error fetching FUB users: {e}")

    return {}


def query_stage_metrics(start_date, end_date):
    """Query database for stage progression metrics."""
    if not SUPABASE_DB_URL:
        return {}

    try:
        conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

        # Convert dates to datetime with timezone
        start_dt = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=EASTERN_TZ)
        end_dt = datetime.combine(end_date, datetime.max.time()).replace(tzinfo=EASTERN_TZ)

        # Use COALESCE to fall back to raw_payload->>'assignedTo' for older records
        # where assigned_user_name wasn't populated
        cursor.execute("""
            SELECT
                COALESCE(assigned_user_name, raw_payload->>'assignedTo', 'Unassigned') as agent,
                stage_to,
                COUNT(*) as count
            FROM stage_changes
            WHERE changed_at >= %s
              AND changed_at < %s
              AND stage_to IN %s
            GROUP BY COALESCE(assigned_user_name, raw_payload->>'assignedTo', 'Unassigned'), stage_to
        """, (start_dt, end_dt, tuple(TRACKED_STAGES)))

        results = {}
        for row in cursor.fetchall():
            agent = row['agent']
            stage = row['stage_to']
            count = row['count']

            if agent not in results:
                results[agent] = {}
            results[agent][stage] = count

        cursor.close()
        conn.close()
        return results

    except Exception as e:
        print(f"WARNING: Error querying stage metrics: {e}")
        return {}


def query_call_metrics(start_date, end_date, user_ids):
    """Query FUB API for call metrics."""
    if not FUB_API_KEY or not user_ids:
        return {}

    auth_string = base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()

    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')

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
            print(f"WARNING: Error fetching calls: {e}")
            break

    # Build reverse lookup
    user_id_to_name = {v: k for k, v in user_ids.items()}

    # Initialize metrics
    call_metrics = {}
    for user_name in user_ids.keys():
        call_metrics[user_name] = {
            'outbound_calls': 0,
            'conversations': 0,
            'talk_time_min': 0,
            'long_call_durations': [],
            'outbound_call_details': [],
            'unique_leads_dialed': set(),
            'unique_leads_connected': set(),
        }

    # Process calls
    for call in all_calls:
        call_user_id = call.get('userId')
        call_user_name = call.get('userName')
        is_outgoing = call.get('isIncoming') == False
        duration = call.get('duration', 0) or 0

        agent_name = None
        if call_user_id in user_id_to_name:
            agent_name = user_id_to_name[call_user_id]
        elif call_user_name in user_ids:
            agent_name = call_user_name

        if agent_name and agent_name in call_metrics:
            call_metrics[agent_name]['talk_time_min'] += duration / 60

            if is_outgoing:
                call_metrics[agent_name]['outbound_calls'] += 1

                to_number = call.get('toNumber')
                created = call.get('created')
                if to_number and created:
                    call_metrics[agent_name]['outbound_call_details'].append({
                        'to_number': to_number,
                        'created': created,
                        'duration': duration,
                    })

                person_id = call.get('personId')
                if person_id:
                    call_metrics[agent_name]['unique_leads_dialed'].add(person_id)

            if duration >= 120:
                call_metrics[agent_name]['conversations'] += 1
                call_metrics[agent_name]['long_call_durations'].append(duration)

                person_id = call.get('personId')
                if person_id:
                    call_metrics[agent_name]['unique_leads_connected'].add(person_id)

    # Calculate dial sequences for each agent
    for agent_name, metrics in call_metrics.items():
        calls_list = sorted(metrics['outbound_call_details'], key=lambda x: x['created'])

        single_dial = 0
        double_dial = 0
        triple_dial = 0

        i = 0
        while i < len(calls_list):
            current = calls_list[i]
            current_phone = current['to_number']
            current_time = datetime.fromisoformat(current['created'].replace('Z', '+00:00'))

            sequence_length = 1
            j = i + 1

            while j < len(calls_list):
                next_call = calls_list[j]
                next_phone = next_call['to_number']
                next_time = datetime.fromisoformat(next_call['created'].replace('Z', '+00:00'))

                time_diff = (next_time - current_time).total_seconds()

                if next_phone == current_phone and time_diff <= 120:
                    sequence_length += 1
                    current_time = next_time
                    j += 1
                else:
                    break

            if sequence_length == 1:
                single_dial += 1
            elif sequence_length == 2:
                double_dial += 1
            else:
                triple_dial += 1

            i = j

        metrics['single_dial'] = single_dial
        metrics['double_dial'] = double_dial
        metrics['triple_dial'] = triple_dial
        metrics['unique_leads_dialed'] = len(metrics['unique_leads_dialed'])
        metrics['unique_leads_connected'] = len(metrics['unique_leads_connected'])
        metrics['talk_time_min'] = round(metrics['talk_time_min'])

    return call_metrics


def backfill_history(days_back=60):
    """Backfill the History tab with historical data."""
    print(f"Backfilling History tab with {days_back} days of data...")

    # Get weeks to process
    weeks = get_weeks_in_range(days_back)
    print(f"Found {len(weeks)} complete weeks to process")

    if not weeks:
        print("No complete weeks to process")
        return

    # Get FUB users
    user_ids = get_fub_users()
    print(f"Found {len(user_ids)} FUB users")

    # History headers (must match Latest tab exactly)
    history_headers = [
        "Week Starting",
        "Agent",
        # KPIs
        "Talk Time (min)",
        "Offers Made",
        "Contracts Sent",
        # Metrics
        "Outbound Calls",
        "Connections (2+ min)",
        "Connection Rate",
        "Unique Leads Dialed",
        "Unique Leads Connected",
        "Unique Lead Connection Rate",
        "Avg Call (min)",
        "Single Dial",
        "2x Dial",
        "3x Dial",
        "Signed Contracts",
    ]

    all_history_rows = []

    # Process each week
    for week_start, week_end in weeks:
        print(f"  Processing week: {week_start} to {week_end}")

        # Query metrics for this week
        stage_metrics = query_stage_metrics(week_start, week_end)
        call_metrics = query_call_metrics(week_start, week_end, user_ids)

        week_label = week_start.strftime('%Y-%m-%d')

        # Build rows for each agent
        for agent in INCLUDED_AGENTS:
            stage_data = stage_metrics.get(agent, {})
            offers = stage_data.get("ACQ - Offers Made", 0)
            contracts_sent = stage_data.get("ACQ - Contract Sent", 0)
            signed_contracts = stage_data.get("ACQ - Under Contract", 0)

            call_data = call_metrics.get(agent, {})
            outbound_calls = call_data.get('outbound_calls', 0)
            unique_leads = call_data.get('unique_leads_dialed', 0)
            unique_leads_connected = call_data.get('unique_leads_connected', 0)
            connections = call_data.get('conversations', 0)
            long_call_durations = call_data.get('long_call_durations', [])
            avg_call_min = round(sum(long_call_durations) / len(long_call_durations) / 60, 1) if long_call_durations else 0
            talk_time = call_data.get('talk_time_min', 0)
            connection_rate = f"{round(connections / outbound_calls * 100)}%" if outbound_calls > 0 else "0%"
            unique_lead_conn_rate = f"{round(unique_leads_connected / unique_leads * 100)}%" if unique_leads > 0 else "0%"
            single_dial = call_data.get('single_dial', 0)
            double_dial = call_data.get('double_dial', 0)
            triple_dial = call_data.get('triple_dial', 0)

            history_row = [
                week_label, agent, talk_time, offers, contracts_sent,
                outbound_calls, connections, connection_rate,
                unique_leads, unique_leads_connected, unique_lead_conn_rate,
                avg_call_min, single_dial, double_dial, triple_dial, signed_contracts
            ]
            all_history_rows.append(history_row)

    # Sort by week (most recent first), then by agent
    all_history_rows.sort(key=lambda x: (x[0], x[1]), reverse=True)

    # Connect to Google Sheets
    print("Connecting to Google Sheets...")
    if not GOOGLE_SHEETS_CREDENTIALS:
        print("ERROR: GOOGLE_SHEETS_CREDENTIALS not set")
        return

    creds_dict = json.loads(GOOGLE_SHEETS_CREDENTIALS)
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    credentials = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    gc = gspread.authorize(credentials)

    spreadsheet = gc.open_by_key(WEEKLY_AGENT_SHEET_ID)
    existing_tabs = [ws.title for ws in spreadsheet.worksheets()]

    # Write to History tab
    print("Writing to History tab...")
    if "History" in existing_tabs:
        history_ws = spreadsheet.worksheet("History")
        history_ws.clear()
    else:
        history_ws = spreadsheet.add_worksheet(title="History", rows=500, cols=20)

    # Write headers + data (most recent at top)
    history_data = [history_headers] + all_history_rows
    history_ws.update(range_name='A1', values=history_data)
    history_ws.format('A1:P1', {'textFormat': {'bold': True}})

    print(f"Successfully wrote {len(all_history_rows)} rows to History tab")
    print("Done!")


def generate_analysis_export(days_back=90):
    """Generate Analysis Export tab with data optimized for correlation analysis."""
    print(f"Generating Analysis Export tab with {days_back} days of data...")

    # Get weeks to process
    weeks = get_weeks_in_range(days_back)
    print(f"Found {len(weeks)} complete weeks to process")

    if not weeks:
        print("No complete weeks to process")
        return

    # Get FUB users
    user_ids = get_fub_users()
    print(f"Found {len(user_ids)} FUB users")

    # Analysis Export headers - same as History but with numeric-friendly column names
    # Percentages will be stored as numbers (e.g., 23 instead of "23%") for easier analysis
    analysis_headers = [
        "Week Starting",
        "Agent",
        # KPIs
        "Talk Time (min)",
        "Offers Made",
        "Contracts Sent",
        # Metrics
        "Outbound Calls",
        "Connections (2+ min)",
        "Connection Rate (%)",  # Numeric percentage
        "Unique Leads Dialed",
        "Unique Leads Connected",
        "Unique Lead Connection Rate (%)",  # Numeric percentage
        "Avg Call (min)",
        "Single Dial",
        "2x Dial",
        "3x Dial",
        "Signed Contracts",
    ]

    all_analysis_rows = []

    # Process each week
    for week_start, week_end in weeks:
        print(f"  Processing week: {week_start} to {week_end}")

        # Query metrics for this week
        stage_metrics = query_stage_metrics(week_start, week_end)
        call_metrics = query_call_metrics(week_start, week_end, user_ids)

        week_label = week_start.strftime('%Y-%m-%d')

        # Build rows for each agent
        for agent in INCLUDED_AGENTS:
            stage_data = stage_metrics.get(agent, {})
            offers = stage_data.get("ACQ - Offers Made", 0)
            contracts_sent = stage_data.get("ACQ - Contract Sent", 0)
            signed_contracts = stage_data.get("ACQ - Under Contract", 0)

            call_data = call_metrics.get(agent, {})
            outbound_calls = call_data.get('outbound_calls', 0)
            unique_leads = call_data.get('unique_leads_dialed', 0)
            unique_leads_connected = call_data.get('unique_leads_connected', 0)
            connections = call_data.get('conversations', 0)
            long_call_durations = call_data.get('long_call_durations', [])
            avg_call_min = round(sum(long_call_durations) / len(long_call_durations) / 60, 1) if long_call_durations else 0
            talk_time = call_data.get('talk_time_min', 0)

            # Store percentages as numbers for correlation analysis
            connection_rate = round(connections / outbound_calls * 100, 1) if outbound_calls > 0 else 0
            unique_lead_conn_rate = round(unique_leads_connected / unique_leads * 100, 1) if unique_leads > 0 else 0

            single_dial = call_data.get('single_dial', 0)
            double_dial = call_data.get('double_dial', 0)
            triple_dial = call_data.get('triple_dial', 0)

            analysis_row = [
                week_label, agent, talk_time, offers, contracts_sent,
                outbound_calls, connections, connection_rate,
                unique_leads, unique_leads_connected, unique_lead_conn_rate,
                avg_call_min, single_dial, double_dial, triple_dial, signed_contracts
            ]
            all_analysis_rows.append(analysis_row)

    # Sort by week (oldest first for time series analysis), then by agent
    all_analysis_rows.sort(key=lambda x: (x[0], x[1]))

    # Connect to Google Sheets
    print("Connecting to Google Sheets...")
    if not GOOGLE_SHEETS_CREDENTIALS:
        print("ERROR: GOOGLE_SHEETS_CREDENTIALS not set")
        return

    creds_dict = json.loads(GOOGLE_SHEETS_CREDENTIALS)
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    credentials = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    gc = gspread.authorize(credentials)

    spreadsheet = gc.open_by_key(WEEKLY_AGENT_SHEET_ID)
    existing_tabs = [ws.title for ws in spreadsheet.worksheets()]

    # Write to Analysis Export tab
    print("Writing to 'Analysis Export' tab...")
    if "Analysis Export" in existing_tabs:
        analysis_ws = spreadsheet.worksheet("Analysis Export")
        analysis_ws.clear()
    else:
        analysis_ws = spreadsheet.add_worksheet(title="Analysis Export", rows=500, cols=20)

    # Write headers + data
    analysis_data = [analysis_headers] + all_analysis_rows
    analysis_ws.update(range_name='A1', values=analysis_data)
    analysis_ws.format('A1:P1', {'textFormat': {'bold': True}})

    print(f"Successfully wrote {len(all_analysis_rows)} rows to Analysis Export tab")
    print("Done!")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='Backfill History tab and generate Analysis Export')
    parser.add_argument('--days', type=int, default=60, help='Number of days to backfill History (default: 60)')
    parser.add_argument('--analysis-days', type=int, default=90, help='Number of days for Analysis Export (default: 90)')
    parser.add_argument('--history-only', action='store_true', help='Only backfill History tab')
    parser.add_argument('--analysis-only', action='store_true', help='Only generate Analysis Export tab')
    args = parser.parse_args()

    if args.analysis_only:
        generate_analysis_export(args.analysis_days)
    elif args.history_only:
        backfill_history(args.days)
    else:
        backfill_history(args.days)
        generate_analysis_export(args.analysis_days)
