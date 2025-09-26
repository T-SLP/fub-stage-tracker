@echo off
echo Setting up FUB Stage Tracker Email Alerts...
echo.

REM Set environment variables for email alerts
set SMTP_SERVER=smtp.gmail.com
set SMTP_PORT=587
set ALERT_EMAIL_ADDRESS=travis@synergylandpartners.com
set ALERT_EMAIL_PASSWORD=yckr awfu wead wbeu
set ALERT_RECIPIENT=contact@synergylandpartners.com

echo Environment variables set:
echo   SMTP Server: %SMTP_SERVER%
echo   From Email: %ALERT_EMAIL_ADDRESS%
echo   To Email: %ALERT_RECIPIENT%
echo.

echo Testing email configuration...
echo.

python -c "
import smtplib
import ssl
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

try:
    message = MIMEMultipart()
    message['From'] = '%ALERT_EMAIL_ADDRESS%'
    message['To'] = '%ALERT_RECIPIENT%'
    message['Subject'] = 'TEST: FUB Stage Tracker Alert System Setup'

    body = '''This is a test email from your FUB Stage Tracker monitoring system.

SUCCESS: Email configuration is working correctly!
SUCCESS: Gmail app password is valid
SUCCESS: SMTP connection successful

Your webhook monitoring system is now ready to protect your business metrics.

Test Details:
- From: travis@synergylandpartners.com
- To: contact@synergylandpartners.com
- System: FUB Stage Tracker
- Time: ''' + datetime.now().strftime('%%Y-%%m-%%d %%H:%%M:%%S') + '''

If you receive this email, your monitoring system will successfully alert you to any webhook processing issues.'''

    message.attach(MIMEText(body, 'plain'))

    context = ssl.create_default_context()
    with smtplib.SMTP('%SMTP_SERVER%', %SMTP_PORT%) as server:
        server.starttls(context=context)
        server.login('%ALERT_EMAIL_ADDRESS%', '%ALERT_EMAIL_PASSWORD%')
        server.sendmail('%ALERT_EMAIL_ADDRESS%', '%ALERT_RECIPIENT%', message.as_string())

    print('SUCCESS: Test email sent successfully!')
    print('From: %ALERT_EMAIL_ADDRESS%')
    print('To: %ALERT_RECIPIENT%')
    print('')
    print('Check contact@synergylandpartners.com for the test email.')
    print('If you receive it, your email alerts are working correctly!')

except Exception as e:
    print('ERROR: Failed to send test email:', str(e))
    print('')
    print('Please check:')
    print('1. Gmail app password is correct')
    print('2. Internet connection is working')
    print('3. Gmail account has 2-factor authentication enabled')
"

echo.
echo Test complete! Check your email.
echo.
echo To run continuous monitoring with email alerts:
echo   python webhook-monitoring-system.py
echo.
echo To run a single check:
echo   python webhook-monitoring-system.py --once
echo.
pause