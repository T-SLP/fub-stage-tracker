# FUB Data Collection Architecture Recommendation

## Current State Analysis

### Data Sources in Database:
- **Polling System**: 61,575 records (99.98% of data) - Active and working
- **Webhook System**: 0 records (was broken, now fixed)
- **Recent Activity**: 1,307 polling records in last 7 days

### Current Architecture:
1. **Polling Script** - Local Python script that regularly polls FUB API
2. **Webhook Server** - Railway-deployed 24/7 server for real-time webhooks

## Recommendation: Keep Both Systems (Complementary Approach)

### Why Both Are Needed:

**🚀 Webhook Server (Real-time)**
- **Primary Role**: Capture rapid transitions (0-30 seconds)
- **Critical For**: "ACQ - Offers Made" intermediate stages that happen quickly
- **Benefits**: Real-time dashboard updates, immediate alerts
- **Weakness**: Dependent on network/FUB reliability

**🔄 Polling Script (Backup & Verification)**  
- **Secondary Role**: Ensure 100% data completeness (5-10 minutes)
- **Critical For**: Historical data, missed webhooks, system recovery
- **Benefits**: Reliable fallback, handles outages
- **Weakness**: Higher latency, more API calls

### Optimal Configuration:

```
┌─────────────────┐    Real-time (0-30s)    ┌──────────────────┐
│   FUB System    │────────────────────────▶│ Webhook Server   │
│                 │                          │ (Railway 24/7)   │
└─────────────────┘                          └──────────────────┘
         │                                            │
         │ Backup (30 min)                           ▼
         └──────────────────────────────────▶┌──────────────────┐
                                             │ Supabase Database│
         ┌─────────────────┐                 │ (stage_changes)  │
         │ Polling Script  │                 └──────────────────┘
         │ (Your Local)    │                          ▲
         └─────────────────┘──────────────────────────┘
              Verification/Catch-up
```

## Recommended Changes:

### 1. Reduce Polling Frequency
Since webhook server now handles real-time capture:
```python
# Change from: 5-minute polling
POLL_EVERY = 300  # Current

# Change to: 30-minute polling  
POLL_EVERY = 1800  # Recommended (6x less API usage)
```

### 2. Add Deduplication Logic
Prevent duplicate records between systems:
```python
def insert_if_not_exists(stage_data):
    """Only insert if not already captured by webhook in last 5 minutes"""
    query = """
        INSERT INTO stage_changes (...)
        WHERE NOT EXISTS (
            SELECT 1 FROM stage_changes 
            WHERE person_id = %(person_id)s 
            AND stage_to = %(stage_to)s 
            AND changed_at BETWEEN %(changed_at)s - INTERVAL '5 minutes' 
                               AND %(changed_at)s + INTERVAL '5 minutes'
        )
    """
```

### 3. Enhanced Monitoring
Monitor both systems health:
```sql
-- Daily system health check
SELECT 
    source,
    COUNT(*) as records_today,
    MAX(changed_at) as latest_change,
    CASE 
        WHEN source LIKE '%webhook%' AND MAX(changed_at) < NOW() - INTERVAL '1 hour' 
        THEN 'STALE - Check webhook server'
        WHEN source = 'polling' AND MAX(changed_at) < NOW() - INTERVAL '45 minutes' 
        THEN 'STALE - Check polling script'
        ELSE 'HEALTHY'
    END as status
FROM stage_changes 
WHERE changed_at >= CURRENT_DATE
GROUP BY source;
```

## Project Structure Recommendation: Single Combined Project

### Current Structure:
```
C:\Users\troge\fub-webhook-server\
├── fub_webhook_server.py          # Webhook server (Railway)
├── fub_sync_missing_stages.py     # Polling script (Local)
├── [various test/fix scripts]
```

### Recommended Structure:
```
C:\Users\troge\fub-data-collector\
├── src/
│   ├── webhook_server.py          # Real-time webhook server
│   ├── polling_collector.py       # Backup polling collector  
│   ├── database.py                # Shared database operations
│   ├── fub_api.py                 # Shared FUB API operations
│   └── config.py                  # Shared configuration
├── tests/
│   ├── test_webhook_server.py
│   ├── test_polling_collector.py
│   └── test_integration.py
├── deployment/
│   ├── railway.yml                # Webhook server deployment
│   └── local_scheduler.py         # Local polling scheduler
├── monitoring/
│   ├── health_checks.py
│   └── dashboard_queries.sql
└── docs/
    ├── ARCHITECTURE.md
    └── DEPLOYMENT_GUIDE.md
```

## Benefits of Combined Project:

### ✅ Code Reuse:
- Shared database connection logic
- Common FUB API operations
- Unified configuration management
- Consistent error handling

### ✅ Easier Maintenance:
- Single repository to manage
- Consistent coding standards
- Shared testing framework
- Unified documentation

### ✅ Better Integration:
- Coordinated deduplication
- Shared monitoring
- Consistent logging format
- Easier troubleshooting

### ✅ Deployment Flexibility:
- Webhook server → Railway (24/7)
- Polling script → Local/Scheduled
- Shared components → Both environments

## Implementation Priority:

### Phase 1: Immediate (This Week)
1. ✅ Webhook server deployed and working
2. 🔄 Reduce polling frequency to 30 minutes
3. 🔄 Add basic deduplication to polling script

### Phase 2: Optimization (Next Week)  
1. Combine projects into single repository
2. Extract shared code (database, API, config)
3. Add comprehensive monitoring

### Phase 3: Advanced (Future)
1. Smart polling (only check changed records)
2. Automatic failover between systems
3. Performance optimization

## Expected Results:

### Data Completeness: 99.9%+
- Webhook server captures rapid transitions (primary)
- Polling script catches any missed records (backup)
- Deduplication prevents double counting

### Performance Improvement:
- Real-time dashboard updates (webhook)
- 6x less API usage from polling (30min vs 5min)
- Complete rapid transition capture

### Reliability:
- Webhook outages covered by polling
- Polling issues covered by webhooks  
- Historical data always available

The complementary dual system approach provides the reliability of polling with the responsiveness of webhooks, ensuring you never miss another "ACQ - Offers Made" stage again!