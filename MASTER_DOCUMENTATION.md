# FUB Stage Tracker - Master Documentation

**Last Updated**: September 26, 2025
**System Status**: ✅ Fully Operational
**Monitoring**: 🚨 Alert System Active

---

## 📋 Quick Reference

| Component | Status | URL/Path | Purpose |
|-----------|--------|----------|---------|
| **Dashboard** | ✅ Live | https://fub-stage-tracker.vercel.app | Business metrics & analytics |
| **Webhook Server** | ✅ Live | https://fub-stage-tracker-production.up.railway.app | Real-time FUB integration |
| **Database** | ✅ Live | Supabase PostgreSQL | Stage change storage |
| **Monitoring** | 🚨 Available | `webhook-monitoring-system.py` | Email alerts for failures |

---

## 🏗️ System Architecture

### Overview
```
┌──────────────┐    Webhooks     ┌─────────────────┐    Data      ┌─────────────────┐
│ FollowUpBoss │ ──────────────▶ │ Railway Server  │ ───────────▶ │ Supabase DB     │
│ (FUB)        │                 │ (Python Flask)  │              │ (PostgreSQL)    │
└──────────────┘                 └─────────────────┘              └─────────────────┘
                                                                            │
                                                                            ▼
                                  ┌─────────────────┐              ┌─────────────────┐
                                  │ Email Alerts    │              │ Dashboard       │
                                  │ (Monitoring)    │              │ (Next.js/Vercel)│
                                  └─────────────────┘              └─────────────────┘
```

### Core Components

#### 1. **Webhook Server** (Railway)
- **File**: `webhook-server/fub_webhook_server.py`
- **Purpose**: Receives real-time stage changes from FUB
- **Key Features**:
  - Person ID extraction with multiple fallback methods
  - Synchronous processing for reliability
  - Comprehensive health monitoring endpoint
  - Request deduplication and validation

#### 2. **Database** (Supabase)
- **Table**: `stage_changes`
- **Schema**:
  ```sql
  CREATE TABLE stage_changes (
    id SERIAL PRIMARY KEY,
    person_id VARCHAR(50),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    stage_from VARCHAR(200),
    stage_to VARCHAR(200),
    changed_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source VARCHAR(50),
    lead_source VARCHAR(200)
  );
  ```

#### 3. **Dashboard** (Vercel)
- **Framework**: Next.js 13+ with App Router
- **Purpose**: Real-time business metrics visualization
- **Key Features**:
  - Pipeline activity charts
  - Recent activity table
  - Lead source analysis
  - Weekly/monthly metrics

#### 4. **Monitoring System** (Local/Cloud)
- **File**: `webhook-monitoring-system.py`
- **Purpose**: Email alerts for system failures
- **Monitors**:
  - Webhook processing health
  - Database connectivity
  - Server uptime
  - Failure rates

---

## 🔧 Configuration & Environment

### Railway Environment Variables
```bash
FUB_API_KEY=<your_fub_api_key>
FUB_SYSTEM_KEY=<your_fub_system_key>
SUPABASE_DB_URL=postgresql://postgres.jefrfayzrxfcjeviwfhw:UnVen%25SUBJd%26%237%40@aws-0-us-east-2.pooler.supabase.com:6543/postgres
WEBHOOK_BASE_URL=https://fub-stage-tracker-production.up.railway.app
```

### Vercel Environment Variables
```bash
SUPABASE_DB_URL=<same_as_railway>
```

### Monitoring Environment Variables
```bash
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
ALERT_EMAIL_ADDRESS=<your_gmail>
ALERT_EMAIL_PASSWORD=<your_app_password>
ALERT_RECIPIENT=<where_to_send_alerts>
```

---

## 🔄 Data Flow

### Real-Time Webhook Flow
1. **FUB Stage Change** → User moves lead to new stage
2. **Webhook Trigger** → FUB sends POST to Railway server
3. **Person ID Extraction** → Server extracts ID using multiple methods:
   ```python
   # Method 0: FUB resourceIds array (primary)
   if 'resourceIds' in webhook_data:
       person_id = str(webhook_data['resourceIds'][0])

   # Method 1: URI extraction
   elif 'uri' in webhook_data:
       person_id = extract_from_uri(webhook_data['uri'])

   # Additional fallback methods...
   ```
4. **FUB API Call** → Fetch complete person data
5. **Database Insert** → Store stage change with source tracking
6. **Dashboard Update** → Real-time display (seconds)

### Monitoring Flow
1. **Health Check** → Every 15 minutes
2. **Issue Detection** → Database silence, server down, etc.
3. **Email Alert** → Immediate notification with details
4. **Cooldown** → 1-hour prevent spam

