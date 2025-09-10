# Fix Railway Webhook Registration

## 🚨 PROBLEM IDENTIFIED

Your Railway environment variable `WEBHOOK_BASE_URL` is set to the old URL, causing FUB to send webhooks to a dead endpoint.

## ✅ SOLUTION STEPS

### 1. Update Railway Environment Variable

**In Railway Dashboard:**
1. Go to your Railway project dashboard
2. Select your `fub-stage-tracker` project  
3. Go to Variables tab
4. Update `WEBHOOK_BASE_URL` from:
   ```
   OLD: https://web-production-cd698.up.railway.app
   NEW: https://fub-stage-tracker-production.up.railway.app
   ```

### 2. Re-register Webhooks with FUB

After updating the environment variable, re-register webhooks:

```bash
curl -X POST https://fub-stage-tracker-production.up.railway.app/register
```

**Expected Response:**
```json
{
  "status": "success", 
  "message": "Webhooks registered successfully",
  "events_registered": ["peopleStageUpdated", "peopleCreated", "peopleUpdated", "peopleTagsCreated"],
  "webhook_url": "https://fub-stage-tracker-production.up.railway.app/webhook/fub/stage-change"
}
```

### 3. Verify Fix

Check that webhooks start flowing:
```bash
curl https://fub-stage-tracker-production.up.railway.app/health
```

Should show recent webhook activity instead of "No webhooks for 862 minutes"

## 🎯 EXPECTED RESULTS

✅ FUB will start sending webhooks to correct Railway URL  
✅ Real-time stage changes will appear in database immediately  
✅ Vercel dashboard will show updates within seconds  
✅ No more 14+ hour delays for stage change data

## 📋 ROOT CAUSE

When Railway deployments change URLs, the webhook registration becomes stale. The `WEBHOOK_BASE_URL` environment variable controls where FUB sends webhooks, and it was pointing to the old Railway instance that no longer exists.