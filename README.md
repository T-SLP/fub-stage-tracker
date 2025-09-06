# FUB Stage Tracker

A unified system for tracking Follow Up Boss lead stage changes through both real-time webhooks and polling collection.

## Architecture

This project combines two complementary data collection systems:

- **Webhook Server**: Real-time stage change capture (0-30 seconds latency)
- **Polling Collector**: Batch verification and gap filling (30 minute intervals)

## Project Structure

```
fub-stage-tracker/
├── config/                 # Shared configuration
│   ├── settings.py         # Environment variables and FUB stage definitions
│   └── database.py         # Database connection and operations
├── shared/                 # Shared utilities
│   ├── fub_api.py         # FUB API client
│   └── utils.py           # Common utility functions
├── webhook-server/         # Real-time webhook system
│   ├── fub_webhook_server.py
│   └── requirements.txt
├── polling-collector/      # Batch polling system
│   └── fub_polling_collector.py
├── monitoring/             # System monitoring tools
├── tests/                  # Test suite
└── docs/                   # Documentation
```

## Features

### Real-time Webhook System
- Race condition prevention with database transaction locks
- Rapid transition capture (< 1 minute stage changes)
- Enhanced deduplication for webhook spam
- Time-in-stage tracking with millisecond precision
- Automated webhook registration with Follow Up Boss

### Polling Collection System
- Backup data collection for webhook gaps
- Batch processing with configurable intervals
- Historical data synchronization
- Custom field extraction and lead source detection

### Shared Components
- Centralized configuration management
- Unified database operations with deduplication
- Common FUB API client with error handling
- Standardized stage change record creation

## Environment Variables

```bash
# FUB API Configuration
FUB_API_KEY=your_api_key
FUB_SYSTEM_KEY=your_system_key

# Database Configuration
SUPABASE_DB_URL=postgresql://user:pass@host:port/db

# Webhook Configuration (for webhook-server)
WEBHOOK_BASE_URL=https://your-webhook-url.railway.app
PORT=5000

# Polling Configuration (for polling-collector)
POLLING_INTERVAL=1800          # 30 minutes
POLLING_LOOKBACK_DAYS=7        # Check last 7 days
```

## Quick Start

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure Environment Variables**
   - Copy `.env.example` to `.env`
   - Fill in your FUB API credentials and database URL

3. **Deploy Webhook Server**
   ```bash
   cd webhook-server
   python fub_webhook_server.py
   ```

4. **Run Polling Collector**
   ```bash
   cd polling-collector
   python fub_polling_collector.py
   ```

## Data Flow

1. **Webhook Path**: FUB → Webhook Server → Database
2. **Polling Path**: Polling Collector → FUB API → Database
3. **Deduplication**: Both systems use 5-minute window deduplication
4. **Verification**: Polling system acts as backup for missed webhooks

## Monitoring

- Health endpoints at `/health` (webhook server)
- System statistics at `/stats` (webhook server)
- Database activity summaries
- Webhook registration status

## Contributing

See `docs/` directory for detailed documentation on:
- Database schema
- API integration patterns
- Testing procedures
- Deployment guides# Railway deployment trigger
