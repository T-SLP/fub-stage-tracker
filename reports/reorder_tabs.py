#!/usr/bin/env python3
"""
Reorder Google Sheets tabs from newest to oldest (left to right).

Parses tab names like "Week 01/12 - 01/17/2026" and sorts by end date descending.
"""

import os
import json
import re
from datetime import datetime
from pathlib import Path

# Load .env file from project root
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / '.env'
    load_dotenv(env_path)
except ImportError:
    pass

import gspread
from google.oauth2.service_account import Credentials

GOOGLE_SHEETS_CREDENTIALS = os.getenv("GOOGLE_SHEETS_CREDENTIALS")
GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID")


def parse_tab_date(title: str) -> datetime | None:
    """
    Parse the end date from a tab title like "Week 01/12 - 01/17/2026".
    Returns None if the title doesn't match the expected format.
    """
    # Match patterns like "Week 01/12 - 01/17/2026" or "Week 01/12 - 01/17/2026 (1430)"
    match = re.search(r'Week \d{2}/\d{2} - (\d{2}/\d{2}/\d{4})', title)
    if match:
        date_str = match.group(1)
        try:
            return datetime.strptime(date_str, '%m/%d/%Y')
        except ValueError:
            return None
    return None


def reorder_tabs():
    """Reorder all weekly report tabs from newest to oldest."""
    if not GOOGLE_SHEETS_CREDENTIALS:
        print("ERROR: GOOGLE_SHEETS_CREDENTIALS not set")
        print("Add it to your .env file or set it as an environment variable")
        return

    if not GOOGLE_SHEET_ID:
        print("ERROR: GOOGLE_SHEET_ID not set")
        print("Add it to your .env file or set it as an environment variable")
        return

    # Authenticate
    creds_dict = json.loads(GOOGLE_SHEETS_CREDENTIALS)
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    credentials = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    client = gspread.authorize(credentials)

    # Open spreadsheet
    spreadsheet = client.open_by_key(GOOGLE_SHEET_ID)
    worksheets = spreadsheet.worksheets()

    print(f"Found {len(worksheets)} tabs")
    print("\nCurrent tab order:")
    for i, ws in enumerate(worksheets):
        print(f"  {i}: {ws.title}")

    # Separate weekly report tabs from other tabs
    weekly_tabs = []
    other_tabs = []

    for ws in worksheets:
        date = parse_tab_date(ws.title)
        if date:
            weekly_tabs.append((ws, date))
        else:
            other_tabs.append(ws)

    if not weekly_tabs:
        print("\nNo weekly report tabs found to reorder.")
        return

    # Sort weekly tabs by date descending (newest first)
    weekly_tabs.sort(key=lambda x: x[1], reverse=True)

    print(f"\nFound {len(weekly_tabs)} weekly report tabs to reorder")
    print(f"Found {len(other_tabs)} other tabs (will be moved to end)")

    # Reorder: weekly tabs first (newest to oldest), then other tabs
    print("\nReordering tabs...")

    for i, (ws, date) in enumerate(weekly_tabs):
        print(f"  Moving '{ws.title}' to position {i}")
        spreadsheet.reorder_worksheets([ws], start_index=i)

    # Move other tabs after weekly tabs
    for i, ws in enumerate(other_tabs):
        new_index = len(weekly_tabs) + i
        print(f"  Moving '{ws.title}' to position {new_index}")
        spreadsheet.reorder_worksheets([ws], start_index=new_index)

    print("\nDone! New tab order:")
    # Refresh worksheet list
    worksheets = spreadsheet.worksheets()
    for i, ws in enumerate(worksheets):
        print(f"  {i}: {ws.title}")


if __name__ == '__main__':
    reorder_tabs()
