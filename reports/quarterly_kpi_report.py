#!/usr/bin/env python3
"""
Quarterly KPI Report Generator

Generates a Google Sheets report with key performance indicators:

Auto-populated metrics:
- Total Qualified Leads
- Throw-away Leads
- Net Total Leads (Qualified - Throwaway)
- Total Offers
- ReadyMode Leads (cold calling)
- SMS Leads (Roor + Smarter Contact)
- Unknown/Other Leads
- Conversion Rate (Closed / Qualified)
- Deals Closed
- Contract-to-Close Rate (based on current state of contracts from period)
- Contracts Closed / Fell Through / Still Pending
- Pipeline Deals (all deals currently under contract)

Manual entry columns:
- Cost per Lead
- Cost per Deal
- Avg Deal Gross Profit
- Number of Sold Properties

Supports custom date ranges for quarterly or any period reporting.
"""

import os
import sys
import argparse
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Tuple
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
import gspread
from google.oauth2.service_account import Credentials

# Configuration from environment
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
GOOGLE_SHEETS_CREDENTIALS = os.getenv("GOOGLE_SHEETS_CREDENTIALS")
# KPI Reports spreadsheet ID
KPI_REPORTS_SPREADSHEET_ID = "1R0BE0ceLaPN7eA5EjyxBamePzOO9BhQgogwBNxZFxNY"

# Qualified stages (leads moving FROM these are considered throwaway if they go to disqualified)
QUALIFIED_STAGES = [
    'ACQ - Qualified',
    'Qualified Phase 2 - Day 3 to 2 Weeks',
    'Qualified Phase 3 - 2 Weeks to 4 Weeks'
]

# Disqualified stages (throwaway destination)
DISQUALIFIED_STAGES = [
    'ACQ - Price Motivated',
    'ACQ - Not Interested',
    'ACQ - Not Ready to Sell',
    'ACQ - Dead / DNC'
]


def parse_date(date_str: str) -> datetime:
    """Parse a date string in YYYY-MM-DD format to datetime."""
    return datetime.strptime(date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)


def get_quarter_dates(quarter: int, year: int) -> Tuple[datetime, datetime]:
    """Get start and end dates for a specific quarter."""
    quarter_starts = {
        1: (1, 1),   # Jan 1
        2: (4, 1),   # Apr 1
        3: (7, 1),   # Jul 1
        4: (10, 1)   # Oct 1
    }

    start_month, start_day = quarter_starts[quarter]
    start_date = datetime(year, start_month, start_day, tzinfo=timezone.utc)

    # End date is last day of the quarter
    if quarter == 4:
        end_date = datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
    else:
        next_quarter_month = quarter_starts[quarter + 1][0]
        end_date = datetime(year, next_quarter_month, 1, tzinfo=timezone.utc) - timedelta(seconds=1)

    return start_date, end_date


