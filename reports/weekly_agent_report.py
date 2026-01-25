#!/usr/bin/env python3
"""
Weekly Agent Performance Report

Generates a Google Sheets report with agent metrics:
- Stage progression: Offers Made, Contracts Sent, Under Contract, Closed
- Call metrics from FUB API

Can be run automatically via GitHub Actions or manually triggered.
"""

import os
import sys
import argparse
import base64
import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Dict, List, Any, Optional

# Eastern timezone for week boundaries
EASTERN_TZ = ZoneInfo("America/New_York")
from pathlib import Path

# Load .env file from project root (for local development)
try:
    from dotenv import load_dotenv
    # Look for .env in parent directory (project root)
    env_path = Path(__file__).resolve().parent.parent / '.env'
    load_dotenv(env_path)
except ImportError:
    pass  # dotenv not required in production (GitHub Actions)

import psycopg2
import psycopg2.extras
import requests
import gspread
from google.oauth2.service_account import Credentials

# Configuration from environment
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
FUB_API_KEY = os.getenv("FUB_API_KEY")
GOOGLE_SHEETS_CREDENTIALS = os.getenv("GOOGLE_SHEETS_CREDENTIALS")  # JSON string
# Weekly Agent Report spreadsheet ID
WEEKLY_AGENT_SHEET_ID = "1MNnP-w70h7gv7NnpRxO6GZstq9m6wW5USAozzCev6gs"

# Stage names to track (must match exactly what's in the database)
TRACKED_STAGES = [
    "ACQ - Offers Made",
    "ACQ - Contract Sent",
    "ACQ - Under Contract",
    "Closed",
    "ACQ - Closed Won",
]


def get_date_range(days_back: int = None, previous_week: bool = False) -> tuple[datetime, datetime]:
    """
    Calculate the date range for the report.

    Modes:
    - previous_week=True: Returns the full previous week (Mon 00:00 to Sun 23:59 Eastern)
    - days_back specified: Simple "last N days" calculation
    - Default (auto): On Monday, returns previous week. Otherwise, returns current week so far.

    All modes use Monday-Sunday week boundaries in Eastern timezone to match FUB's standard report format.
    """
    # Use Eastern timezone for week boundaries
    now_eastern = datetime.now(EASTERN_TZ)

    if days_back is not None:
        # Legacy behavior: simple days-back calculation
        end_date = now_eastern
        start_date = end_date - timedelta(days=days_back)
        return start_date, end_date

    # weekday() returns 0 for Monday, 6 for Sunday
    days_since_monday = now_eastern.weekday()

    # Determine if we should report on previous week
    # On Monday (weekday=0), auto mode reports the previous full week
    use_previous_week = previous_week or (days_since_monday == 0)

    if use_previous_week:
        # Previous week: Monday through Sunday of last week
        # First, find the start of the current week (Monday 00:00 Eastern)
        start_of_current_week = now_eastern - timedelta(days=days_since_monday)
        start_of_current_week = start_of_current_week.replace(hour=0, minute=0, second=0, microsecond=0)

        # Previous week starts 7 days before current week
        start_date = start_of_current_week - timedelta(days=7)

        # Previous week ends at the end of Sunday (start of current week)
        end_date = start_of_current_week
    else:
        # Current week: Monday through now
        start_of_week = now_eastern - timedelta(days=days_since_monday)
        start_date = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now_eastern

    return start_date, end_date


