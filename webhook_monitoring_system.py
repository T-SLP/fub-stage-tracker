#!/usr/bin/env python3
"""
FUB Stage Tracker - Webhook Monitoring and Alert System
Monitors webhook health and sends email alerts when issues are detected
"""

import smtplib
import ssl
import psycopg2
import requests
import time
import json
import os
import sys
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, List, Optional

# Configuration
SUPABASE_DB_URL = 'postgresql://postgres.jefrfayzrxfcjeviwfhw:UnVen%25SUBJd%26%237%40@aws-0-us-east-2.pooler.supabase.com:6543/postgres'
WEBHOOK_HEALTH_URL = 'https://fub-stage-tracker-production.up.railway.app/health'

# Email configuration - set these environment variables
SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
EMAIL_ADDRESS = os.getenv('ALERT_EMAIL_ADDRESS')  # Your Gmail address
EMAIL_PASSWORD = os.getenv('ALERT_EMAIL_PASSWORD')  # App password for Gmail
ALERT_RECIPIENT = os.getenv('ALERT_RECIPIENT')  # Who receives alerts

# Alert thresholds
WEBHOOK_SILENCE_THRESHOLD_HOURS = 2  # Alert if no webhooks for 2 hours
SERVER_DOWN_THRESHOLD_MINUTES = 5   # Alert if server unreachable for 5 minutes
WEBHOOK_FAILURE_RATE_THRESHOLD = 0.1  # Alert if >10% failure rate

