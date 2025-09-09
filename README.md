# FUB Stage Tracker

Comprehensive Follow Up Boss stage tracking system with real-time webhooks and analytics dashboard.

**🚀 Updated with integrated webhook server - Single Vercel deployment!**

## Features

- **Real-time Stage Tracking**: Webhook-based capture of stage changes
- **Analytics Dashboard**: Visual pipeline analytics with charts and metrics
- **Time Tracking**: Measure time spent in each stage
- **Rapid Transition Detection**: Capture stage changes as fast as 1-2 seconds
- **Enhanced Analytics**: Throwaway leads tracking, conversion metrics
- **Historical Data**: Events API integration for historical stage analysis

## Architecture

- **Dashboard**: Next.js application with React components (Vercel)
- **Webhook Server**: Railway persistent server for real-time FUB webhooks  
- **Database**: Supabase PostgreSQL for data storage
- **Deployment**: Hybrid - Vercel for dashboard, Railway for webhooks

## Project Structure

```
fub-stage-tracker/
├── dashboard/                 # Next.js dashboard application
│   ├── pages/
│   │   ├── api/
│   │   │   ├── webhook.js           # Main webhook endpoint
│   │   │   ├── webhook-health.js    # Webhook health check
│   │   │   └── pipeline-data.js     # Dashboard data API
│   │   └── index.js                 # Dashboard UI
│   ├── components/            # React components
│   └── utils/                 # Utility functions
├── fub_stage_tracker.py      # Historical data extraction
├── fub_events_api_tester.py  # Events API analysis
└── vercel.json               # Vercel deployment config
```

## API Endpoints

### Dashboard (Vercel)
- **POST /api/pipeline-data** - Dashboard analytics data

### Webhook Server (Railway) 
- **POST /webhook/fub/stage-change** - FUB webhook handler for real-time stage changes
- **GET /health** - Webhook system health check
- **GET /stats** - Webhook system statistics

## Environment Variables

Required environment variables:

```env
FUB_API_KEY=your_fub_api_key
SUPABASE_DB_URL=your_supabase_connection_string  
FUB_SYSTEM_KEY=your_fub_system_key
```

## Deployment

### Vercel Deployment

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Environment Setup

Add these environment variables in Vercel:
- `FUB_API_KEY`
- `SUPABASE_DB_URL` 
- `FUB_SYSTEM_KEY`

## Webhook Registration

After deployment, register webhooks with Follow Up Boss:

```bash
curl -X POST https://your-vercel-app.vercel.app/api/webhook-health
```

The webhook URL for FUB registration:
`https://your-vercel-app.vercel.app/api/webhook`

## Local Development

```bash
cd dashboard
npm install
npm run dev
```

Dashboard will be available at `http://localhost:3000`

## Database Schema

The system uses a `stage_changes` table with enhanced tracking:

- Basic stage change data (person_id, stage_from, stage_to, changed_at)
- Custom fields (campaign_id, lead_source_tag, etc.)
- Time tracking (time_in_previous_stage_days, hours, minutes)
- Progression analysis (stage_priority, is_forward_progression)

## Monitoring

- **Health Check**: `/api/webhook-health` - System status and configuration
- **Real-time Processing**: Webhooks process immediately and return status
- **Error Handling**: Comprehensive logging and error recovery