def query_stage_metrics(start_date: datetime, end_date: datetime) -> Dict[str, Dict[str, int]]:
    """
    Query Supabase for stage change metrics grouped by agent.
    Returns: {agent_name: {stage_name: count, ...}, ...}
    """
    if not SUPABASE_DB_URL:
        print("ERROR: SUPABASE_DB_URL not set")
        sys.exit(1)

    conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
    metrics = {}

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            # Query stage changes within date range, grouped by agent and stage
            cur.execute("""
                SELECT
                    COALESCE(assigned_user_name, 'Unassigned') as agent,
                    stage_to,
                    COUNT(*) as count
                FROM stage_changes
                WHERE changed_at >= %s
                  AND changed_at < %s
                  AND stage_to IN %s
                GROUP BY assigned_user_name, stage_to
                ORDER BY assigned_user_name, stage_to
            """, (start_date, end_date, tuple(TRACKED_STAGES)))

            for row in cur.fetchall():
                agent = row['agent']
                stage = row['stage_to']
                count = row['count']

                if agent not in metrics:
                    metrics[agent] = {s: 0 for s in TRACKED_STAGES}
                metrics[agent][stage] = count

    finally:
        conn.close()

    return metrics


def get_fub_users() -> Dict[str, int]:
    """
    Get mapping of FUB user names to IDs.
    Returns: {user_name: user_id, ...}
    """
    if not FUB_API_KEY:
        print("WARNING: FUB_API_KEY not set, skipping call metrics")
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
        else:
            print(f"WARNING: Failed to fetch FUB users: {response.status_code}")
            return {}

    except Exception as e:
        print(f"WARNING: Error fetching FUB users: {e}")
        return {}