def query_kpi_metrics(start_date: datetime, end_date: datetime) -> Dict[str, Any]:
    """
    Query Supabase for all KPI metrics within the date range.
    Returns a dictionary with all calculated metrics.
    """
    if not SUPABASE_DB_URL:
        print("ERROR: SUPABASE_DB_URL not set")
        sys.exit(1)

    conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
    metrics = {}

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            # 1. Total Qualified Leads
            cur.execute("""
                SELECT COUNT(*) as count
                FROM stage_changes
                WHERE changed_at >= %s
                  AND changed_at < %s
                  AND stage_to = 'ACQ - Qualified'
            """, (start_date, end_date))
            metrics['total_qualified'] = cur.fetchone()['count']

            # 2. Throw-away Leads (from qualified stages to disqualified stages)
            cur.execute("""
                SELECT COUNT(*) as count
                FROM stage_changes
                WHERE changed_at >= %s
                  AND changed_at < %s
                  AND stage_from IN %s
                  AND stage_to IN %s
            """, (start_date, end_date, tuple(QUALIFIED_STAGES), tuple(DISQUALIFIED_STAGES)))
            metrics['throwaway_leads'] = cur.fetchone()['count']

            # 3. Net Total Leads (calculated)
            metrics['net_total_leads'] = metrics['total_qualified'] - metrics['throwaway_leads']

            # 4. Total Offers
            cur.execute("""
                SELECT COUNT(*) as count
                FROM stage_changes
                WHERE changed_at >= %s
                  AND changed_at < %s
                  AND stage_to = 'ACQ - Offers Made'
            """, (start_date, end_date))
            metrics['total_offers'] = cur.fetchone()['count']

            # 5. ReadyMode Leads (cold calling) - qualified leads with ReadyMode source
            cur.execute("""
                SELECT COUNT(*) as count
                FROM stage_changes
                WHERE changed_at >= %s
                  AND changed_at < %s
                  AND stage_to = 'ACQ - Qualified'
                  AND lead_source_tag = 'ReadyMode'
            """, (start_date, end_date))
            metrics['readymode_leads'] = cur.fetchone()['count']

            # 6. SMS Leads (Roor + Smarter Contact) - qualified leads with SMS sources
            cur.execute("""
                SELECT COUNT(*) as count
                FROM stage_changes
                WHERE changed_at >= %s
                  AND changed_at < %s
                  AND stage_to = 'ACQ - Qualified'
                  AND lead_source_tag IN ('Roor', 'Smarter Contact')
            """, (start_date, end_date))
            metrics['sms_leads'] = cur.fetchone()['count']

            # 6b. Unknown/Other Leads (NULL or unrecognized lead_source_tag)
            cur.execute("""
                SELECT COUNT(*) as count
                FROM stage_changes
                WHERE changed_at >= %s
                  AND changed_at < %s
                  AND stage_to = 'ACQ - Qualified'
                  AND (lead_source_tag IS NULL
                       OR lead_source_tag NOT IN ('ReadyMode', 'Roor', 'Smarter Contact'))
            """, (start_date, end_date))
            metrics['unknown_leads'] = cur.fetchone()['count']

            # 7. Deals Closed
            cur.execute("""
                SELECT COUNT(*) as count
                FROM stage_changes
                WHERE changed_at >= %s
                  AND changed_at < %s
                  AND stage_to = 'Closed'
            """, (start_date, end_date))
            metrics['deals_closed'] = cur.fetchone()['count']

            # 8. Conversion Rate (Closed / Qualified * 100)
            if metrics['total_qualified'] > 0:
                metrics['conversion_rate'] = round(
                    (metrics['deals_closed'] / metrics['total_qualified']) * 100, 2
                )
            else:
                metrics['conversion_rate'] = 0.0

            # 9. Contract-to-Close Rate with Lead Details
            # Find leads that entered "Under Contract" during the report period,
            # then check their CURRENT (most recent) stage to determine outcome
            cur.execute("""
                WITH under_contract_leads AS (
                    -- Get all person_ids that entered Under Contract during the period
                    -- Also get their name from when they entered under contract
                    SELECT DISTINCT ON (person_id)
                        person_id,
                        first_name,
                        last_name,
                        changed_at as contract_date
                    FROM stage_changes
                    WHERE changed_at >= %s
                      AND changed_at < %s
                      AND stage_to = 'ACQ - Under Contract'
                    ORDER BY person_id, changed_at ASC
                ),
                latest_stages AS (
                    -- For each of those leads, find their most recent stage
                    SELECT DISTINCT ON (sc.person_id)
                        sc.person_id,
                        ucl.first_name,
                        ucl.last_name,
                        ucl.contract_date,
                        sc.stage_to as current_stage,
                        sc.changed_at as last_stage_date
                    FROM stage_changes sc
                    INNER JOIN under_contract_leads ucl ON sc.person_id = ucl.person_id
                    ORDER BY sc.person_id, sc.changed_at DESC
                )
                SELECT
                    person_id,
                    first_name,
                    last_name,
                    contract_date,
                    current_stage,
                    last_stage_date,
                    CASE
                        WHEN current_stage = 'Closed' THEN 'closed'
                        WHEN current_stage = 'ACQ - Under Contract' THEN 'pending'
                        ELSE 'fell_through'
                    END as outcome
                FROM latest_stages
                ORDER BY outcome, last_stage_date DESC
            """, (start_date, end_date))

            # Categorize leads by outcome
            contracts_closed_list = []
            contracts_fell_through_list = []
            contracts_pending_list = []

            for row in cur.fetchall():
                lead_info = {
                    'person_id': row['person_id'],
                    'first_name': row['first_name'] or '',
                    'last_name': row['last_name'] or '',
                    'contract_date': row['contract_date'],
                    'current_stage': row['current_stage'],
                    'last_stage_date': row['last_stage_date']
                }

                if row['outcome'] == 'closed':
                    contracts_closed_list.append(lead_info)
                elif row['outcome'] == 'pending':
                    contracts_pending_list.append(lead_info)
                else:
                    contracts_fell_through_list.append(lead_info)

            metrics['contracts_closed'] = len(contracts_closed_list)
            metrics['contracts_fell_through'] = len(contracts_fell_through_list)
            metrics['contracts_still_pending'] = len(contracts_pending_list)

            # Store lead lists for detailed tabs
            metrics['contracts_closed_list'] = contracts_closed_list
            metrics['contracts_fell_through_list'] = contracts_fell_through_list
            metrics['contracts_pending_list'] = contracts_pending_list

            # Contract-to-Close Rate = Closed / (Closed + Fell Through) * 100
            # Excludes still-pending contracts from the calculation
            resolved_contracts = metrics['contracts_closed'] + metrics['contracts_fell_through']
            if resolved_contracts > 0:
                metrics['contract_to_close_rate'] = round(
                    (metrics['contracts_closed'] / resolved_contracts) * 100, 2
                )
            else:
                metrics['contract_to_close_rate'] = 0.0

            # 10. Pipeline Deals (Forward-Looking)
            # Get ALL leads whose current stage is "Under Contract" (regardless of when)
            cur.execute("""
                WITH latest_stages AS (
                    SELECT DISTINCT ON (person_id)
                        person_id,
                        first_name,
                        last_name,
                        stage_to as current_stage,
                        changed_at as stage_date
                    FROM stage_changes
                    ORDER BY person_id, changed_at DESC
                )
                SELECT person_id, first_name, last_name, stage_date
                FROM latest_stages
                WHERE current_stage = 'ACQ - Under Contract'
                ORDER BY stage_date DESC
            """)

            pipeline_deals_list = []
            for row in cur.fetchall():
                pipeline_deals_list.append({
                    'person_id': row['person_id'],
                    'first_name': row['first_name'] or '',
                    'last_name': row['last_name'] or '',
                    'stage_date': row['stage_date']
                })

            metrics['pipeline_deals'] = len(pipeline_deals_list)
            metrics['pipeline_deals_list'] = pipeline_deals_list

    finally:
        conn.close()

    return metrics


