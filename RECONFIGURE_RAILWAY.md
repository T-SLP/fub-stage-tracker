# Reconfigure Railway to Deploy from Main Repository

## 🎯 **Goal**
Reconfigure Railway to deploy the enhanced webhook server from this main `fub-stage-tracker` repository instead of a separate webhook server repository.

## 📋 **Steps to Reconfigure Railway**

### 1. **Access Railway Dashboard**
- Go to https://railway.app/dashboard
- Find your `fub-stage-tracker-production` project
- Click on the project to enter settings

### 2. **Update GitHub Repository Connection**
- Go to **Settings** → **Source**
- **Disconnect** the current repository (if connected to a separate webhook server repo)
- **Connect** to the main repository: `T-SLP/fub-stage-tracker`
- Set **Branch**: `master`
- Set **Root Directory**: `/` (root of the repository)

### 3. **Configure Build Settings**
Railway should automatically detect:
- ✅ **Language**: Python (from `requirements.txt`)
- ✅ **Start Command**: `python fub_webhook_server_deploy.py` (from `Procfile`)
- ✅ **Health Check**: `/health` endpoint (from `railway.json`)

### 4. **Verify Environment Variables**
Ensure these environment variables are still set in Railway:
- `FUB_API_KEY`: Your FollowUpBoss API key
- `FUB_SYSTEM_KEY`: Your system key
- `SUPABASE_DB_URL`: Database connection string
- `PORT`: Should be automatically set by Railway

### 5. **Deploy**
- **Trigger deployment** by pushing a commit or manually deploying
- **Monitor logs** for successful startup
- **Test health endpoint**: `https://fub-stage-tracker-production.up.railway.app/health`

## 🔧 **Files Ready for Railway Deployment**

All files are now configured in this main repository:

✅ **`fub_webhook_server_deploy.py`** - Enhanced webhook server with lead source extraction
✅ **`requirements.txt`** - Python dependencies (Flask, psycopg2-binary, requests)
✅ **`Procfile`** - Railway start command
✅ **`railway.json`** - Railway deployment configuration

## 🎉 **Benefits of This Approach**

1. **🏠 Consolidated Repository**: All code (dashboard + webhook server) in one place
2. **🔄 Unified Deployments**: Changes to webhook server deploy automatically
3. **📝 Easier Maintenance**: One repository to manage instead of two
4. **🔍 Better Version Control**: Webhook server changes tracked with main project

## 🚀 **After Reconfiguration**

Once Railway is reconfigured to use this main repository:

1. **Automatic Deployments**: Any push to `master` will redeploy the webhook server
2. **Enhanced Lead Source Processing**: New webhook server will properly extract ReadyMode/Roor
3. **Unified Codebase**: Dashboard and webhook server maintained together
4. **Better Debugging**: Enhanced logging will help troubleshoot issues

## ✅ **Verification Steps**

After reconfiguring Railway:

```bash
# Check enhanced webhook server is running
curl https://fub-stage-tracker-production.up.railway.app/health

# Should return version "2.1-enhanced" with enhanced_features
```

The response should include:
- `"version": "2.1-enhanced"`
- `"enhanced_features"` array with lead source extraction
- `"message": "Enhanced lead source processing active"`

This approach keeps everything consolidated while fixing the lead source processing issue!