def query_call_metrics(start_date: datetime, end_date: datetime, user_ids: Dict[str, int]) -> Dict[str, Dict[str, Any]]:
    """
    Query FUB API for detailed call metrics per agent.
    Note: FUB API doesn't filter by userId, so we fetch all calls and group client-side.
    Returns: {agent_name: {calls: int, connected: int, conversations: int, talk_time_min: int}, ...}
    """
    if not FUB_API_KEY or not user_ids:
        return {}

    auth_string = base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()

    # Format dates for FUB API
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')

    # Fetch ALL calls for the date range (API doesn't filter by userId)
    all_calls = []
    offset = 0
    limit = 100

    print("  Fetching all calls from FUB API...")
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
                print(f"WARNING: Failed to fetch calls: {response.status_code}")
                break
        except Exception as e:
            print(f"WARNING: Error fetching calls: {e}")
            break

    print(f"  Total calls fetched: {len(all_calls)}")

    # Build reverse lookup: userId -> userName
    user_id_to_name = {v: k for k, v in user_ids.items()}

    # Initialize metrics for all users
    call_metrics = {}
    for user_name in user_ids.keys():
        call_metrics[user_name] = {
            'outbound_calls': 0,
            'connected': 0,  # Outbound calls >= 1 min (for connection rate)
            'conversations': 0,  # All calls (inbound + outbound) >= 2 min
            'talk_time_min': 0,
            'long_call_durations': [],  # Track durations for calls >= 2 min to calculate average
            'outbound_call_details': [],  # For multi-dial sequence analysis
            'unique_leads_dialed': set(),  # Track unique personIds for leads dialed
            'unique_leads_connected': set(),  # Track unique personIds for conversations (2+ min)
            'single_dial_calls': 0,
            'double_dial_sequences': 0,
            'triple_dial_sequences': 0,
            'multi_dial_calls': 0,  # Total calls that are part of any 2x+ sequence
        }

    # Group calls by userId and calculate metrics
    # FUB definitions (from https://help.followupboss.com/hc/en-us/articles/360014186693-Call-Reporting):
    # - Calls Made = Outgoing calls only (isIncoming=False)
    # - Connected = Calls with duration >= 60 seconds (1 minute)
    # - Conversations = ANY call (inbound or outbound) with duration >= 120 seconds (2 minutes)
    # - Talk Time = Total duration of all calls
    # Custom metric:
    # - Connection Rate = Connected / Outbound Calls (measures how often outbound calls reach someone)
    for call in all_calls:
        call_user_id = call.get('userId')
        call_user_name = call.get('userName')
        is_outgoing = call.get('isIncoming') == False
        duration = call.get('duration', 0) or 0

        # Try to match by userId first, then by userName
        agent_name = None
        if call_user_id in user_id_to_name:
            agent_name = user_id_to_name[call_user_id]
        elif call_user_name in user_ids:
            agent_name = call_user_name

        if agent_name and agent_name in call_metrics:
            # Only count outgoing calls as "Outbound Calls"
            if is_outgoing:
                call_metrics[agent_name]['outbound_calls'] += 1

                # Connected = outbound calls >= 1 min (used for connection rate)
                if duration >= 60:
                    call_metrics[agent_name]['connected'] += 1

                # Collect call details for multi-dial sequence analysis
                to_number = call.get('toNumber')
                created = call.get('created')
                if to_number and created:
                    call_metrics[agent_name]['outbound_call_details'].append({
                        'to_number': to_number,
                        'created': created,
                    })

                # Track unique leads dialed (by personId)
                person_id = call.get('personId')
                if person_id:
                    call_metrics[agent_name]['unique_leads_dialed'].add(person_id)

            # Conversations = ANY call (inbound or outbound) >= 2 min
            # This matches FUB's definition: "Calls lasting 2 minutes or more"
            if duration >= 120:
                call_metrics[agent_name]['conversations'] += 1
                # Track durations for average calculation
                call_metrics[agent_name]['long_call_durations'].append(duration)
                # Track unique leads with conversations
                person_id = call.get('personId')
                if person_id:
                    call_metrics[agent_name]['unique_leads_connected'].add(person_id)

            # Talk time includes all calls with duration
            if duration > 0:
                call_metrics[agent_name]['talk_time_min'] += duration

    # Convert total duration from seconds to minutes
    for agent_name in call_metrics:
        call_metrics[agent_name]['talk_time_min'] = call_metrics[agent_name]['talk_time_min'] // 60

    # Analyze multi-dial sequences for each agent
    # A sequence is consecutive calls to the same number with <= 2 min between each call
    for agent_name in call_metrics:
        calls = call_metrics[agent_name]['outbound_call_details']
        if not calls:
            # No calls - convert sets to counts and set defaults
            call_metrics[agent_name]['unique_leads_dialed'] = len(call_metrics[agent_name]['unique_leads_dialed'])
            call_metrics[agent_name]['unique_leads_connected'] = len(call_metrics[agent_name]['unique_leads_connected'])
            call_metrics[agent_name]['single_dial_calls'] = 0
            del call_metrics[agent_name]['outbound_call_details']
            continue

        # Sort calls by timestamp
        calls.sort(key=lambda x: x['created'])

        total_multi_dial_calls = 0
        double_sequences = 0
        triple_sequences = 0

        i = 0
        while i < len(calls):
            current_number = calls[i]['to_number']
            sequence_length = 1

            j = i + 1
            while j < len(calls):
                # Parse timestamps and check time difference
                prev_time = datetime.fromisoformat(calls[j-1]['created'].replace('Z', '+00:00'))
                curr_time = datetime.fromisoformat(calls[j]['created'].replace('Z', '+00:00'))
                time_diff = (curr_time - prev_time).total_seconds()

                # Same number and within 2 minutes of previous call = part of sequence
                if calls[j]['to_number'] == current_number and time_diff <= 120:
                    sequence_length += 1
                    j += 1
                else:
                    break

            # Count the sequence
            if sequence_length >= 3:
                triple_sequences += 1
                total_multi_dial_calls += sequence_length
            elif sequence_length == 2:
                double_sequences += 1
                total_multi_dial_calls += sequence_length

            # Move to next unprocessed call
            i = j if j > i + 1 else i + 1

        call_metrics[agent_name]['double_dial_sequences'] = double_sequences
        call_metrics[agent_name]['triple_dial_sequences'] = triple_sequences
        call_metrics[agent_name]['multi_dial_calls'] = total_multi_dial_calls
        call_metrics[agent_name]['single_dial_calls'] = call_metrics[agent_name]['outbound_calls'] - total_multi_dial_calls

        # Convert unique leads sets to counts and clean up raw data
        call_metrics[agent_name]['unique_leads_dialed'] = len(call_metrics[agent_name]['unique_leads_dialed'])
        call_metrics[agent_name]['unique_leads_connected'] = len(call_metrics[agent_name]['unique_leads_connected'])
        del call_metrics[agent_name]['outbound_call_details']

    return call_metrics