def create_fub_hyperlink(person_id: str, first_name: str, last_name: str) -> str:
    """Create a Google Sheets HYPERLINK formula for a FUB lead."""
    full_name = f"{first_name} {last_name}".strip() or "Unknown"
    url = f"https://app.followupboss.com/2/people/view/{person_id}"
    # Escape quotes in names
    full_name = full_name.replace('"', '""')
    return f'=HYPERLINK("{url}", "{full_name}")'


def create_lead_detail_tab(
    spreadsheet,
    tab_name: str,
    leads: list,
    columns: list,
    period_label: str
) -> None:
    """Create a worksheet tab with lead details."""
    if not leads:
        # Create empty tab with just headers
        worksheet = spreadsheet.add_worksheet(title=tab_name, rows=5, cols=len(columns))
        rows = [
            [tab_name],
            [period_label],
            [],
            columns,
            ["No leads in this category"]
        ]
        worksheet.update(rows, 'A1')
        worksheet.format('A1', {'textFormat': {'bold': True, 'fontSize': 12}})
        worksheet.format(f'A4:{chr(64 + len(columns))}4', {
            'textFormat': {'bold': True},
            'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 0.9}
        })
        return

    worksheet = spreadsheet.add_worksheet(title=tab_name, rows=len(leads) + 10, cols=len(columns))

    rows = [
        [tab_name],
        [period_label],
        [],
        columns
    ]

    for lead in leads:
        hyperlink = create_fub_hyperlink(
            lead['person_id'],
            lead['first_name'],
            lead['last_name']
        )

        if 'contract_date' in lead:
            # For contract-related tabs
            contract_date = lead['contract_date'].strftime('%Y-%m-%d') if lead['contract_date'] else ''
            current_stage = lead.get('current_stage', '')
            last_date = lead['last_stage_date'].strftime('%Y-%m-%d') if lead.get('last_stage_date') else ''
            rows.append([hyperlink, contract_date, current_stage, last_date])
        else:
            # For pipeline deals tab
            stage_date = lead['stage_date'].strftime('%Y-%m-%d') if lead['stage_date'] else ''
            rows.append([hyperlink, stage_date])

    # Add count at the bottom
    rows.append([])
    rows.append([f"Total: {len(leads)}"])

    worksheet.update(rows, 'A1', value_input_option='USER_ENTERED')

    # Format header rows
    worksheet.format('A1', {'textFormat': {'bold': True, 'fontSize': 12}})
    worksheet.format(f'A4:{chr(64 + len(columns))}4', {
        'textFormat': {'bold': True},
        'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 0.9}
    })


