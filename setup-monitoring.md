# FUB Stage Tracker - Monitoring System Setup

## Quick Setup

The monitoring system is now installed! Here's how to set it up:

### 1. Email Configuration (Required for Alerts)

Create these environment variables for email alerts:

```bash
# For Gmail (recommended)
set SMTP_SERVER=smtp.gmail.com
set SMTP_PORT=587
set ALERT_EMAIL_ADDRESS=your.email@gmail.com
set ALERT_EMAIL_PASSWORD=your_app_password
set ALERT_RECIPIENT=your.email@gmail.com
```

**Important**: For Gmail, you need an "App Password":
1. Go to Gmail → Settings → See all settings → Accounts and Import
2. Click "Other Google Account settings"
3. Security → 2-Step Verification → App passwords
4. Generate an app password for "Mail"
5. Use that 16-character password (not your regular Gmail password)

### 2. Run Monitoring

**Test once:**
```bash
python webhook-monitoring-system.py --once
```

**Run continuously (recommended):**
```bash
python webhook-monitoring-system.py
```

The system will:
- Check every 15 minutes
- Send email alerts when issues are detected
- Monitor for these problems:
  - No webhooks for 2+ hours
  - Server unreachable
  - High failure rates
  - Database connection issues

## Alert Types

| Alert | When It Triggers | What It Means |
|-------|------------------|---------------|
| **Webhook Processing Stopped** | No webhooks for 2+ hours | Stage changes aren't being captured |
| **Webhook Server Unreachable** | Railway server down | FUB can't deliver webhooks |
| **High Webhook Failure Rate** | >10% failures | Person ID extraction issues |
| **Database Connection Failed** | Can't connect to Supabase | Data can't be stored/retrieved |
| **Server Restarted** | Fresh deployment detected | Monitor for issues after deployment |

## Running in Background

### Windows (Task Scheduler)
1. Open Task Scheduler
2. Create Basic Task
3. Set trigger: "Daily" at startup
4. Action: Start program `python`
5. Arguments: `C:\Users\troge\fub-stage-tracker\webhook-monitoring-system.py`
6. Set to run whether user is logged on or not

### Cloud/VPS
```bash
# Run in background with nohup
nohup python3 webhook-monitoring-system.py > monitoring.log 2>&1 &

# Or use screen/tmux
screen -S webhook-monitor
python3 webhook-monitoring-system.py
# Ctrl+A, D to detach
```

## Manual Health Check

You can always check system health manually:

```python
python -c "
import requests
response = requests.get('https://fub-stage-tracker-production.up.railway.app/health')
print(response.json())
"
```

## Troubleshooting

**No email alerts received:**
- Check spam/junk folder
- Verify environment variables are set
- Test with `--once` flag first
- Check console output for error messages

**False alerts:**
- Alerts have 1-hour cooldown to prevent spam
- Adjust thresholds in `webhook-monitoring-system.py` if needed

**System issues:**
- Monitor logs: `monitoring.log` (if using nohup)
- Check webhook server: https://fub-stage-tracker-production.up.railway.app/health
- Verify database connectivity

## Next Steps

1. Set up email configuration
2. Test with `--once` flag
3. Run continuously in background
4. Monitor for alerts

The system will now protect your business metrics by alerting you immediately when webhook processing issues occur!