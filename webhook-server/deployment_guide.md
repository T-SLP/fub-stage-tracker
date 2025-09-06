# Step-by-Step Deployment Guide for FUB Webhook Server

## Step 1: Environment Variables Setup

Create a `.env` file (or set these in your deployment platform):

```bash
# Required - FUB API Credentials
FUB_API_KEY=your_fub_api_key_here
FUB_SYSTEM_KEY=your_registered_system_key_here

# Required - Database Connection
SUPABASE_DB_URL=postgresql://user:password@host:port/database

# Required - Your deployed webhook URL (set after deployment)
WEBHOOK_BASE_URL=https://your-app-name.railway.app

# Optional - Port (Railway/Heroku will set this automatically)
PORT=5000
```

## Step 2: Get Your FUB API Credentials

### A. Get your FUB API Key
1. Log into your Follow Up Boss account
2. Go to **Admin** → **API**
3. Generate a new API key
4. **Important**: Copy it immediately - you can't retrieve it later
5. Set this as `FUB_API_KEY`

### B. Register Your System (if not done already)
1. Go to FUB's system registration page
2. Register your system as "SynergyFUBLeadMetrics"
3. You'll get an `X-System-Key`
4. Set this as `FUB_SYSTEM_KEY`

## Step 3: Deploy to Railway (Recommended)

### Why Railway?
- ✅ Easy Python deployment
- ✅ Automatic HTTPS
- ✅ Environment variables
- ✅ Free tier available

### Deployment Steps:

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Choose "Deploy from GitHub repo"
   - Connect your repository

3. **Set Environment Variables**
   ```bash
   FUB_API_KEY=fka_your_api_key_here
   FUB_SYSTEM_KEY=your_system_key_here
   SUPABASE_DB_URL=postgresql://user:password@host:port/database
   WEBHOOK_BASE_URL=https://your-app-name.railway.app
   ```

4. **Deploy**
   - Railway will automatically build and deploy
   - Note your app URL (something like `https://your-app-name.railway.app`)

## Step 4: Update WEBHOOK_BASE_URL

After deployment:

1. Copy your Railway app URL
2. Update the `WEBHOOK_BASE_URL` environment variable
3. Redeploy (Railway will auto-redeploy)

## Step 5: Test Your Deployment

### A. Check Health Status
Visit: `https://your-app-name.railway.app/health`

You should see:
```json
{
  "status": "healthy",
  "message": "Real-time stage tracking active",
  "webhook_url": "https://your-app-name.railway.app/webhook/fub/stage-change",
  "healthy": true,
  "uptime_hours": 0.1,
  "webhooks_received": 0,
  "webhooks_processed": 0
}
```

### B. Check Configuration
Visit: `https://your-app-name.railway.app/stats`

Verify all configuration shows as `true`:
```json
{
  "configuration": {
    "webhook_base_url": "https://your-app-name.railway.app",
    "fub_api_configured": true,
    "fub_system_key_configured": true,
    "database_configured": true
  }
}
```

## Step 6: Register Webhooks with Follow Up Boss

### Option A: Use the Endpoint (Recommended)
Make a POST request to register webhooks:

```bash
curl -X POST https://your-app-name.railway.app/register-webhooks
```

### Option B: Manual Registration
If the endpoint fails, register manually:

```bash
curl -X POST https://api.followupboss.com/v1/webhooks \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'YOUR_FUB_API_KEY:' | base64)" \
  -H "X-System: SynergyFUBLeadMetrics" \
  -H "X-System-Key: YOUR_FUB_SYSTEM_KEY" \
  -d '{
    "event": "peopleStageUpdated",
    "url": "https://your-app-name.railway.app/webhook/fub/stage-change"
  }'
```

Repeat for each event:
- `peopleStageUpdated`
- `peopleCreated`
- `peopleUpdated`
- `peopleTagsCreated`

## Step 7: Verify Webhook Registration

### Check Registered Webhooks
Visit: `https://your-app-name.railway.app/list-webhooks`

You should see your registered webhooks:
```json
{
  "status": "success",
  "webhooks": [
    {
      "id": 1234,
      "event": "peopleStageUpdated",
      "url": "https://your-app-name.railway.app/webhook/fub/stage-change",
      "status": "Active"
    }
  ],
  "count": 4
}
```

## Step 8: Test Webhook Reception

### Method 1: Test Endpoint
```bash
curl -X POST https://your-app-name.railway.app/test-webhook
```