def write_to_google_sheets(
    metrics: Dict[str, Any],
    start_date: datetime,
    end_date: datetime,
    period_name: str = None
) -> str:
    """
    Add KPI report tabs to the existing spreadsheet.
    Creates separate tabs for summary and contract lead details.
    Returns the URL to the spreadsheet.
    """
    if not GOOGLE_SHEETS_CREDENTIALS:
        print("ERROR: GOOGLE_SHEETS_CREDENTIALS not set")
        sys.exit(1)

    creds_dict = json.loads(GOOGLE_SHEETS_CREDENTIALS)

    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]

    credentials = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    client = gspread.authorize(credentials)

    # Open the existing spreadsheet
    spreadsheet = client.open_by_key(KPI_REPORTS_SPREADSHEET_ID)
    print(f"Opened spreadsheet: {spreadsheet.title}")

    # Create tab name based on period
    if period_name:
        tab_name = f"{period_name} Summary"
    else:
        tab_name = f"KPIs {start_date.strftime('%m/%d/%Y')} - {end_date.strftime('%m/%d/%Y')}"

    # Check if tab already exists, if so add a timestamp
    existing_tabs = [ws.title for ws in spreadsheet.worksheets()]
    if tab_name in existing_tabs:
        tab_name = f"{tab_name} ({datetime.now(timezone.utc).strftime('%H%M')})"

    # Create new worksheet for the summary
    worksheet = spreadsheet.add_worksheet(title=tab_name, rows=30, cols=5)

    # Prepare the report data
    rows = [
        ["KPI Metrics Report"],
        [f"Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}"],
        [],
        ["Metric", "Value", "Notes"],
        ["Total Qualified Leads", metrics['total_qualified'], "Leads reaching ACQ - Qualified stage"],
        ["Throw-away Leads", metrics['throwaway_leads'], "Qualified leads moved to disqualified stages"],
        ["Net Total Leads", metrics['net_total_leads'], "Qualified - Throwaway"],
        ["Total Offers", metrics['total_offers'], "Leads reaching ACQ - Offers Made stage"],
        ["ReadyMode Leads", metrics['readymode_leads'], "Qualified leads from cold calling"],
        ["SMS Leads", metrics['sms_leads'], "Qualified leads from Roor + Smarter Contact"],
        ["Unknown/Other Leads", metrics['unknown_leads'], "Qualified leads with no source tag"],
        ["Conversion Rate", f"{metrics['conversion_rate']}%", "Deals Closed / Qualified Leads"],
        ["Deals Closed", metrics['deals_closed'], "Leads reaching Closed stage during period"],
        [],
        ["--- Contract Metrics ---", "", ""],
        ["Contract-to-Close Rate", f"{metrics['contract_to_close_rate']}%", "Closed / (Closed + Fell Through) for contracts in period"],
        ["Contracts Closed", metrics['contracts_closed'], "Under Contract → Closed"],
        ["Contracts Fell Through", metrics['contracts_fell_through'], "Under Contract → Any other stage"],
        ["Contracts Still Pending", metrics['contracts_still_pending'], "Still in Under Contract (excluded from rate)"],
        [],
        ["--- Forward-Looking ---", "", ""],
        ["Pipeline Deals", metrics['pipeline_deals'], "All deals currently in Under Contract stage"],
        [],
        ["--- Manual Entry Below ---", "", ""],
        ["Cost per Lead", "", "Enter manually"],
        ["Cost per Deal", "", "Enter manually"],
        ["Avg Deal Gross Profit", "", "Enter manually"],
        ["Number of Sold Properties", "", "Enter manually"],
        [],
        ["Report Generated:", datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC'), ""],
    ]

    worksheet.update(rows, 'A1')

    # Format header rows
    worksheet.format('A1', {'textFormat': {'bold': True, 'fontSize': 14}})
    worksheet.format('A4:C4', {'textFormat': {'bold': True}, 'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 0.9}})
    worksheet.format('A15', {'textFormat': {'bold': True, 'italic': True}})
    worksheet.format('A21', {'textFormat': {'bold': True, 'italic': True}})
    worksheet.format('A24', {'textFormat': {'bold': True, 'italic': True}})

    # Adjust column widths
    worksheet.set_basic_filter('A4:C28')

    # Create period label for detail tabs
    period_label = f"Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}"

    # Create base name for detail tabs (e.g., "Q4 2025" from "Q4 2025 Summary")
    base_name = tab_name.replace(" Summary", "").replace("KPIs ", "")

    # Create tab for Contracts Closed
    create_lead_detail_tab(
        spreadsheet,
        f"{base_name} - Contracts Closed",
        metrics.get('contracts_closed_list', []),
        ["Lead Name", "Contract Date", "Current Stage", "Closed Date"],
        period_label
    )

    # Create tab for Contracts Fell Through
    create_lead_detail_tab(
        spreadsheet,
        f"{base_name} - Contracts Fell Through",
        metrics.get('contracts_fell_through_list', []),
        ["Lead Name", "Contract Date", "Current Stage", "Last Stage Date"],
        period_label
    )

    # Create tab for Contracts Still Pending
    create_lead_detail_tab(
        spreadsheet,
        f"{base_name} - Contracts Pending",
        metrics.get('contracts_pending_list', []),
        ["Lead Name", "Contract Date", "Current Stage", "Last Stage Date"],
        period_label
    )

    return f"https://docs.google.com/spreadsheets/d/{spreadsheet.id}/edit"


def print_report(metrics: Dict[str, Any], start_date: datetime, end_date: datetime):
    """Print the report to console (dry run mode)."""
    print("\n" + "=" * 70)
    print("KPI METRICS REPORT")
    print(f"Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    print("=" * 70)

    print(f"\n{'Metric':<30} {'Value':>10}")
    print("-" * 42)
    print(f"{'Total Qualified Leads':<30} {metrics['total_qualified']:>10}")
    print(f"{'Throw-away Leads':<30} {metrics['throwaway_leads']:>10}")
    print(f"{'Net Total Leads':<30} {metrics['net_total_leads']:>10}")
    print(f"{'Total Offers':<30} {metrics['total_offers']:>10}")
    print(f"{'ReadyMode Leads (Cold Call)':<30} {metrics['readymode_leads']:>10}")
    print(f"{'SMS Leads (Text)':<30} {metrics['sms_leads']:>10}")
    print(f"{'Unknown/Other Leads':<30} {metrics['unknown_leads']:>10}")
    print(f"{'Conversion Rate':<30} {metrics['conversion_rate']:>9}%")
    print(f"{'Deals Closed':<30} {metrics['deals_closed']:>10}")
    print("-" * 42)

    print("\n--- Contract Metrics ---")
    print(f"{'Contract-to-Close Rate':<30} {metrics['contract_to_close_rate']:>9}%")
    print(f"{'Contracts Closed':<30} {metrics['contracts_closed']:>10}")
    print(f"{'Contracts Fell Through':<30} {metrics['contracts_fell_through']:>10}")
    print(f"{'Contracts Still Pending':<30} {metrics['contracts_still_pending']:>10}")
    print("-" * 42)

    print("\n--- Forward-Looking ---")
    print(f"{'Pipeline Deals':<30} {metrics['pipeline_deals']:>10}")
    print("-" * 42)

    # Print lead details for contract metrics
    def print_lead_list(title: str, leads: list, show_current_stage: bool = True):
        print(f"\n{title}")
        print("-" * 70)
        if not leads:
            print("  (No leads)")
            return
        for lead in leads:
            name = f"{lead['first_name']} {lead['last_name']}".strip() or "Unknown"
            fub_url = f"https://app.followupboss.com/2/people/view/{lead['person_id']}"
            contract_date = lead.get('contract_date', lead.get('stage_date'))
            date_str = contract_date.strftime('%Y-%m-%d') if contract_date else 'N/A'
            if show_current_stage:
                current = lead.get('current_stage', 'N/A')
                print(f"  {name:<25} | Contract: {date_str} | Stage: {current}")
            else:
                print(f"  {name:<25} | Under Contract: {date_str}")
            print(f"    FUB: {fub_url}")

    print_lead_list(
        "CONTRACTS CLOSED:",
        metrics.get('contracts_closed_list', [])
    )
    print_lead_list(
        "CONTRACTS FELL THROUGH:",
        metrics.get('contracts_fell_through_list', [])
    )
    print_lead_list(
        "CONTRACTS STILL PENDING:",
        metrics.get('contracts_pending_list', [])
    )
    print_lead_list(
        "PIPELINE DEALS (All Under Contract):",
        metrics.get('pipeline_deals_list', []),
        show_current_stage=False
    )

    print("\n" + "-" * 42)
    print("\nManual entry fields (not populated):")
    print("  - Cost per Lead")
    print("  - Cost per Deal")
    print("  - Avg Deal Gross Profit")
    print("  - Number of Sold Properties")
    print("\n(Dry run - no data written to Google Sheets)")


def main():
    parser = argparse.ArgumentParser(
        description='Generate KPI report for a specific period',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate Q4 2024 report
  python quarterly_kpi_report.py --quarter 4 --year 2024

  # Generate report for custom date range
  python quarterly_kpi_report.py --start 2024-10-01 --end 2024-12-31

  # Dry run (preview without writing to Google Sheets)
  python quarterly_kpi_report.py --quarter 4 --year 2024 --dry-run
        """
    )

    # Date range options (mutually exclusive groups)
    date_group = parser.add_mutually_exclusive_group(required=True)
    date_group.add_argument(
        '--quarter',
        type=int,
        choices=[1, 2, 3, 4],
        help='Quarter number (1-4). Requires --year.'
    )
    date_group.add_argument(
        '--start',
        type=str,
        help='Start date in YYYY-MM-DD format. Requires --end.'
    )

    parser.add_argument(
        '--year',
        type=int,
        help='Year for quarterly report (required with --quarter)'
    )
    parser.add_argument(
        '--end',
        type=str,
        help='End date in YYYY-MM-DD format (required with --start)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Print report to console without writing to Google Sheets'
    )
    parser.add_argument(
        '--tab-name',
        type=str,
        help='Custom name for the Google Sheets tab'
    )

    args = parser.parse_args()

    # Validate arguments
    if args.quarter and not args.year:
        parser.error("--quarter requires --year")
    if args.start and not args.end:
        parser.error("--start requires --end")

    # Determine date range
    if args.quarter:
        start_date, end_date = get_quarter_dates(args.quarter, args.year)
        period_name = args.tab_name or f"Q{args.quarter} {args.year}"
        print(f"Generating Q{args.quarter} {args.year} KPI report...")
    else:
        start_date = parse_date(args.start)
        end_date = parse_date(args.end).replace(hour=23, minute=59, second=59)
        period_name = args.tab_name

    print(f"Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")

    # Query metrics
    print("Querying KPI metrics from database...")
    metrics = query_kpi_metrics(start_date, end_date)
    print("Metrics calculated successfully")

    if args.dry_run:
        print_report(metrics, start_date, end_date)
    else:
        print("Writing report to Google Sheets...")
        sheet_url = write_to_google_sheets(metrics, start_date, end_date, period_name)
        print(f"\nReport created successfully!")
        print(f"View report: {sheet_url}")


if __name__ == '__main__':
    main()
