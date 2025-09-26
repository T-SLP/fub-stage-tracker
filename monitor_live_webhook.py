#!/usr/bin/env python3
"""
Live webhook monitoring for real FUB stage transitions
"""

import psycopg2
import time
from datetime import datetime

SUPABASE_DB_URL = 'postgresql://postgres.jefrfayzrxfcjeviwfhw:UnVen%25SUBJd%26%237%40@aws-0-us-east-2.pooler.supabase.com:6543/postgres'

def monitor_for_offers_made():
    print("LIVE MONITORING: Watching for 'ACQ - Offers Made' transitions")
    print("Please move a lead to 'ACQ - Offers Made' in FUB now...")
    print("Monitoring webhook database entries in real-time...")

    try:
        conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')

        # Get baseline count
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM stage_changes WHERE source LIKE 'wh_%' AND stage_to = 'ACQ - Offers Made'")
        baseline_offers = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM stage_changes WHERE source LIKE 'wh_%'")
        baseline_total = cur.fetchone()[0]

        print(f"Baseline: {baseline_offers} offers made, {baseline_total} total webhooks")
        print("Waiting for new entries...")

        last_offers = baseline_offers
        last_total = baseline_total
        start_time = datetime.now()

        while True:
            cur.execute("""
                SELECT COUNT(*) as total_webhooks,
                       COUNT(*) FILTER (WHERE stage_to = 'ACQ - Offers Made') as offers_made
                FROM stage_changes
                WHERE source LIKE 'wh_%'
            """)

            total_webhooks, offers_made = cur.fetchone()

            if total_webhooks > last_total:
                print(f"NEW WEBHOOK! Total: {total_webhooks} (+{total_webhooks - last_total})")

                # Get latest webhook entry
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
                    print(f"   {stage_from} -> {stage_to}")
                    print(f"   Time: {changed_at}")
                    print(f"   Source: {source}")
                    print(f"   Lead Source: {lead_source or 'None'}")
                    print(f"   Processing time: {elapsed:.1f}s")

                    if stage_to == 'ACQ - Offers Made':
                        print("SUCCESS! 'ACQ - Offers Made' transition captured!")
                        print("The webhook processing is working correctly!")
                        break

                last_total = total_webhooks

            if offers_made > last_offers:
                print(f"OFFERS MADE COUNT INCREASED! Now: {offers_made}")
                last_offers = offers_made

            # Status update every 10 seconds
            elapsed = (datetime.now() - start_time).total_seconds()
            if int(elapsed) % 10 == 0 and elapsed > 0:
                print(f"Still monitoring... {int(elapsed)}s elapsed (move a lead to 'ACQ - Offers Made' now)")

            time.sleep(1)

    except KeyboardInterrupt:
        print("Monitoring stopped by user")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    monitor_for_offers_made()