---

## 🛠️ Key Files Reference

### Core Application Files
| File | Purpose | Critical For |
|------|---------|--------------|
| `webhook-server/fub_webhook_server.py` | Main webhook processor | Real-time data capture |
| `dashboard/pages/api/` | Dashboard API routes | Frontend data access |
| `webhook-monitoring-system.py` | Health monitoring | System reliability |

### Configuration Files
| File | Purpose | Notes |
|------|---------|-------|
| `nixpacks.toml` | Railway deployment config | Specifies Python app location |
| `package.json` | Dashboard dependencies | Next.js configuration |
| `requirements.txt` | Python dependencies | Flask, psycopg2, requests |

### Documentation Files
| File | Purpose |
|------|---------|
| `SYSTEM_ARCHITECTURE_DIAGRAM.md` | Visual system overview |
| `docs/ARCHITECTURE_RECOMMENDATION.md` | Design decisions |
| `setup-monitoring.md` | Alert system setup |

---

## 🚨 Troubleshooting Guide

### Common Issues & Solutions

#### 1. **Dashboard Shows No Recent Data**
```bash
# Check webhook server health
curl https://fub-stage-tracker-production.up.railway.app/health

# Check database connectivity
python -c "import psycopg2; print('DB OK')"

# Verify FUB webhook registration
curl https://fub-stage-tracker-production.up.railway.app/stats
```

#### 2. **Webhook Processing Stopped**
- **Symptoms**: No new entries in `stage_changes` table
- **Check**:
  1. Railway server logs
  2. FUB webhook status
  3. Database connection
  4. Person ID extraction logs

#### 3. **Email Alerts Not Working**
- **Check**:
  1. Environment variables set correctly
  2. Gmail app password (not regular password)
  3. SMTP connectivity
  4. Alert cooldown status

### Critical Health Endpoints
```bash
# Server health
GET /health
Returns: uptime, version, stats

# Webhook stats
GET /stats
Returns: processing counts, success rates

# Database check
Direct SQL: SELECT COUNT(*) FROM stage_changes WHERE changed_at > NOW() - INTERVAL '1 hour'
```

---

## 📊 Monitoring & Alerts

### Alert Triggers
| Alert Type | Trigger | Action Required |
|------------|---------|-----------------|
| **Webhook Silence** | No webhooks 2+ hours | Check FUB/Railway connectivity |
| **Server Down** | Railway unreachable | Check Railway deployment |
| **High Failure Rate** | >10% webhook failures | Check person ID extraction |
| **Database Error** | Connection issues | Check Supabase status |

### Manual Health Checks
```sql
-- Recent webhook activity
SELECT COUNT(*) FROM stage_changes
WHERE source LIKE 'wh_%'
AND changed_at > NOW() - INTERVAL '1 hour';

-- System health by source
SELECT source, COUNT(*), MAX(changed_at)
FROM stage_changes
WHERE changed_at > CURRENT_DATE
GROUP BY source;
```

---

## 🎯 Business Impact

### Key Metrics Captured
- **Stage Transitions**: All lead movement through sales pipeline
- **Timing Accuracy**: Real event timestamps (not processing time)
- **Lead Sources**: Marketing attribution tracking
- **Velocity**: Time between stage changes

### Critical Business Value
- **Real-time Dashboard**: Immediate visibility into sales activity
- **Rapid Transition Capture**: 30-second stage changes captured
- **Historical Accuracy**: Complete audit trail of all changes
- **Alert Protection**: Immediate notification of system issues

---

## 🔄 Maintenance

### Regular Tasks
- **Weekly**: Review monitoring alerts and system health
- **Monthly**: Check database performance and storage
- **Quarterly**: Review and update documentation

### Emergency Procedures
1. **System Down**: Check Railway status, restart if needed
2. **Data Loss**: Verify backup systems, contact support
3. **Alert Spam**: Adjust thresholds in monitoring system

---

## 📞 Support Information

### Key Contacts
- **Railway Support**: https://railway.app/help
- **Supabase Support**: https://supabase.com/support
- **Vercel Support**: https://vercel.com/help

### Important URLs
- **Dashboard**: https://fub-stage-tracker.vercel.app
- **Webhook Server**: https://fub-stage-tracker-production.up.railway.app
- **Health Check**: https://fub-stage-tracker-production.up.railway.app/health

---

**📅 Last System Update**: September 26, 2025
**🎯 System Status**: Fully Operational
**⚡ Real-Time Processing**: Active
**🚨 Monitoring**: Email alerts configured