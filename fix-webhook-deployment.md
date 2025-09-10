# Fix Webhook Deployment - Missing Environment Variables

## 🚨 PROBLEM IDENTIFIED
Your webhooks are not working because environment variables are missing from your Vercel deployment.

**Local .env.local file has the variables, but Vercel deployment doesn't.**

## ✅ SOLUTION STEPS

### 1. Add Environment Variables to Vercel

Go to your Vercel dashboard and add these environment variables:

**Via Vercel Dashboard:**
1. Visit https://vercel.com/dashboard
2. Select your `fub-stage-tracker` project
3. Go to Settings → Environment Variables
4. Add these three variables:

```
FUB_API_KEY = fka_0DxOlS07NmHLDLVjKXB7N9qJyOSM4QtM2u
SUPABASE_DB_URL = postgresql://postgres.jefrfayzrxfcjeviwfhw:UnVen%25SUBJd%26%237%40@aws-0-us-east-2.pooler.supabase.com:6543/postgres  
FUB_SYSTEM_KEY = 390b59dea776f1d5216843d3dfd5a127
```

**OR via Vercel CLI (if you have it installed):**
```bash
vercel env add FUB_API_KEY
vercel env add SUPABASE_DB_URL
vercel env add FUB_SYSTEM_KEY
```

### 2. Redeploy
After adding environment variables, trigger a new deployment:
- Make a small change to any file and push to GitHub
- OR use Vercel dashboard → Deployments → Redeploy

### 3. Verify Fix
After redeployment, check:
```bash
curl https://fub-stage-tracker.vercel.app/api/webhook-health
```

Should show:
```json
{
  "status": "healthy",
  "fub_api_configured": true,
  "fub_system_key_configured": true,
  "database_configured": true
}
```

## 🎯 EXPECTED RESULTS

Once fixed, you should see:
- ✅ Real-time webhook events in database 
- ✅ Immediate dashboard updates when offers are made
- ✅ Source will show `webhook_peopleStageUpdated` instead of `polling`
- ✅ Much faster data updates (seconds vs hours)

## ⚠️ IMPORTANT
This is why you missed yesterday's offers in real-time - they only appeared when the polling script ran at midnight!