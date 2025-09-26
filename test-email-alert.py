#!/usr/bin/env python3
"""
Test email alert functionality by sending a test alert
"""
import os
import sys

# Add the monitoring system to path
sys.path.append('.')

from webhook_monitoring_system import WebhookMonitor

def test_email_alert():
    """Send a test email alert to verify configuration"""

    # Check if environment variables are set
    required_vars = ['ALERT_EMAIL_ADDRESS', 'ALERT_EMAIL_PASSWORD', 'ALERT_RECIPIENT']
    missing_vars = [var for var in required_vars if not os.getenv(var)]

    if missing_vars:
        print(f"Missing environment variables: {missing_vars}")
        print("Please set these variables and try again.")
        return

    print("Environment variables detected:")
    print(f"  From: {os.getenv('ALERT_EMAIL_ADDRESS')}")
    print(f"  To: {os.getenv('ALERT_RECIPIENT')}")
    print()

    # Create monitor instance
    monitor = WebhookMonitor()

    # Send test alert
    print("Sending test email alert...")

    monitor.send_email_alert(
        subject="Test Alert - Monitoring System Setup",
        body="""This is a test email from your FUB Stage Tracker monitoring system.

✅ Email configuration is working correctly!
✅ Gmail app password is valid
✅ SMTP connection successful

Your webhook monitoring system is now ready to protect your business metrics.

Test Details:
- From: travis@synergylandpartners.com
- To: contact@synergylandpartners.com
- System: FUB Stage Tracker
- Time: Testing email alerts

If you receive this email, your monitoring system will successfully alert you to any webhook processing issues.""",
        alert_type="test_email"
    )

    print("Test alert sent!")
    print()
    print("Check contact@synergylandpartners.com for the test email.")
    print("If you receive it, your email alerts are working correctly!")

if __name__ == "__main__":
    test_email_alert()