# FollowUpBoss Webhook Registration Guide

## Overview
This document explains how to register webhooks with FollowUpBoss for the FUB Webhook Server. The server includes automated webhook registration functionality.

## Quick Registration (Recommended)

### Using the Registration Endpoint
The server provides a `/register` endpoint that automatically registers all necessary webhooks:

```bash
curl -X POST https://web-production-cd698.up.railway.app/register
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Webhooks registered successfully", 
  "events_registered": [
    "peopleStageUpdated",
    "peopleCreated", 
    "peopleUpdated",
    "peopleTagsCreated"
  ],
  "webhook_url": "https://web-production-cd698.up.railway.app/webhook/fub/stage-change"
}
```

## Prerequisites

### Environment Variables Required
The following environment variables must be configured in Railway:

- `FUB_API_KEY` - Your FollowUpBoss API key
- `FUB_SYSTEM_KEY` - Your system identifier key
- `WEBHOOK_BASE_URL` - Your deployed server URL (e.g., `https://web-production-cd698.up.railway.app`)
- `SUPABASE_DB_URL` - Database connection string

### FollowUpBoss API Requirements
- API key must have webhook creation permissions
- Only account owners can register webhooks
- Maximum 2 webhooks per event type allowed
- Webhook URLs must use HTTPS

## Registered Webhook Events

The system automatically registers these events:

| Event | Purpose | Webhook URL |
|-------|---------|-------------|
| `peopleStageUpdated` | Track stage changes (primary) | `/webhook/fub/stage-change` |
| `peopleCreated` | New lead creation | `/webhook/fub/stage-change` |
| `peopleUpdated` | General person updates | `/webhook/fub/stage-change` |
| `peopleTagsCreated` | Tag changes for lead source tracking | `/webhook/fub/stage-change` |

## Manual Registration (If Needed)

### Using FollowUpBoss API Directly
If the automated registration fails, you can manually register webhooks:

```bash
# Register peopleStageUpdated webhook
curl -X POST https://api.followupboss.com/v1/webhooks \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'YOUR_API_KEY:' | base64)" \
  -H "X-System: SynergyFUBLeadMetrics" \
  -d '{
    "event": "peopleStageUpdated",
    "url": "https://web-production-cd698.up.railway.app/webhook/fub/stage-change"
  }'
```

Repeat for each event type: `peopleCreated`, `peopleUpdated`, `peopleTagsCreated`

### Using FollowUpBoss Web Interface
1. Login to FollowUpBoss admin panel
2. Navigate to Settings > Integrations > Webhooks
3. Click "Add Webhook"
4. Configure each webhook:
   - **URL**: `https://web-production-cd698.up.railway.app/webhook/fub/stage-change`
   - **Events**: Select the events listed above
   - **Method**: POST

## Troubleshooting

### Check Current Registration Status
```bash
# Check server health and configuration
curl https://web-production-cd698.up.railway.app/stats
```

### Common Issues

**Registration fails with authentication error:**
- Verify `FUB_API_KEY` is set correctly
- Ensure the API key belongs to an account owner
- Check `FUB_SYSTEM_KEY` is configured

**Registration fails with "webhook already exists":**
- This is normal - existing webhooks are preserved
- Check FollowUpBoss admin panel to verify existing webhooks

**Server not receiving webhooks:**
1. Verify webhooks are registered (check FUB admin panel)
2. Test webhook URL manually: `curl https://web-production-cd698.up.railway.app/health`
3. Check server logs for webhook processing errors

### Server Logs
Monitor webhook activity:
```bash
# If deployed locally
tail -f webhook_server.log

# Check Railway deployment logs via dashboard
```

## Re-registration Process

### When to Re-register
- After changing the server URL (new Railway deployment)
- If webhooks stop working unexpectedly
- After updating webhook event types
- If FollowUpBoss webhooks are accidentally deleted

### Steps to Re-register
1. **Verify Prerequisites**: Ensure all environment variables are set
2. **Test Server Health**: `curl https://your-server-url/health`
3. **Trigger Registration**: `curl -X POST https://your-server-url/register`
4. **Verify Success**: Check the response and server logs
5. **Test Webhook Delivery**: Make a test change in FollowUpBoss

## Webhook Security

The server implements FollowUpBoss webhook signature verification:
- Validates `FUB-Signature` header
- Uses HMAC-SHA1 with your FUB system key
- Rejects webhooks with invalid signatures

## Support

For issues with webhook registration:
1. Check server logs for detailed error messages
2. Verify FollowUpBoss API credentials and permissions
3. Test manual registration using curl commands above
4. Contact FollowUpBoss support for API-related issues

---

*Last Updated: September 3, 2025*
*Server Version: 2.0-fixed*
