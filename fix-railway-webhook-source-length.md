# Fix Railway Webhook Source Field Length Issue

## 🚨 PROBLEM IDENTIFIED

Railway webhook server is failing to save stage changes because:
- **Webhook sources**: `"webhook_peopleStageUpdated"` (28 chars), `"webhook_peopleCreated"` (23 chars)  
- **Database limit**: `source varchar(20)` - only 20 characters allowed
- **Result**: ALL webhook processing fails with database constraint error

## ✅ IMMEDIATE FIX OPTIONS

### Option 1: Modify Railway Code (Quickest)
Update Railway webhook server to truncate source field:

**In your Railway webhook server code (`fub_webhook_server.py`):**

Find where source is set (likely around line 240-250) and change:
```python
# OLD CODE:
'source': f'webhook_{eventType}',

# NEW CODE: 
'source': f'webhook_{eventType}'[:20],  # Truncate to 20 chars
```

### Option 2: Database Schema Change (Permanent)
Run this SQL in Supabase SQL editor:
```sql
ALTER TABLE stage_changes 
ALTER COLUMN source TYPE varchar(50);
```

## 🔧 RECOMMENDED SOLUTION

**Quick Fix (5 minutes):**
1. Update Railway webhook server code to truncate source field
2. Redeploy Railway app
3. Test with FUB stage change

**This will make webhook sources like:**
- `"webhook_peopleStageUpdated"` → `"webhook_peopleStage"` (20 chars) ✅
- `"webhook_peopleCreated"` → `"webhook_peopleCreat"` (20 chars) ✅

## 🎯 EXPECTED RESULT

After fix:
- ✅ Railway webhooks will save to database successfully  
- ✅ Real-time stage changes will appear within seconds
- ✅ Today's offers will show up immediately
- ✅ No more "value too long" constraint errors

## 📋 VERIFICATION STEPS

1. Apply the fix to Railway code
2. Redeploy Railway  
3. Make test stage change in FUB
4. Check if database record appears immediately
5. Verify Railway logs show successful processing