def write_to_google_sheets(
    stage_metrics: Dict[str, Dict[str, int]],
    call_metrics: Dict[str, Dict[str, Any]],
    start_date: datetime,
    end_date: datetime
) -> str:
    """
    Write the report to Google Sheets with two tabs:
    - "Latest" tab: Current week's full report (overwritten each run)
    - "History" tab: Appends summary row per agent (most recent at top)

    Returns the URL to the spreadsheet.
    """
    if not GOOGLE_SHEETS_CREDENTIALS:
        print("ERROR: GOOGLE_SHEETS_CREDENTIALS not set")
        sys.exit(1)

    # Parse credentials from JSON string
    creds_dict = json.loads(GOOGLE_SHEETS_CREDENTIALS)

    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]

    credentials = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    client = gspread.authorize(credentials)

    # Open the spreadsheet
    spreadsheet = client.open_by_key(WEEKLY_AGENT_SHEET_ID)
    existing_tabs = [ws.title for ws in spreadsheet.worksheets()]

    # Prepare header row for Latest tab
    latest_headers = [
        "Agent",
        "Offers Made",
        "Contracts Sent",
        "Under Contract",
        "Closed",
        "Outbound Calls",
        "Unique Leads Dialed",
        "Unique Leads Connected",
        "Conversations (2+ min)",
        "Connection Rate",
        "Talk Time (min)",
        "Avg Call (min)",
        "Single Dial",
        "2x Sequences",
        "3x Sequences",
    ]

    # Prepare header row for History tab (includes week column)
    history_headers = [
        "Week Starting",
        "Agent",
        "Offers Made",
        "Contracts Sent",
        "Under Contract",
        "Closed",
        "Outbound Calls",
        "Unique Leads Dialed",
        "Unique Leads Connected",
        "Conversations (2+ min)",
        "Connection Rate",
        "Talk Time (min)",
        "Avg Call (min)",
        "Single Dial",
        "2x Sequences",
        "3x Sequences",
    ]

    # Collect agent data
    all_agents = set(stage_metrics.keys()) | set(call_metrics.keys())
    all_agents.discard('Unassigned')

    agent_rows = []
    week_label = start_date.strftime('%Y-%m-%d')

    for agent in sorted(all_agents):
        stage_data = stage_metrics.get(agent, {})
        offers = stage_data.get("ACQ - Offers Made", 0)
        contracts = stage_data.get("ACQ - Contract Sent", 0)
        under_contract = stage_data.get("ACQ - Under Contract", 0)
        closed = stage_data.get("Closed", 0) + stage_data.get("ACQ - Closed Won", 0)

        call_data = call_metrics.get(agent, {})
        outbound_calls = call_data.get('outbound_calls', 0)
        unique_leads = call_data.get('unique_leads_dialed', 0)
        unique_leads_connected = call_data.get('unique_leads_connected', 0)
        connected = call_data.get('connected', 0)
        conversations = call_data.get('conversations', 0)
        long_call_durations = call_data.get('long_call_durations', [])
        avg_call_min = round(sum(long_call_durations) / len(long_call_durations) / 60, 1) if long_call_durations else 0
        talk_time = call_data.get('talk_time_min', 0)
        connection_rate = f"{round(connected / outbound_calls * 100)}%" if outbound_calls > 0 else "0%"
        single_dial = call_data.get('single_dial_calls', 0)
        double_sequences = call_data.get('double_dial_sequences', 0)
        triple_sequences = call_data.get('triple_dial_sequences', 0)

        # Row for Latest tab (no week column)
        latest_row = [agent, offers, contracts, under_contract, closed, outbound_calls, unique_leads, unique_leads_connected, conversations, connection_rate, talk_time, avg_call_min, single_dial, double_sequences, triple_sequences]

        # Row for History tab (with week column)
        history_row = [week_label, agent, offers, contracts, under_contract, closed, outbound_calls, unique_leads, unique_leads_connected, conversations, connection_rate, talk_time, avg_call_min, single_dial, double_sequences, triple_sequences]

        agent_rows.append({'latest': latest_row, 'history': history_row})

    # === Write to "Latest" tab ===
    print("  Writing to 'Latest' tab...")
    if "Latest" in existing_tabs:
        latest_ws = spreadsheet.worksheet("Latest")
        latest_ws.clear()
    else:
        latest_ws = spreadsheet.add_worksheet(title="Latest", rows=100, cols=20, index=0)

    latest_rows = [latest_headers]
    for row_data in agent_rows:
        latest_rows.append(row_data['latest'])

    # Add unassigned row if exists
    if 'Unassigned' in stage_metrics:
        stage_data = stage_metrics['Unassigned']
        offers = stage_data.get("ACQ - Offers Made", 0)
        contracts = stage_data.get("ACQ - Contract Sent", 0)
        under_contract = stage_data.get("ACQ - Under Contract", 0)
        closed = stage_data.get("Closed", 0) + stage_data.get("ACQ - Closed Won", 0)
        latest_rows.append(["Unassigned", offers, contracts, under_contract, closed, 0, 0, 0, 0, "0%", 0, 0, 0, 0, 0])

    # Add metadata
    latest_rows.append([])
    latest_rows.append(["Report Generated:", datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')])
    latest_rows.append(["Date Range:", f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}"])

    latest_ws.update(latest_rows, 'A1')
    latest_ws.format('A1:O1', {'textFormat': {'bold': True}})

    # === Write to "History" tab ===
    print("  Writing to 'History' tab...")
    if "History" in existing_tabs:
        history_ws = spreadsheet.worksheet("History")
        # Check if this week's data already exists (avoid duplicates)
        existing_data = history_ws.get_all_values()
        if existing_data and len(existing_data) > 1:
            # Check if this week is already in the history
            existing_weeks = [row[0] for row in existing_data[1:]]  # Skip header
            if week_label in existing_weeks:
                print(f"  Week {week_label} already exists in History, skipping...")
            else:
                # Insert new rows at row 2 (after header)
                new_rows = [row_data['history'] for row_data in agent_rows]
                history_ws.insert_rows(new_rows, row=2)
        else:
            # Empty sheet, just add header and data
            history_rows = [history_headers] + [row_data['history'] for row_data in agent_rows]
            history_ws.update(history_rows, 'A1')
            history_ws.format('A1:P1', {'textFormat': {'bold': True}})
    else:
        # Create new History tab
        history_ws = spreadsheet.add_worksheet(title="History", rows=1000, cols=20, index=1)
        history_rows = [history_headers] + [row_data['history'] for row_data in agent_rows]
        history_ws.update(history_rows, 'A1')
        history_ws.format('A1:P1', {'textFormat': {'bold': True}})

    return f"https://docs.google.com/spreadsheets/d/{WEEKLY_AGENT_SHEET_ID}/edit"


def main():
    parser = argparse.ArgumentParser(description='Generate weekly agent performance report')
    parser.add_argument(
        '--days',
        type=int,
        default=None,
        help='Number of days to include in report (overrides week boundaries)'
    )
    parser.add_argument(
        '--previous-week',
        action='store_true',
        help='Report on the previous full week (Mon-Sun) instead of current week'
    )
    parser.add_argument(
        '--no-sheet',
        action='store_true',
        help='Skip writing to Google Sheets (for mid-week email-only reports)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Print report to console without writing to Google Sheets'
    )
    args = parser.parse_args()

    # Determine report type for logging
    now = datetime.now(timezone.utc)
    is_monday = now.weekday() == 0

    if args.days is not None:
        print(f"Generating agent report for the last {args.days} days...")
    elif args.previous_week:
        print("Generating agent report for previous week (Mon-Sun)...")
    elif is_monday:
        print("Monday detected - generating report for previous week (Mon-Sun)...")
    else:
        print("Generating agent report for current week (Mon-Sun) so far...")

    # Calculate date range
    start_date, end_date = get_date_range(args.days, args.previous_week)
    print(f"Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")

    # Get stage metrics from database
    print("Querying stage metrics from database...")
    stage_metrics = query_stage_metrics(start_date, end_date)
    print(f"Found metrics for {len(stage_metrics)} agents")

    # Get call metrics from FUB API
    print("Fetching FUB users...")
    fub_users = get_fub_users()
    print(f"Found {len(fub_users)} FUB users")

    print("Querying call metrics from FUB API...")
    call_metrics = query_call_metrics(start_date, end_date, fub_users)
    print(f"Retrieved call data for {len(call_metrics)} users")

    def print_report_to_console(title_suffix=""):
        """Helper to print report data to console."""
        print("\n" + "=" * 100)
        print(f"AGENT PERFORMANCE REPORT{title_suffix}")
        print(f"Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
        print("=" * 100)

        # Print header rows (split into two lines for readability)
        print(f"\n{'Agent':<25} {'Offers':<7} {'Contracts':<10} {'Under K':<8} {'Closed':<7} {'Outbound':<9} {'Leads':<7} {'Connected':<10} {'Convos':<7} {'ConnRate':<9} {'Talk(m)':<8} {'Avg(m)':<7} {'Single':<7} {'2x':<4} {'3x':<4}")
        print("-" * 140)

        all_agents = set(stage_metrics.keys()) | set(call_metrics.keys())
        for agent in sorted(all_agents):
            stage_data = stage_metrics.get(agent, {})
            offers = stage_data.get("ACQ - Offers Made", 0)
            contracts = stage_data.get("ACQ - Contract Sent", 0)
            under_contract = stage_data.get("ACQ - Under Contract", 0)
            closed = stage_data.get("Closed", 0) + stage_data.get("ACQ - Closed Won", 0)

            call_data = call_metrics.get(agent, {})
            outbound_calls = call_data.get('outbound_calls', 0)
            unique_leads = call_data.get('unique_leads_dialed', 0)
            unique_connected = call_data.get('unique_leads_connected', 0)
            connected = call_data.get('connected', 0)
            conversations = call_data.get('conversations', 0)
            long_call_durations = call_data.get('long_call_durations', [])
            avg_call_min = round(sum(long_call_durations) / len(long_call_durations) / 60, 1) if long_call_durations else 0
            talk_time = call_data.get('talk_time_min', 0)
            connection_rate = f"{round(connected / outbound_calls * 100)}%" if outbound_calls > 0 else "0%"
            single_dial = call_data.get('single_dial_calls', 0)
            double_seq = call_data.get('double_dial_sequences', 0)
            triple_seq = call_data.get('triple_dial_sequences', 0)

            # Truncate long agent names for display
            display_name = agent[:24] if len(agent) > 24 else agent
            print(f"{display_name:<25} {offers:<7} {contracts:<10} {under_contract:<8} {closed:<7} {outbound_calls:<9} {unique_leads:<7} {unique_connected:<10} {conversations:<7} {connection_rate:<9} {talk_time:<8} {avg_call_min:<7} {single_dial:<7} {double_seq:<4} {triple_seq:<4}")

    if args.dry_run:
        # Dry run - print to console only
        print_report_to_console(" (DRY RUN)")
        print("\n(Dry run - no data written to Google Sheets)")
    elif args.no_sheet:
        # Mid-week email-only run - no Google Sheet tab
        print_report_to_console(" (MID-WEEK)")
        print("\n(Mid-week report - no Google Sheet tab created)")
        # TODO: Send email when email functionality is implemented
        print("(Email functionality not yet implemented)")
    else:
        # Full report - write to Google Sheets
        print("Writing report to Google Sheets...")
        sheet_url = write_to_google_sheets(stage_metrics, call_metrics, start_date, end_date)
        print(f"\nReport created successfully!")
        print(f"View report: {sheet_url}")


if __name__ == '__main__':
    main()