### Method 2: Make Changes in FUB
1. Go to your Follow Up Boss account
2. Change a lead's stage
3. Check your webhook logs:
   - Visit: `https://your-app-name.railway.app/stats`
   - Look for `webhooks_received` > 0

### Method 3: Use RequestBin for Testing
1. Go to [requestbin.com](https://requestbin.com)
2. Create a temporary endpoint
3. Register a webhook with the RequestBin URL
4. Make stage changes in FUB
5. Check RequestBin to see the webhook payloads

## Step 9: Monitor Your Webhook Server

### Health Monitoring
Set up monitoring for:
- `https://your-app-name.railway.app/health`
- Should return 200 status when healthy

### Key Metrics to Watch
```json
{
  "webhooks_received": 150,
  "webhooks_processed": 148,
  "webhooks_failed": 2,
  "stage_changes_captured": 45,
  "rapid_transitions_captured": 3,
  "success_rate": 98.7
}
```

### Log Monitoring
Railway provides logs in the dashboard:
- Look for "Stage change captured" messages
- Watch for "RAPID TRANSITION" alerts
- Monitor for any error messages

## Step 10: Integration with Your Dashboard

Update your existing pipeline dashboard to use webhook data:

### Database Query Changes
Your existing queries will automatically include webhook data since it goes to the same `stage_changes` table with `source = 'webhook_*'`.

### Real-time Updates (Optional)
Add WebSocket support to your React dashboard for instant updates:

```javascript
// In your dashboard component
useEffect(() => {
  const eventSource = new EventSource(`${WEBHOOK_BASE_URL}/stream`);
  
  eventSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    if (data.type === 'stage_change') {
      // Refresh your dashboard data
      fetchData();
      showNotification(`New stage change: ${data.message}`);
    }
  };
  
  return () => eventSource.close();
}, []);
```

## Troubleshooting

### Common Issues

**1. "Invalid signature" errors**
- Check your `FUB_SYSTEM_KEY` is correct
- Ensure you're using the right system key from FUB registration

**2. "No webhooks received"**
- Verify webhook registration: `GET /list-webhooks`
- Check your `WEBHOOK_BASE_URL` is correct and publicly accessible
- Make sure FUB can reach your webhook (not behind firewall)

**3. "Database connection failed"**
- Verify `SUPABASE_DB_URL` is correct
- Check database is accessible from Railway
- Ensure SSL mode is configured properly

**4. "Webhook timeout" errors**
- Your webhook endpoint must respond within 10 seconds
- Check for slow database operations
- Monitor queue size at `/health`

### Debug Steps

1. **Check Configuration**
   ```bash
   curl https://your-app-name.railway.app/stats
   ```

2. **Test Webhook Manually**
   ```bash
   curl -X POST https://your-app-name.railway.app/test-webhook
   ```

3. **Check Logs**
   - Railway Dashboard → Your Project → Logs
   - Look for webhook processing messages

4. **Verify Database Schema**
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'stage_changes';
   ```

## Alternative Deployment Options

### Heroku
```bash
# Install Heroku CLI
heroku create your-fub-webhook-server
heroku config:set FUB_API_KEY=your_key
heroku config:set FUB_SYSTEM_KEY=your_system_key
heroku config:set SUPABASE_DB_URL=your_db_url
heroku config:set WEBHOOK_BASE_URL=https://your-fub-webhook-server.herokuapp.com
git push heroku main
```

### DigitalOcean App Platform
1. Connect GitHub repository
2. Set environment variables in dashboard
3. Deploy automatically

### AWS/GCP
- Use their container services
- Set up load balancer for HTTPS
- Configure environment variables

## Expected Results

Once successfully deployed:

### Immediate Benefits
- ✅ Real-time stage change capture (no 5-10 minute polling delay)
- ✅ Capture rapid transitions (changes within minutes/seconds)
- ✅ Enhanced time-in-stage tracking
- ✅ Reduced API usage (no constant polling)

### Dashboard Improvements
- 🚀 Live updates when stages change
- 📊 Better analytics with time-in-stage data
- ⚡ Rapid transition alerts
- 📈 More accurate pipeline metrics

### Monitoring
- 🔍 Health status monitoring
- 📊 Webhook processing statistics
- 🚨 Automatic error detection
- 📝 Comprehensive logging

Your webhook server will now capture every stage change in real-time, providing the most accurate and up-to-date pipeline data for your dashboard!