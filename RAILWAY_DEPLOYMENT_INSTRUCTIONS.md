# Railway Webhook Server Deployment Instructions

## 🎯 PROBLEM
The current Railway webhook server at `https://fub-stage-tracker-production.up.railway.app` is working but **lacks enhanced lead source extraction**, causing "Unknown" sources in the dashboard instead of "ReadyMode" and "Roor".

## ✅ SOLUTION
Deploy the enhanced webhook server (`fub_webhook_server_deploy.py`) to Railway to fix lead source processing.

## 📋 DEPLOYMENT OPTIONS

### Option 1: Railway CLI Deployment (Recommended)

1. **Install Railway CLI** (if not already installed):
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Link to existing project**:
   ```bash
   railway link
   # Select the fub-stage-tracker-production project
   ```

4. **Deploy the enhanced webhook server**:
   ```bash
   railway up fub_webhook_server_deploy.py
   ```

### Option 2: GitHub Repository Update

If Railway is connected to a separate repository:

1. **Find the webhook server repository** (likely named something like `fub-webhook-server`)
2. **Replace the existing `fub_webhook_server.py`** with the contents of `fub_webhook_server_deploy.py`
3. **Push the changes** to trigger Railway auto-deployment

### Option 3: Railway Dashboard Upload

1. **Go to Railway Dashboard** → Your webhook server project
2. **Navigate to Variables/Settings**
3. **Upload/Update** the main webhook server file
4. **Trigger manual deployment**

## 🔧 KEY ENHANCEMENTS IN NEW VERSION

### 1. **Enhanced Lead Source Extraction**
```python
def extract_lead_source_tag(tags):
    if not tags or not isinstance(tags, list):
        return None
    if "ReadyMode" in tags:
        return "ReadyMode"
    elif "Roor" in tags:
        return "Roor"
    return None
```

### 2. **Debugging Output**
- ✅ `LEAD SOURCE EXTRACTED for John Doe: ReadyMode from tags: ['ReadyMode', 'Other']`
- ⚠️ `NO LEAD SOURCE found for Jane Smith, tags: ['SomeOtherTag']`

### 3. **Improved Database Recording**
- Proper `lead_source_tag` field population
- Transaction safety with `SELECT FOR UPDATE`
- Enhanced error handling and logging

## 🎉 EXPECTED RESULTS AFTER DEPLOYMENT

### Before (Current State):
- ❌ Webhook records have `lead_source_tag: null`
- ❌ Dashboard shows "Unknown" sources for current week
- ❌ Lead source pie chart shows 9 "unknown" vs proper sources

### After (Enhanced Deployment):
- ✅ Webhook records properly capture `ReadyMode` and `Roor` sources
- ✅ Dashboard shows correct lead sources for new webhook records
- ✅ Lead source pie chart shows proper distribution
- ✅ Enhanced debugging helps troubleshoot any issues

## 🔍 VERIFICATION STEPS

1. **Check deployment success**:
   ```bash
   curl https://fub-stage-tracker-production.up.railway.app/health
   ```
   Look for: `"version": "2.1-enhanced"` and `"enhanced_features"` in response

2. **Monitor webhook processing**:
   - Watch Railway logs for lead source extraction messages
   - Look for `LEAD SOURCE EXTRACTED` messages in logs

3. **Test with real stage change**:
   - Make a stage change in FUB for a contact with ReadyMode or Roor tags
   - Check database for proper `lead_source_tag` value

4. **Verify dashboard data**:
   - Check if new stage changes show proper lead sources
   - Monitor the "Qualified Leads by Lead Source" chart

## 📊 MONITORING AFTER DEPLOYMENT

Check these endpoints to verify enhanced functionality:

```bash
# Health check (should show v2.1-enhanced)
curl https://fub-stage-tracker-production.up.railway.app/health

# Detailed stats
curl https://fub-stage-tracker-production.up.railway.app/stats

# Root info (should show enhanced features)
curl https://fub-stage-tracker-production.up.railway.app/
```

## 🚨 ROLLBACK PLAN

If issues occur:
1. **Keep the current working webhook server as backup**
2. **Monitor Railway logs** for any errors after deployment
3. **Revert to previous version** if webhook processing fails
4. **The enhanced code is backward compatible** - it won't break existing functionality

## 🎯 FILES TO DEPLOY

- **Primary**: `fub_webhook_server_deploy.py` (complete enhanced webhook server)
- **Requirements**: `requirements.txt` (Flask, psycopg2-binary, requests)
- **Configuration**: Railway environment variables should remain the same

The enhanced webhook server will immediately start processing new webhooks with proper lead source extraction while maintaining all existing functionality.