#!/usr/bin/env python3
"""
Lead Daily Hot Sheet - Main Script
Generates daily reports of overdue leads based on stage-specific contact frequency rules

Migrated to GitHub Actions from Lead-Daily-Hot-Sheet project.
"""

import os
import sys
import base64
import requests
import smtplib
import ssl
import psycopg2
from datetime import datetime, timedelta
from collections import defaultdict
from tabulate import tabulate
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

# Load .env file from project root (for local development)
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / '.env'
    load_dotenv(env_path)
except ImportError:
    pass  # dotenv not required in production (GitHub Actions)

# Load configuration
from hot_sheet_config import (
    STAGE_CONTACT_RULES,
    PRIORITY_LEVELS,
    EMAIL_SUBJECT,
    INCLUDE_CAMPAIGN_INFO,
    INCLUDE_CUSTOM_FIELDS,
    EXCLUDE_STAGES,
    FETCH_ONLY_STAGES,
    USE_BUSINESS_DAYS_ONLY,
    OFFER_STAGES,
    SHOW_ALL_LEADS_STAGES
)

# Environment variables
FUB_API_KEY = os.getenv('FUB_API_KEY')
FUB_SYSTEM_KEY = os.getenv('FUB_SYSTEM_KEY')
FUB_SUBDOMAIN = os.getenv('FUB_SUBDOMAIN', 'synergylandpartners')
SUPABASE_DB_URL = os.getenv('SUPABASE_DB_URL')

# Email configuration - matches weekly_agent_report.py pattern
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_FROM = os.getenv("EMAIL_FROM", "travis@synergylandpartners.com")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")  # Gmail app password
EMAIL_TO = ["travis@synergylandpartners.com", "acquisitions@synergylandpartners.com"]

# Global database connection
db_conn = None


def calculate_business_days(start_date, end_date):
    """Calculate number of business days between two dates"""
    days = 0
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:  # Monday = 0, Friday = 4
            days += 1
        current += timedelta(days=1)
    return days


def calculate_hours_since(date_str):
    """Calculate hours since a given date string"""
    try:
        last_activity = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        now = datetime.now(last_activity.tzinfo)
        return (now - last_activity).total_seconds() / 3600  # Convert to hours
    except Exception as e:
        print(f"Error calculating hours: {e}")
        return 0


def get_last_communication_date(person):
    """
    Get the most recent communication date for a person.
    Priority: lastCommunication > max(lastCall, lastEmail, lastText) > lastActivity

    Note: FUB returns lastCommunication as a dict with 'date' property,
    not as a string. We need to extract the date.
    """
    # Try lastCommunication first
    last_comm = person.get('lastCommunication')
    if last_comm:
        # lastCommunication is a dict with structure: {'id': ..., 'date': '...', 'type': '...'}
        if isinstance(last_comm, dict) and 'date' in last_comm:
            return last_comm['date']
        # Fallback for string format (shouldn't happen with current FUB API)
        elif isinstance(last_comm, str):
            return last_comm

    # Fallback: Find most recent of lastCall, lastEmail, lastText
    communication_dates = []
    for field in ['lastCall', 'lastEmail', 'lastText']:
        if person.get(field):
            communication_dates.append(person.get(field))

    if communication_dates:
        # Sort and return most recent
        communication_dates.sort(reverse=True)
        return communication_dates[0]

    # Final fallback: use lastActivity
    return person.get('lastActivity')


def connect_to_database():
    """Connect to the Supabase database"""
    global db_conn
    if db_conn is None and SUPABASE_DB_URL:
        try:
            db_conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
        except Exception as e:
            print(f"Warning: Could not connect to database: {e}")
            print("  Stage timing data will not be available")
    return db_conn


def get_stage_timing_data(person_id):
    """
    Get stage timing data for a person from the database.
    Returns: (first_qualified_date, current_stage_entry_date)
    """
    conn = connect_to_database()
    if not conn:
        return None, None

    # Convert person_id to string since database stores as text
    person_id_str = str(person_id)

    try:
        with conn.cursor() as cur:
            # Get the first time person entered 'ACQ - Qualified' stage
            cur.execute("""
                SELECT MIN(changed_at) as first_qualified
                FROM stage_changes
                WHERE person_id = %s
                  AND stage_to = 'ACQ - Qualified'
            """, (person_id_str,))

            result = cur.fetchone()
            first_qualified = result[0] if result and result[0] else None

            # Get when person entered their current stage (most recent stage change)
            cur.execute("""
                SELECT changed_at, stage_to
                FROM stage_changes
                WHERE person_id = %s
                ORDER BY changed_at DESC
                LIMIT 1
            """, (person_id_str,))

            result = cur.fetchone()
            current_stage_entry = result[0] if result and result[0] else None

            return first_qualified, current_stage_entry

    except Exception as e:
        print(f"Error querying stage timing for person {person_id}: {e}")
        return None, None


