#!/usr/bin/env python3
"""
Live webhook monitoring script for testing real lead transitions
"""

import os
import psycopg2
import time
from datetime import datetime

SUPABASE_DB_URL = 'postgresql://postgres.jefrfayzrxfcjeviwfhw:UnVen%25SUBJd%26%237%40@aws-0-us-east-2.pooler.supabase.com:6543/postgres'

def monitor_webhooks():
    print("LIVE WEBHOOK MONITORING STARTED")
    print("Waiting for you to move a lead to 'ACQ - Offers Made'...")
    print("Monitoring for webhook-sourced entries in real-time...\n")

    try:
        conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')

        # Get baseline count
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM stage_changes WHERE source LIKE 'wh_%'")
        baseline_count = cur.fetchone()[0]

        print(f"Baseline webhook entries: {baseline_count}")
        print("Watching for new entries...\n")

        last_count = baseline_count
        start_time = datetime.now()

        while True:
            cur.execute("""
                SELECT COUNT(*) as total_webhooks,
                       COUNT(*) FILTER (WHERE stage_to = 'ACQ - Offers Made') as offers_made
                FROM stage_changes
                WHERE source LIKE 'wh_%'
            """)

            total_webhooks, offers_made = cur.fetchone()

            if total_webhooks > last_count:
                # New webhook detected!
                print(f"NEW WEBHOOK DETECTED! Total: {total_webhooks} (+{total_webhooks - last_count})")

                # Get the latest webhook entry
                cur.execute("""
                    SELECT first_name, last_name, stage_from, stage_to, changed_at, source, lead_source_tag
                    FROM stage_changes
                    WHERE source LIKE 'wh_%'
                    ORDER BY changed_at DESC
                    LIMIT 1
                """)

                latest = cur.fetchone()
                if latest:
                    name, lastname, stage_from, stage_to, changed_at, source, lead_source = latest
                    elapsed = (datetime.now() - start_time).total_seconds()

                    print(f"CAPTURED: {name} {lastname}")
                    print(f"   Transition: {stage_from} -> {stage_to}")
                    print(f"   Time: {changed_at}")
                    print(f"   Source: {source}")
                    print(f"   Lead Source: {lead_source or 'None'}")
                    print(f"   Elapsed since start: {elapsed:.1f} seconds")

                    if stage_to == 'ACQ - Offers Made':
                        print(f"SUCCESS: OFFERS MADE TRANSITION CAPTURED!")
                        print(f"   Total webhook offers: {offers_made}")
                        break

                last_count = total_webhooks

            # Show alive indicator every 10 seconds
            elapsed = (datetime.now() - start_time).total_seconds()
            if int(elapsed) % 10 == 0 and elapsed > 0:
                print(f"Monitoring active... {int(elapsed)}s elapsed")

            time.sleep(1)

    except KeyboardInterrupt:
        print("\nMonitoring stopped")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    monitor_webhooks()