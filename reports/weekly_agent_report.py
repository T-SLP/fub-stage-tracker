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
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional

import psycopg2
import psycopg2.extras
import requests
import gspread
from google.oauth2.service_account import Credentials

# Configuration from environment
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
FUB_API_KEY = os.getenv("FUB_API_KEY")
GOOGLE_SHEETS_CREDENTIALS = os.getenv("GOOGLE_SHEETS_CREDENTIALS")  # JSON string
GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID")  # The spreadsheet ID to write to

# Stage names to track (must match exactly what's in the database)
TRACKED_STAGES = [
    "ACQ - Offers Made",
    "ACQ - Contract Sent",
    "ACQ - Under Contract",
    "Closed",
    "ACQ - Closed Won",
]


def get_date_range(days_back: int = 7) -> tuple[datetime, datetime]:
    """Calculate the date range for the report."""
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days_back)
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


def query_call_metrics(start_date: datetime, end_date: datetime, user_ids: Dict[str, int]) -> Dict[str, int]:
    """
    Query FUB API for call counts per agent.
    Returns: {agent_name: call_count, ...}
    """
    if not FUB_API_KEY or not user_ids:
        return {}

    auth_string = base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()
    call_counts = {}

    # Format dates for FUB API
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')

    for user_name, user_id in user_ids.items():
        try:
            # Query calls for this user within date range
            response = requests.get(
                'https://api.followupboss.com/v1/calls',
                params={
                    'userId': user_id,
                    'createdAfter': start_str,
                    'createdBefore': end_str,
                    'limit': 1000  # Get count via pagination metadata if available
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
                call_counts[user_name] = len(calls)

                # Check if there are more pages (pagination)
                metadata = data.get('_metadata', {})
                total = metadata.get('total')
                if total is not None:
                    call_counts[user_name] = total
            else:
                print(f"WARNING: Failed to fetch calls for {user_name}: {response.status_code}")
                call_counts[user_name] = 0

        except Exception as e:
            print(f"WARNING: Error fetching calls for {user_name}: {e}")
            call_counts[user_name] = 0

    return call_counts


def write_to_google_sheets(
    stage_metrics: Dict[str, Dict[str, int]],
    call_metrics: Dict[str, int],
    start_date: datetime,
    end_date: datetime
) -> str:
    """
    Write the report to Google Sheets as a new tab.
    Returns the URL to the new sheet.
    """
    if not GOOGLE_SHEETS_CREDENTIALS:
        print("ERROR: GOOGLE_SHEETS_CREDENTIALS not set")
        sys.exit(1)

    if not GOOGLE_SHEET_ID:
        print("ERROR: GOOGLE_SHEET_ID not set")
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
    spreadsheet = client.open_by_key(GOOGLE_SHEET_ID)

    # Create tab name with date range
    tab_name = f"Week {start_date.strftime('%m/%d')} - {end_date.strftime('%m/%d/%Y')}"

    # Check if tab already exists, if so add a timestamp
    existing_tabs = [ws.title for ws in spreadsheet.worksheets()]
    if tab_name in existing_tabs:
        tab_name = f"{tab_name} ({datetime.utcnow().strftime('%H%M')})"

    # Create new worksheet
    worksheet = spreadsheet.add_worksheet(title=tab_name, rows=100, cols=10)

    # Prepare header row
    headers = [
        "Agent",
        "Offers Made",
        "Contracts Sent",
        "Under Contract",
        "Closed",
        "Total Calls"
    ]

    # Prepare data rows
    all_agents = set(stage_metrics.keys()) | set(call_metrics.keys())
    all_agents.discard('Unassigned')  # Put unassigned at end if it exists

    rows = [headers]

    for agent in sorted(all_agents):
        stage_data = stage_metrics.get(agent, {})
        offers = stage_data.get("ACQ - Offers Made", 0)
        contracts = stage_data.get("ACQ - Contract Sent", 0)
        under_contract = stage_data.get("ACQ - Under Contract", 0)
        closed = stage_data.get("Closed", 0) + stage_data.get("ACQ - Closed Won", 0)
        calls = call_metrics.get(agent, 0)

        rows.append([agent, offers, contracts, under_contract, closed, calls])

    # Add unassigned row at the end if it exists
    if 'Unassigned' in stage_metrics:
        stage_data = stage_metrics['Unassigned']
        offers = stage_data.get("ACQ - Offers Made", 0)
        contracts = stage_data.get("ACQ - Contract Sent", 0)
        under_contract = stage_data.get("ACQ - Under Contract", 0)
        closed = stage_data.get("Closed", 0) + stage_data.get("ACQ - Closed Won", 0)
        rows.append(["Unassigned", offers, contracts, under_contract, closed, 0])

    # Add report metadata at the bottom
    rows.append([])
    rows.append(["Report Generated:", datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')])
    rows.append(["Date Range:", f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}"])

    # Write all data
    worksheet.update(rows, 'A1')

    # Format header row (bold)
    worksheet.format('A1:F1', {'textFormat': {'bold': True}})

    return f"https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}/edit#gid={worksheet.id}"


def main():
    parser = argparse.ArgumentParser(description='Generate weekly agent performance report')
    parser.add_argument(
        '--days',
        type=int,
        default=7,
        help='Number of days to include in report (default: 7)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Print report to console without writing to Google Sheets'
    )
    args = parser.parse_args()

    print(f"Generating agent report for the last {args.days} days...")

    # Calculate date range
    start_date, end_date = get_date_range(args.days)
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

    if args.dry_run:
        # Print to console instead of writing to sheets
        print("\n" + "=" * 60)
        print("AGENT PERFORMANCE REPORT (DRY RUN)")
        print(f"Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
        print("=" * 60)

        print(f"\n{'Agent':<25} {'Offers':<8} {'Contracts':<10} {'Under K':<9} {'Closed':<8} {'Calls':<8}")
        print("-" * 68)

        all_agents = set(stage_metrics.keys()) | set(call_metrics.keys())
        for agent in sorted(all_agents):
            stage_data = stage_metrics.get(agent, {})
            offers = stage_data.get("ACQ - Offers Made", 0)
            contracts = stage_data.get("ACQ - Contract Sent", 0)
            under_contract = stage_data.get("ACQ - Under Contract", 0)
            closed = stage_data.get("Closed", 0) + stage_data.get("ACQ - Closed Won", 0)
            calls = call_metrics.get(agent, 0)

            print(f"{agent:<25} {offers:<8} {contracts:<10} {under_contract:<9} {closed:<8} {calls:<8}")

        print("\n(Dry run - no data written to Google Sheets)")
    else:
        # Write to Google Sheets
        print("Writing report to Google Sheets...")
        sheet_url = write_to_google_sheets(stage_metrics, call_metrics, start_date, end_date)
        print(f"\nReport created successfully!")
        print(f"View report: {sheet_url}")


if __name__ == '__main__':
    main()