def get_offer_dates(person_ids):
    """
    Query stage_changes for when each lead first entered 'ACQ - Offers Made'.
    Returns: {person_id: offer_date, ...}
    """
    conn = connect_to_database()
    if not conn or not person_ids:
        return {}

    try:
        with conn.cursor() as cur:
            # Get the first time each person entered 'ACQ - Offers Made'
            cur.execute("""
                SELECT person_id, MIN(changed_at) as offer_date
                FROM stage_changes
                WHERE person_id = ANY(%s)
                  AND stage_to = 'ACQ - Offers Made'
                GROUP BY person_id
            """, ([str(pid) for pid in person_ids],))

            result = {}
            for row in cur.fetchall():
                result[str(row[0])] = row[1]
            return result

    except Exception as e:
        print(f"Error querying offer dates: {e}")
        return {}


def get_calls_since_offer(person_ids, offer_dates):
    """
    Query FUB calls API and count dials and connections since offer date.
    - dials: outbound calls (isIncoming=False) after offer_date
    - connections: outbound calls >= 120 seconds (2 min) after offer_date

    Returns: {person_id: {'dials': N, 'connections': M}, ...}
    """
    if not person_ids or not offer_dates or not FUB_API_KEY:
        return {}

    # Initialize results
    result = {str(pid): {'dials': 0, 'connections': 0} for pid in person_ids}

    # Find earliest offer date to limit API query
    valid_dates = [d for d in offer_dates.values() if d]
    if not valid_dates:
        return result

    earliest_offer = min(valid_dates)
    start_str = (earliest_offer - timedelta(days=1)).strftime('%Y-%m-%d')
    end_str = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')

    # Fetch calls from FUB API
    auth_string = base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()
    all_calls = []
    offset = 0
    limit = 100

    print("  Fetching calls from FUB API for offer follow-up metrics...")

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
                print(f"  Warning: Failed to fetch calls: {response.status_code}")
                break
        except Exception as e:
            print(f"  Warning: Error fetching calls: {e}")
            break

    print(f"  Total calls fetched: {len(all_calls)}")

    # Process calls
    target_person_ids = {str(pid) for pid in person_ids}

    for call in all_calls:
        person_id = call.get('personId')
        if not person_id:
            continue

        person_id_str = str(person_id)
        if person_id_str not in target_person_ids:
            continue

        # Only count outbound calls
        if call.get('isIncoming') == True:
            continue

        created = call.get('created')
        if not created:
            continue

        try:
            call_date = datetime.fromisoformat(created.replace('Z', '+00:00')).date()
            offer_date = offer_dates.get(person_id_str)
            if not offer_date:
                continue

            if hasattr(offer_date, 'date'):
                offer_date = offer_date.date()

            if call_date >= offer_date:
                result[person_id_str]['dials'] += 1
                # Count connections (2+ min = 120+ seconds)
                duration = call.get('duration', 0) or 0
                if duration >= 120:
                    result[person_id_str]['connections'] += 1
        except Exception:
            continue

    return result


def format_time_display(hours):
    """
    Format time display: hours if < 48h, days if >= 48h
    """
    if hours < 48:
        return f"{hours:.1f} hrs"
    else:
        days = hours / 24
        return f"{days:.1f} days"


def check_tuesday_thursday_overdue(last_communication_date):
    """
    Check if a lead in Qualified Phase 3 needs contact based on Tuesday/Thursday rule.
    Returns True if the lead should be on the hot sheet.

    Logic: If today is Monday and they weren't called last Thursday, they should show up.
    They should show up the day after a missed Tuesday or Thursday.
    """
    if not last_communication_date:
        return True  # No communication = definitely overdue

    try:
        last_comm = datetime.fromisoformat(last_communication_date.replace('Z', '+00:00'))
        now = datetime.now(last_comm.tzinfo)

        # Get the weekday (0=Monday, 1=Tuesday, 3=Thursday, 6=Sunday)
        today_weekday = now.weekday()

        # Find the most recent Tuesday or Thursday
        days_since_tuesday = (today_weekday - 1) % 7
        days_since_thursday = (today_weekday - 3) % 7

        # Get the most recent Tuesday and Thursday dates
        last_tuesday = (now - timedelta(days=days_since_tuesday)).replace(hour=0, minute=0, second=0, microsecond=0)
        last_thursday = (now - timedelta(days=days_since_thursday)).replace(hour=0, minute=0, second=0, microsecond=0)

        # Determine which was more recent
        most_recent_contact_day = max(last_tuesday, last_thursday)

        # If last communication was before the most recent Tuesday/Thursday, flag as overdue
        if last_comm < most_recent_contact_day:
            return True

        return False

    except Exception as e:
        print(f"Error checking Tuesday/Thursday: {e}")
        return False


