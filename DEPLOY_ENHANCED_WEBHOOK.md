# Deploy Enhanced Webhook Server to Railway

## ✅ **Current Status**
- Railway is connected to `T-SLP/fub-stage-tracker` ✅
- Enhanced webhook server code is ready ✅
- Configuration files are in repository ✅
- **But Railway hasn't deployed the new version yet** ❌

## 🚀 **Deploy the Enhanced Webhook Server**

Since Railway is already connected to this repository, you have 2 options:

### **Option 1: Update Railway Start Command (Fastest)**

1. **Go to Railway Dashboard** → `fub-stage-tracker-production`
2. **Settings** → **Deploy**
3. **Update Start Command** to: `python fub_webhook_server_deploy.py`
4. **Save** and **Redeploy**

### **Option 2: Manual Deployment Trigger**

1. **Go to Railway Dashboard** → `fub-stage-tracker-production`
2. **Deployments** tab
3. **Click "Deploy Now"** or **"Redeploy"**
4. Railway should pick up the new `Procfile` automatically

## 🔍 **Verification Steps**

After deployment, check these endpoints:

```bash
# Health check - should show enhanced version
curl https://fub-stage-tracker-production.up.railway.app/health

# Root endpoint - should show enhanced features
curl https://fub-stage-tracker-production.up.railway.app/
```

### **Look for these indicators in the response:**

✅ **Enhanced Version Deployed:**
- `"version": "2.1-enhanced"`
- `"message": "Enhanced lead source processing active"`
- `"enhanced_features"` array present
- Root endpoint returns JSON (not 404 HTML)

❌ **Old Version Still Running:**
- No version field or different version
- `"message": "Real-time stage tracking active"` (old message)
- Root endpoint returns 404 HTML

## 🎯 **Expected Results After Enhanced Deployment**

Once the enhanced webhook server is deployed:

### **Immediate Changes:**
- ✅ New webhooks will properly extract "ReadyMode" and "Roor" from tags
- ✅ Enhanced debugging in Railway logs (`LEAD SOURCE EXTRACTED` messages)
- ✅ Proper `lead_source_tag` values in database

### **Dashboard Impact:**
- ✅ New stage changes will show correct lead sources
- ✅ "Qualified Leads by Lead Source" chart will improve over time
- ✅ Current week data will gradually show proper sources as new webhooks arrive

## 📊 **Monitoring After Deployment**

Watch Railway logs for these enhanced messages:
```
✅ LEAD SOURCE EXTRACTED for John Doe: ReadyMode from tags: ['ReadyMode', 'Other']
⚠️  NO LEAD SOURCE found for Jane Smith, tags: ['SomeOtherTag']
🎯 STAGE CHANGE DETECTED for John Doe: ACQ - Qualified → ACQ - Offers Made
✅ STAGE CHANGE SAVED with lead source: John Doe → ACQ - Offers Made (source: ReadyMode)
```

## 🚨 **If Deployment Issues Occur**

If the enhanced deployment doesn't work:

1. **Check Railway Build Logs** for any Python/Flask errors
2. **Verify Environment Variables** are still set (FUB_API_KEY, SUPABASE_DB_URL, etc.)
3. **Try reverting** the start command to the previous version if needed
4. **The dashboard API webhook** (`/api/webhook`) is still available as backup

## 🎉 **Success Indicators**

You'll know the enhanced webhook server is working when:

1. **Health endpoint** shows enhanced version info
2. **Railway logs** show lead source extraction messages
3. **New database records** have proper `lead_source_tag` values
4. **Dashboard charts** start showing correct lead sources for new data

The enhanced webhook server will immediately start processing new webhooks with proper lead source extraction!