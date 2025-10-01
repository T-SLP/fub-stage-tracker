# Duplicate Leads Fix

## Problem Identified
Database has near-duplicate records (same stage change within milliseconds) because:
1. FUB sends multiple webhook events for the same stage change (`peopleStageUpdated` + `peopleUpdated`)
2. Current deduplication only rejects after 2+ webhooks (line 93 in webhook-server.js)
3. This allows the first 2 webhooks through, creating duplicates

## Evidence
From database check (check_duplicates.py):
- 20+ near-duplicates found in last 7 days
- Examples:
  - Robert Williams: 2 identical records 0.029s apart
  - Lisa Rusinyak: 2 identical records 0.005s apart
  - Lois Barnett: 2 identical records 0.036s apart

## Solution

### Option 1: Stricter Webhook Deduplication (RECOMMENDED)
Change line 93 in webhook-server.js from:
```javascript
if (recentWebhooks.length >= 2) {
```
To:
```javascript
if (recentWebhooks.length >= 1) {
```

This will reject ANY duplicate webhook within the 30-second window.

### Option 2: Database-Level Deduplication
Add a unique constraint to prevent duplicates:
```sql
ALTER TABLE stage_changes
ADD CONSTRAINT unique_person_stage_transition
UNIQUE (person_id, stage_from, stage_to, changed_at);
```

This would catch duplicates at the database level but wouldn't prevent the webhook processing overhead.

### Option 3: Register Only One Webhook Event
Remove `peopleUpdated` webhook and only keep `peopleStageUpdated`. This prevents FUB from sending multiple events for the same stage change.

## Recommended Action Plan
1. Apply Option 1 (stricter deduplication) - immediate fix
2. Apply Option 2 (database constraint) - backup safety net
3. Consider Option 3 (reduce webhook events) - long-term optimization

## Deployment
The webhook server appears to be deployed on Railway:
- URL: https://web-production-cd698.up.railway.app
- Update the webhook-server.js file in your Railway deployment

## Testing
After deploying the fix, monitor for:
1. No more duplicate records in stage_changes table
2. Webhook deduplication stats in /health endpoint
3. Verify all legitimate stage changes still being captured