def fetch_all_leads_from_fub():
    """Fetch leads from Follow Up Boss - only stages we care about"""
    if FETCH_ONLY_STAGES:
        print(f"Fetching leads from Follow Up Boss (only {len(FETCH_ONLY_STAGES)} specific stages)...")
    else:
        print("Fetching leads from Follow Up Boss (all stages)...")

    auth_string = base64.b64encode(f'{FUB_API_KEY}:'.encode()).decode()

    # Build fields parameter to include custom fields AND communication fields
    base_fields = ['id', 'firstName', 'lastName', 'stage', 'lastCommunication', 'lastCall', 'lastEmail', 'lastText', 'lastActivity', 'emails', 'phones', 'assignedTo']
    fields = base_fields + INCLUDE_CUSTOM_FIELDS if INCLUDE_CAMPAIGN_INFO else base_fields
    fields_param = ','.join(fields)

    url = 'https://api.followupboss.com/v1/people'
    headers = {
        'Authorization': f'Basic {auth_string}',
        'X-System': 'LeadHotSheet',
        'X-System-Key': FUB_SYSTEM_KEY,
        'Content-Type': 'application/json'
    }

    all_people = []

    # If we're filtering by specific stages, fetch each stage separately using FUB's stage parameter
    # This is MUCH faster than fetching all leads and filtering in memory
    if FETCH_ONLY_STAGES:
        for stage in FETCH_ONLY_STAGES:
            print(f"\n  Fetching stage: {stage}")
            next_token = None
            page = 0

            while True:
                page += 1
                params = {
                    'limit': 100,
                    'fields': fields_param,
                    'stage': stage  # Filter by stage at API level
                }

                if next_token:
                    params['next'] = next_token

                try:
                    response = requests.get(url, headers=headers, params=params, timeout=30)

                    if response.status_code == 200:
                        data = response.json()
                        people = data.get('people', [])

                        all_people.extend(people)

                        print(f"    Page {page}: Fetched {len(people)} leads (total for this stage: {len(people)}, overall total: {len(all_people)})")

                        # Check for next page
                        metadata = data.get('_metadata', {})
                        next_token = metadata.get('next')

                        if not next_token:
                            break
                    else:
                        print(f"    Error fetching stage '{stage}': {response.status_code}")
                        print(f"    {response.text[:500]}")
                        break

                except Exception as e:
                    print(f"    Exception fetching stage '{stage}': {e}")
                    break

    else:
        # Fetch all leads (no stage filtering)
        next_token = None
        page = 0

        while True:
            page += 1
            params = {
                'limit': 100,
                'fields': fields_param
            }

            if next_token:
                params['next'] = next_token

            try:
                response = requests.get(url, headers=headers, params=params, timeout=30)

                if response.status_code == 200:
                    data = response.json()
                    people = data.get('people', [])

                    all_people.extend(people)

                    print(f"  Page {page}: Fetched {len(people)} leads (total: {len(all_people)})")

                    # Check for next page
                    metadata = data.get('_metadata', {})
                    next_token = metadata.get('next')

                    if not next_token:
                        break
                else:
                    print(f"Error fetching leads: {response.status_code}")
                    print(response.text[:500])
                    break

            except Exception as e:
                print(f"Exception fetching leads: {e}")
                break

    print(f"\nTotal leads fetched: {len(all_people)}")
    return all_people


