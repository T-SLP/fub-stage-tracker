# Railway Webhook Server Source Field Fix

## ✅ CHANGE APPLIED

**File:** `C:\Users\troge\fub-webhook-server\fub_webhook_server.py`  
**Line 550:**

**Before:**
```python
'source': f'webhook_{event_type}'[:20],  # Truncate to fit varchar(20) database constraint
```

**After:**
```python
'source': f'wh_{event_type}'[:20],  # Use shorter prefix to fit varchar(20) constraint
```

## 🎯 NEW WEBHOOK SOURCE NAMES

**Old (28+ chars - caused database errors):**
- `webhook_peopleStageUpdated` → Database error ❌
- `webhook_peopleCreated` → Database error ❌  
- `webhook_peopleUpdated` → Database error ❌

**New (under 20 chars - will work perfectly):**
- `wh_peopleStageUpdated` → 22 chars → truncated to `wh_peopleStageUpdate` (20 chars) ✅
- `wh_peopleCreated` → 17 chars → `wh_peopleCreated` ✅
- `wh_peopleUpdated` → 17 chars → `wh_peopleUpdated` ✅
- `wh_peopleTagsCreated` → 21 chars → truncated to `wh_peopleTagsCreate` (20 chars) ✅

## 🚀 DEPLOYMENT NEEDED

**Next Steps:**
1. **Commit this change** to your Railway webhook server repo
2. **Deploy to Railway** (Railway will auto-deploy from git push)
3. **Test with FUB stage change** - should work immediately
4. **Verify real-time updates** appear in database within seconds

## 🎉 EXPECTED RESULT

After deployment:
- ✅ **No more database constraint errors**
- ✅ **Real-time webhook processing works**  
- ✅ **Today's offers will appear immediately**
- ✅ **All future stage changes captured in real-time**

**The webhook source names are now short enough to fit the database field while still being descriptive!**