class WebhookMonitor:
    def __init__(self):
        self.last_alert_times = {}
        self.alert_cooldown_hours = 1  # Don't spam alerts

    def check_database_health(self) -> Dict:
        """Check webhook processing health in database"""
        try:
            conn = psycopg2.connect(SUPABASE_DB_URL, sslmode='require')
            cur = conn.cursor()

            # Check recent webhook activity
            cur.execute('''
                SELECT COUNT(*)
                FROM stage_changes
                WHERE source LIKE 'wh_%'
                AND changed_at > NOW() - INTERVAL '2 hours'
            ''')
            recent_webhooks = cur.fetchone()[0]

            # Check last webhook time
            cur.execute('''
                SELECT MAX(changed_at)
                FROM stage_changes
                WHERE source LIKE 'wh_%'
            ''')
            last_webhook_time = cur.fetchone()[0]

            # Check total webhook count
            cur.execute('''
                SELECT COUNT(*)
                FROM stage_changes
                WHERE source LIKE 'wh_%'
            ''')
            total_webhooks = cur.fetchone()[0]

            conn.close()

            hours_since_last = None
            if last_webhook_time:
                hours_since_last = (datetime.now() - last_webhook_time.replace(tzinfo=None)).total_seconds() / 3600

            return {
                'status': 'healthy' if recent_webhooks > 0 else 'unhealthy',
                'recent_webhook_count': recent_webhooks,
                'last_webhook_time': last_webhook_time,
                'hours_since_last_webhook': hours_since_last,
                'total_webhook_count': total_webhooks,
                'error': None
            }

        except Exception as e:
            return {
                'status': 'error',
                'error': str(e),
                'recent_webhook_count': 0,
                'last_webhook_time': None,
                'hours_since_last_webhook': None,
                'total_webhook_count': 0
            }

    def check_server_health(self) -> Dict:
        """Check Railway webhook server health"""
        try:
            response = requests.get(WEBHOOK_HEALTH_URL, timeout=10)
            data = response.json()

            return {
                'status': 'healthy',
                'server_status': response.status_code,
                'uptime_hours': data.get('uptime_hours', 0),
                'version': data.get('version', 'unknown'),
                'webhook_stats': data.get('webhook_stats', {}),
                'error': None
            }

        except Exception as e:
            return {
                'status': 'error',
                'error': str(e),
                'server_status': None,
                'uptime_hours': None,
                'version': None,
                'webhook_stats': {}
            }

    def should_send_alert(self, alert_type: str) -> bool:
        """Check if enough time has passed since last alert of this type"""
        now = datetime.now()
        last_alert = self.last_alert_times.get(alert_type)

        if not last_alert:
            return True

        hours_since_last = (now - last_alert).total_seconds() / 3600
        return hours_since_last >= self.alert_cooldown_hours

    def send_email_alert(self, subject: str, body: str, alert_type: str):
        """Send email alert"""
        if not all([EMAIL_ADDRESS, EMAIL_PASSWORD, ALERT_RECIPIENT]):
            print(f"ALERT: {subject}")
            print(f"BODY: {body}")
            print("Email not configured - printed alert instead")
            return

        if not self.should_send_alert(alert_type):
            print(f"Alert cooldown active for {alert_type} - skipping email")
            return

        try:
            # Create message
            message = MIMEMultipart()
            message["From"] = EMAIL_ADDRESS
            message["To"] = ALERT_RECIPIENT
            message["Subject"] = f"ALERT - FUB Stage Tracker: {subject}"

            # Add body
            body_with_footer = f"""
{body}

---
FUB Stage Tracker Monitoring System
Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Server: {WEBHOOK_HEALTH_URL}
Database: Supabase

This is an automated alert. Reply to this email for support.
"""
            message.attach(MIMEText(body_with_footer, "plain"))

            # Send email
            context = ssl.create_default_context()
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls(context=context)
                server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
                server.sendmail(EMAIL_ADDRESS, ALERT_RECIPIENT, message.as_string())

            # Record alert time
            self.last_alert_times[alert_type] = datetime.now()
            print(f"[SUCCESS] Alert email sent: {subject}")

        except Exception as e:
            print(f"[ERROR] Failed to send email alert: {e}")
            print(f"ALERT: {subject}")
            print(f"BODY: {body}")

    def analyze_and_alert(self):
        """Main monitoring function - checks health and sends alerts"""
        print(f"[MONITOR] Monitoring webhook system - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        # Check database health
        db_health = self.check_database_health()
        print(f"Database: {db_health['status']} - Recent webhooks: {db_health['recent_webhook_count']}")

        # Check server health
        server_health = self.check_server_health()
        print(f"Server: {server_health['status']} - Uptime: {server_health['uptime_hours']}h")

        # Alert conditions
        alerts_sent = []

        # 1. Database connection issues
        if db_health['status'] == 'error':
            self.send_email_alert(
                "Database Connection Failed",
                f"Cannot connect to Supabase database.\n\nError: {db_health['error']}\n\nThis means webhook data cannot be stored or retrieved.",
                "database_error"
            )
            alerts_sent.append("database_error")

        # 2. No recent webhooks (webhook processing stopped)
        elif db_health['hours_since_last_webhook'] and db_health['hours_since_last_webhook'] > WEBHOOK_SILENCE_THRESHOLD_HOURS:
            self.send_email_alert(
                "Webhook Processing Stopped",
                f"No webhooks received for {db_health['hours_since_last_webhook']:.1f} hours.\n\n"
                f"Last webhook: {db_health['last_webhook_time']}\n"
                f"Recent webhook count: {db_health['recent_webhook_count']}\n\n"
                f"This means stage changes in FUB are not being captured in your dashboard.\n\n"
                f"Possible causes:\n"
                f"- FUB webhook delivery issues\n"
                f"- Railway server problems\n"
                f"- Person ID extraction failures\n"
                f"- Database connection issues",
                "webhook_silence"
            )
            alerts_sent.append("webhook_silence")

        # 3. Server unreachable
        if server_health['status'] == 'error':
            self.send_email_alert(
                "Webhook Server Unreachable",
                f"Cannot reach Railway webhook server.\n\nError: {server_health['error']}\n\n"
                f"Server URL: {WEBHOOK_HEALTH_URL}\n\n"
                f"This means FUB webhooks cannot be processed.",
                "server_down"
            )
            alerts_sent.append("server_down")

        # 4. High failure rate (if webhook stats available)
        elif server_health['webhook_stats']:
            stats = server_health['webhook_stats']
            total = stats.get('total_received', 0)
            failed = stats.get('total_failed', 0)

            if total > 10:  # Only check if we have enough data
                failure_rate = failed / total
                if failure_rate > WEBHOOK_FAILURE_RATE_THRESHOLD:
                    self.send_email_alert(
                        "High Webhook Failure Rate",
                        f"Webhook failure rate is {failure_rate:.1%}.\n\n"
                        f"Total received: {total}\n"
                        f"Total failed: {failed}\n"
                        f"Success rate: {((total-failed)/total):.1%}\n\n"
                        f"This means many stage changes are being lost.",
                        "high_failure_rate"
                    )
                    alerts_sent.append("high_failure_rate")

        # 5. Server just restarted (potential deployment issue)
        if server_health['uptime_hours'] is not None and server_health['uptime_hours'] < 0.5:
            # Only alert if this isn't during a known maintenance window
            self.send_email_alert(
                "Webhook Server Restarted",
                f"Webhook server was recently restarted.\n\n"
                f"Uptime: {server_health['uptime_hours']:.1f} hours\n"
                f"Version: {server_health['version']}\n\n"
                f"Monitor for webhook processing issues.",
                "server_restart"
            )
            alerts_sent.append("server_restart")

        if alerts_sent:
            print(f"[ALERT] Sent {len(alerts_sent)} alerts: {', '.join(alerts_sent)}")
        else:
            print("[OK] All systems healthy - no alerts sent")

        return {
            'database_health': db_health,
            'server_health': server_health,
            'alerts_sent': alerts_sent,
            'timestamp': datetime.now().isoformat()
        }

def main():
    """Main monitoring loop"""
    monitor = WebhookMonitor()

    # Single check mode
    if len(os.sys.argv) > 1 and os.sys.argv[1] == '--once':
        result = monitor.analyze_and_alert()
        print(f"\nMonitoring complete - {len(result['alerts_sent'])} alerts sent")
        return

    # Continuous monitoring mode
    print("[START] Starting FUB Stage Tracker monitoring system...")
    print(f"Will check every 15 minutes for issues")
    print(f"Email alerts will be sent to: {ALERT_RECIPIENT or 'NOT CONFIGURED'}")
    print(f"Press Ctrl+C to stop\n")

    try:
        while True:
            result = monitor.analyze_and_alert()
            print(f"Next check in 15 minutes...\n")
            time.sleep(15 * 60)  # Check every 15 minutes

    except KeyboardInterrupt:
        print("\n[STOP] Monitoring stopped by user")
    except Exception as e:
        print(f"\n[ERROR] Monitoring system error: {e}")
        # Try to send alert about monitoring system failure
        try:
            monitor.send_email_alert(
                "Monitoring System Failed",
                f"The webhook monitoring system encountered an error and stopped.\n\nError: {e}\n\nPlease restart the monitoring system.",
                "monitor_failure"
            )
        except:
            pass

if __name__ == "__main__":
    main()