def analyze_leads(leads):
    """Analyze leads to find overdue contacts based on stage-specific rules"""
    print("\nAnalyzing leads for overdue contacts...")

    overdue_leads = defaultdict(list)
    stats = {
        'total_analyzed': 0,
        'excluded_stages': 0,
        'no_contact_rule': 0,
        'up_to_date': 0,
        'overdue_by_priority': {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
    }

    for person in leads:
        stats['total_analyzed'] += 1

        stage = person.get('stage', 'Unknown')

        # Skip excluded stages
        if stage in EXCLUDE_STAGES:
            stats['excluded_stages'] += 1
            continue

        # Check if we have a contact rule for this stage
        if stage not in STAGE_CONTACT_RULES:
            stats['no_contact_rule'] += 1
            continue

        # Get the last communication date (not last activity)
        last_communication = get_last_communication_date(person)
        if not last_communication:
            continue

        # Get the stage rule configuration
        rule = STAGE_CONTACT_RULES[stage]
        priority = rule.get('priority', 'low')
        is_overdue = False
        hours_overdue = 0

        # Check if this stage has special logic (Tuesday/Thursday)
        if rule.get('special_logic') == 'check_tuesday_thursday':
            is_overdue = check_tuesday_thursday_overdue(last_communication)
            if is_overdue:
                # Calculate approximate hours for display purposes
                hours_overdue = calculate_hours_since(last_communication)
        else:
            # Standard hour-based threshold check
            threshold_hours = rule.get('threshold_hours')
            if threshold_hours:
                hours_since_contact = calculate_hours_since(last_communication)
                hours_overdue = hours_since_contact - threshold_hours
                is_overdue = hours_overdue > 0

        # Determine if we should include this lead
        # Include if: overdue OR stage is in SHOW_ALL_LEADS_STAGES
        should_include = is_overdue or stage in SHOW_ALL_LEADS_STAGES

        if should_include:
            if is_overdue:
                stats['overdue_by_priority'][priority] += 1
            else:
                stats['up_to_date'] += 1

            # Get stage timing data from database
            person_id = person.get('id')
            first_qualified, current_stage_entry = get_stage_timing_data(person_id)

            # Calculate lead age (hours since first qualified)
            lead_age_hours = None
            if first_qualified:
                now = datetime.now(first_qualified.tzinfo) if first_qualified.tzinfo else datetime.now()
                lead_age_hours = (now - first_qualified).total_seconds() / 3600

            # Calculate time in current stage
            time_in_stage_hours = None
            if current_stage_entry:
                now = datetime.now(current_stage_entry.tzinfo) if current_stage_entry.tzinfo else datetime.now()
                time_in_stage_hours = (now - current_stage_entry).total_seconds() / 3600

            overdue_leads[priority].append({
                'person_id': person_id,
                'first_name': person.get('firstName', ''),
                'last_name': person.get('lastName', ''),
                'stage': stage,
                'last_communication': last_communication,
                'hours_since_contact': calculate_hours_since(last_communication),
                'hours_overdue': hours_overdue,
                'is_overdue': is_overdue,  # Track overdue status
                'rule_description': rule.get('rule_description', ''),
                'priority': priority,
                'assigned_to': person.get('assignedTo', 'Unassigned'),
                'campaign_id': person.get('customCampaignID'),
                'email': person.get('emails', [{}])[0].get('value', '') if person.get('emails') else '',
                'phone': person.get('phones', [{}])[0].get('value', '') if person.get('phones') else '',
                # Property data
                'county': person.get('customParcelCounty'),
                'state': person.get('customParcelState'),
                'acreage': person.get('customAcreage'),
                'road_frontage': person.get('customRoadFrontageFT'),
                'market_total_value': person.get('customMarketTotalParcelValue'),
                'market_value_estimate': person.get('customMarketValueEstimate'),
                # Stage timing data
                'lead_age_hours': lead_age_hours,
                'time_in_stage_hours': time_in_stage_hours,
            })
        else:
            stats['up_to_date'] += 1

    return overdue_leads, stats


def enrich_with_offer_metrics(overdue_leads):
    """
    Enrich leads in offer stages with dials/connections since offer date.
    Modifies leads in place.
    """
    # Collect all person IDs for leads in offer stages
    offer_stage_person_ids = []
    for priority_leads in overdue_leads.values():
        for lead in priority_leads:
            if lead['stage'] in OFFER_STAGES:
                offer_stage_person_ids.append(lead['person_id'])

    if not offer_stage_person_ids:
        return

    print(f"\nEnriching {len(offer_stage_person_ids)} leads in offer stages with follow-up metrics...")

    # Get offer dates for these leads
    offer_dates = get_offer_dates(offer_stage_person_ids)

    # Get call metrics since offer
    call_metrics = get_calls_since_offer(offer_stage_person_ids, offer_dates)

    # Enrich leads with metrics
    for priority_leads in overdue_leads.values():
        for lead in priority_leads:
            if lead['stage'] in OFFER_STAGES:
                person_id_str = str(lead['person_id'])
                metrics = call_metrics.get(person_id_str, {'dials': 0, 'connections': 0})
                lead['dials_since_offer'] = metrics['dials']
                lead['connections_since_offer'] = metrics['connections']


def generate_console_report(overdue_leads, stats):
    """Generate console output report"""
    print("\n" + "="*80)
    print("LEAD DAILY HOT SHEET REPORT")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)

    print(f"\n[STATS] ANALYSIS SUMMARY:")
    print(f"  Total leads analyzed: {stats['total_analyzed']}")
    print(f"  Excluded (stage): {stats['excluded_stages']}")
    print(f"  No contact rule: {stats['no_contact_rule']}")
    print(f"  Up to date: {stats['up_to_date']}")

    total_overdue = sum(stats['overdue_by_priority'].values())
    print(f"\n[ALERT] OVERDUE CONTACTS: {total_overdue}")

    if total_overdue == 0:
        print("\n[SUCCESS] All leads are up to date!")
        return

    # Add explanatory definitions
    print("\n" + "-"*80)
    print("[DEFINITIONS]")
    print("-"*80)
    print("* Overdue: Time that has passed BEYOND the required contact frequency threshold")
    print("           for that stage (e.g., '2.7 days overdue' means contact was due 2.7")
    print("           days ago)")
    print()
    print("* Overall Lead Age: Total time since the lead first entered 'ACQ - Qualified' stage")
    print()
    print("* Status:")
    print("    - Critically Overdue: Lead has been in current stage for MORE than 30 days")
    print("    - Overdue: Lead is overdue but has been in current stage LESS than 30 days")
    print("-"*80)

    # Reorganize leads by stage instead of priority
    leads_by_stage = {}
    for priority_leads in overdue_leads.values():
        for lead in priority_leads:
            stage = lead['stage']
            if stage not in leads_by_stage:
                leads_by_stage[stage] = []
            leads_by_stage[stage].append(lead)

    # Define stage order (pipeline flow)
    stage_order = [
        'ACQ - Qualified',
        'Qualified Phase 2 - Day 3 to 2 Weeks',
        'Qualified Phase 3 - 2 Weeks to 4 Weeks',
        'ACQ - Needs Offer',
        'ACQ - Offers Made',
        'ACQ - Contract Sent'
    ]

    # Display overdue leads by stage
    for stage in stage_order:
        leads = leads_by_stage.get(stage, [])
        print(f"\n{stage.upper()} ({len(leads)} leads)")
        print("-" * 80)

        if len(leads) == 0:
            print("  [OK] All leads in this stage are up to date")
            continue

        # Sort: Critically overdue first, then overdue (by time overdue), then up-to-date (by time in stage)
        def sort_key(lead):
            is_overdue = lead.get('is_overdue', True)
            time_in_stage = lead.get('time_in_stage_hours', 0)
            hours_overdue = lead.get('hours_overdue', 0)
            # Priority: 0 = critically overdue, 1 = overdue, 2 = up to date
            if not is_overdue:
                priority = 2
            elif time_in_stage > 720:
                priority = 0
            else:
                priority = 1
            # Within each priority, sort by time (overdue by hours_overdue desc, up-to-date by time_in_stage desc)
            return (priority, -hours_overdue if is_overdue else 0, -time_in_stage)
        leads.sort(key=sort_key)

        # Prepare table data
        table_data = []
        # Add extra columns for offer stages
        is_offer_stage = stage in OFFER_STAGES

        for lead in leads:
            # Convert hours to readable format (show "-" for up-to-date leads)
            if not lead.get('is_overdue', True):
                time_display = '-'
            else:
                hours = lead['hours_overdue']
                time_display = format_time_display(hours)

            # Property data
            county = lead.get('county', '')
            state = lead.get('state', '')
            location = f"{county}, {state}" if county and state else (county or state or 'N/A')

            acreage = lead.get('acreage', 'N/A')
            if acreage and acreage != 'N/A':
                try:
                    acreage = f"{float(acreage):.1f}"
                except:
                    pass

            # Stage timing data
            lead_age = 'N/A'
            if lead.get('lead_age_hours'):
                lead_age = format_time_display(lead['lead_age_hours'])

            time_in_stage = 'N/A'
            if lead.get('time_in_stage_hours'):
                time_in_stage = format_time_display(lead['time_in_stage_hours'])

            # Determine status based on overdue state and time in stage
            if not lead.get('is_overdue', True):
                status = 'Up to Date'
            elif lead.get('time_in_stage_hours', 0) > 720:
                status = 'Critically Overdue'
            else:
                status = 'Overdue'

            # Property value data
            frontage = lead.get('road_frontage', 'N/A')
            if frontage and frontage != 'N/A':
                try:
                    frontage = f"{float(frontage):.0f} ft"
                except:
                    pass

            market_value = lead.get('market_total_value') or lead.get('market_value_estimate', 'N/A')
            if market_value and market_value != 'N/A':
                try:
                    market_value = f"${float(market_value):,.0f}"
                except:
                    pass

            row = [
                f"{lead['first_name']} {lead['last_name']}",
                status,
                time_display,
                lead_age,
                time_in_stage,
                lead['rule_description'],
                location,
                acreage,
                frontage,
                market_value,
                lead['assigned_to']
            ]

            # Add offer metrics for offer stages
            if is_offer_stage:
                row.append(lead.get('dials_since_offer', 0))
                row.append(lead.get('connections_since_offer', 0))

            table_data.append(row)

        headers = ['Name', 'Status', 'Overdue', 'Overall Lead Age', 'Time in Stage', 'Standard', 'Location', 'Acres', 'Frontage', 'Market Value', 'Assigned To']
        if is_offer_stage:
            headers.extend(['Dials Since Offer', 'Connections Since Offer'])

        print(tabulate(table_data, headers=headers, tablefmt='simple'))


def generate_html_email(overdue_leads, stats):
    """Generate HTML email body for the hot sheet report"""
    total_overdue = sum(stats['overdue_by_priority'].values())

    html = f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; }}
            h1 {{ color: #d32f2f; }}
            h2 {{ color: #424242; margin-top: 30px; }}
            table {{ border-collapse: collapse; width: 100%; margin-top: 15px; }}
            th {{ background-color: #f5f5f5; padding: 12px; text-align: left; border: 1px solid #ddd; font-weight: bold; }}
            td {{ padding: 10px; border: 1px solid #ddd; }}
            .critical {{ background-color: #ffebee; }}
            .high {{ background-color: #fff3e0; }}
            .medium {{ background-color: #fffde7; }}
            .stats {{ background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0; }}
            .success {{ color: #2e7d32; font-size: 18px; font-weight: bold; }}
            .low-followup {{ background-color: #fff3e0; color: #e65100; font-weight: bold; }}
            .up-to-date {{ background-color: #e8f5e9; }}
            .status-up-to-date {{ color: #2e7d32; font-weight: bold; }}
            .status-overdue {{ color: #e65100; font-weight: bold; }}
            .status-critical {{ color: #c62828; font-weight: bold; }}
        </style>
    </head>
    <body>
        <h1>Lead Daily Hot Sheet</h1>
        <p><strong>Generated:</strong> {datetime.now().strftime('%A, %B %d, %Y at %I:%M %p ET')}</p>

        <div class="stats">
            <h3>Summary</h3>
            <p><strong>Total Leads Analyzed:</strong> {stats['total_analyzed']}</p>
            <p><strong>Up to Date:</strong> {stats['up_to_date']}</p>
            <p><strong style="color: #d32f2f;">OVERDUE CONTACTS:</strong> {total_overdue}</p>
            <ul>
                <li><strong>Critical:</strong> {stats['overdue_by_priority']['critical']}</li>
                <li><strong>High:</strong> {stats['overdue_by_priority']['high']}</li>
                <li><strong>Medium:</strong> {stats['overdue_by_priority']['medium']}</li>
                <li><strong>Low:</strong> {stats['overdue_by_priority']['low']}</li>
            </ul>
        </div>

        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #1976d2;">
            <h3 style="margin-top: 0; color: #1976d2;">Definitions</h3>
            <ul style="line-height: 1.8;">
                <li><strong>Overdue:</strong> Time that has passed BEYOND the required contact frequency threshold for that stage (e.g., "2.7 days overdue" means contact was due 2.7 days ago)</li>
                <li><strong>Overall Lead Age:</strong> Total time since the lead first entered 'ACQ - Qualified' stage</li>
                <li><strong>Status:</strong>
                    <ul>
                        <li><strong>Critically Overdue:</strong> Lead has been in current stage for MORE than 30 days</li>
                        <li><strong>Overdue:</strong> Lead is overdue but has been in current stage LESS than 30 days</li>
                    </ul>
                </li>
                <li><strong>Dials Since Offer:</strong> Number of outbound calls made since the offer was originally sent (for Offers Made and Contract Sent stages)</li>
                <li><strong>Connections Since Offer:</strong> Number of calls lasting 2+ minutes since the offer was originally sent</li>
            </ul>
        </div>
    """

    if total_overdue == 0:
        html += '<p class="success">All leads are up to date! Great work!</p>'
    else:
        # Reorganize leads by stage instead of priority
        leads_by_stage = {}
        for priority_leads in overdue_leads.values():
            for lead in priority_leads:
                stage = lead['stage']
                if stage not in leads_by_stage:
                    leads_by_stage[stage] = []
                leads_by_stage[stage].append(lead)

        # Define stage order (pipeline flow)
        stage_order = [
            'ACQ - Qualified',
            'Qualified Phase 2 - Day 3 to 2 Weeks',
            'Qualified Phase 3 - 2 Weeks to 4 Weeks',
            'ACQ - Needs Offer',
            'ACQ - Offers Made',
            'ACQ - Contract Sent'
        ]

        # Display overdue leads by stage
        for stage in stage_order:
            leads = leads_by_stage.get(stage, [])
            is_offer_stage = stage in OFFER_STAGES

            # Determine background color based on stage
            if 'Needs Offer' in stage:
                stage_class = 'critical'
            elif 'Qualified' in stage or 'Offers' in stage or 'Contract' in stage:
                stage_class = 'high'
            else:
                stage_class = 'medium'

            html += f'<h2>{stage.upper()} ({len(leads)} leads)</h2>'

            if len(leads) == 0:
                html += '<p style="color: #2e7d32; margin-left: 20px;">All leads in this stage are up to date</p>'
                continue

            html += f'<table class="{stage_class}">'

            # Build header row - add extra columns for offer stages
            header_row = '<tr><th>Name</th><th>Status</th><th>Overdue</th><th>Overall Lead Age</th><th>Time in Stage</th><th>Standard</th><th>Location</th><th>Acres</th><th>Frontage</th><th>Market Value</th><th>Assigned To</th>'
            if is_offer_stage:
                header_row += '<th>Dials Since Offer</th><th>Connections Since Offer</th>'
            header_row += '</tr>'
            html += header_row

            # Sort: Critically overdue first, then overdue (by time overdue), then up-to-date (by time in stage)
            def sort_key(lead):
                is_overdue = lead.get('is_overdue', True)
                time_in_stage = lead.get('time_in_stage_hours', 0)
                hours_overdue = lead.get('hours_overdue', 0)
                if not is_overdue:
                    priority = 2
                elif time_in_stage > 720:
                    priority = 0
                else:
                    priority = 1
                return (priority, -hours_overdue if is_overdue else 0, -time_in_stage)
            leads.sort(key=sort_key)

            for lead in leads:
                # Show "-" for up-to-date leads
                if not lead.get('is_overdue', True):
                    time_display = '-'
                else:
                    hours = lead['hours_overdue']
                    time_display = format_time_display(hours)

                name = f"{lead['first_name']} {lead['last_name']}"
                person_id = lead.get('person_id')
                lead_url = f"https://{FUB_SUBDOMAIN}.followupboss.com/2/people/view/{person_id}" if person_id else None
                rule = lead['rule_description']

                # Determine status based on overdue state and time in stage
                if not lead.get('is_overdue', True):
                    status = 'Up to Date'
                    status_class = 'status-up-to-date'
                elif lead.get('time_in_stage_hours', 0) > 720:
                    status = 'Critically Overdue'
                    status_class = 'status-critical'
                else:
                    status = 'Overdue'
                    status_class = 'status-overdue'

                # Property data
                county = lead.get('county', '')
                state = lead.get('state', '')
                location = f"{county}, {state}" if county and state else (county or state or 'N/A')

                acreage = lead.get('acreage', 'N/A')
                if acreage and acreage != 'N/A':
                    try:
                        acreage = f"{float(acreage):.2f}"
                    except:
                        pass

                frontage = lead.get('road_frontage', 'N/A')
                if frontage and frontage != 'N/A':
                    try:
                        frontage = f"{float(frontage):.0f} ft"
                    except:
                        pass

                # Use Market Total Parcel Value or Market Value Estimate
                market_value = lead.get('market_total_value') or lead.get('market_value_estimate', 'N/A')
                if market_value and market_value != 'N/A':
                    try:
                        market_value = f"${float(market_value):,.0f}"
                    except:
                        pass

                # Stage timing data
                lead_age = 'N/A'
                if lead.get('lead_age_hours'):
                    lead_age = format_time_display(lead['lead_age_hours'])

                time_in_stage = 'N/A'
                if lead.get('time_in_stage_hours'):
                    time_in_stage = format_time_display(lead['time_in_stage_hours'])

                assigned_to = lead.get('assigned_to', 'Unassigned')

                name_cell = f'<a href="{lead_url}" style="color: #1976d2; text-decoration: none;">{name}</a>' if lead_url else name

                # For up-to-date leads, show "-" instead of overdue time
                if status == 'Up to Date':
                    time_display = '-'
                    row_class = 'up-to-date'
                else:
                    row_class = ''

                # Build row
                row = f'<tr class="{row_class}"><td>{name_cell}</td><td class="{status_class}">{status}</td><td><strong>{time_display}</strong></td><td>{lead_age}</td><td>{time_in_stage}</td><td>{rule}</td><td>{location}</td><td>{acreage}</td><td>{frontage}</td><td>{market_value}</td><td>{assigned_to}</td>'

                # Add offer metrics for offer stages with highlighting for low follow-up
                if is_offer_stage:
                    dials = lead.get('dials_since_offer', 0)
                    connections = lead.get('connections_since_offer', 0)

                    # Highlight if dials <= 2
                    if dials <= 2:
                        row += f'<td class="low-followup">{dials}</td>'
                    else:
                        row += f'<td>{dials}</td>'

                    # Highlight if connections <= 1
                    if connections <= 1:
                        row += f'<td class="low-followup">{connections}</td>'
                    else:
                        row += f'<td>{connections}</td>'

                row += '</tr>'
                html += row

            html += '</table>'

    html += """
        <br><br>
        <p style="color: #666; font-size: 12px;">
            This is an automated report from the Lead Daily Hot Sheet system.<br>
            Contact frequency rules are based on stage-specific requirements.
        </p>
    </body>
    </html>
    """

    return html


def send_email_report(overdue_leads, stats, dry_run=False):
    """Send email report via SMTP"""
    if dry_run:
        print("\n[DRY RUN] Email would be sent to:")
        for recipient in EMAIL_TO:
            print(f"  - {recipient}")
        return

    # Check if it's a weekend (Saturday=5, Sunday=6)
    today = datetime.now()
    if today.weekday() >= 5:
        print("\n[SKIP] Today is a weekend - no email will be sent (Monday-Friday only)")
        return

    # Validate email configuration
    if not all([EMAIL_FROM, EMAIL_PASSWORD, EMAIL_TO]):
        print("\n[ERROR] Email configuration incomplete")
        print("   Required: EMAIL_FROM, EMAIL_PASSWORD")
        return

    try:
        # Create message
        message = MIMEMultipart('alternative')
        message['From'] = EMAIL_FROM
        message['To'] = ', '.join(EMAIL_TO)

        total_overdue = sum(stats['overdue_by_priority'].values())
        if total_overdue > 0:
            message['Subject'] = f'Lead Hot Sheet - {total_overdue} Overdue Contacts - {datetime.now().strftime("%m/%d/%Y")}'
        else:
            message['Subject'] = f'Lead Hot Sheet - All Up to Date - {datetime.now().strftime("%m/%d/%Y")}'

        # Generate HTML content
        html_content = generate_html_email(overdue_leads, stats)

        # Attach HTML content
        html_part = MIMEText(html_content, 'html')
        message.attach(html_part)

        # Send email
        context = ssl.create_default_context()
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls(context=context)
            server.login(EMAIL_FROM, EMAIL_PASSWORD)
            server.sendmail(EMAIL_FROM, EMAIL_TO, message.as_string())

        print(f"\n[SUCCESS] Email sent to {len(EMAIL_TO)} recipient(s)")
        for recipient in EMAIL_TO:
            print(f"  - {recipient}")

    except Exception as e:
        print(f"\n[ERROR] Failed to send email: {e}")


def main():
    """Main execution"""
    dry_run = '--dry-run' in sys.argv

    if dry_run:
        print("[DRY RUN] DRY RUN MODE - No emails will be sent\n")

    # Validate configuration
    if not FUB_API_KEY:
        print("[ERROR] Error: FUB_API_KEY not set")
        return 1

    # Fetch leads from FUB
    leads = fetch_all_leads_from_fub()

    if not leads:
        print("[ERROR] No leads fetched from Follow Up Boss")
        return 1

    # Analyze leads
    overdue_leads, stats = analyze_leads(leads)

    # Enrich offer stage leads with dials/connections metrics
    enrich_with_offer_metrics(overdue_leads)

    # Generate reports
    generate_console_report(overdue_leads, stats)

    # Send email (if configured)
    if not dry_run:
        send_email_report(overdue_leads, stats)
    else:
        # In dry run, still generate the email HTML for preview
        send_email_report(overdue_leads, stats, dry_run=True)

    print("\n[SUCCESS] Report generation complete!")
    return 0


if __name__ == '__main__':
    sys.exit(main())
