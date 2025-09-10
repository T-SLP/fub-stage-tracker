# FUB Stage Tracking System - Architecture Diagram

## 🏗️ Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           FUB STAGE TRACKING SYSTEM                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐         Real-time         ┌─────────────────────────────────┐  │
│  │             │       webhook events      │         RAILWAY                 │  │
│  │ FOLLOW UP   │ ────────────────────────→ │      Webhook Server             │  │
│  │    BOSS     │                           │  (fub_webhook_server.py)        │  │
│  │             │                           │                                 │  │
│  └─────────────┘                           │  🎯 Processes stage changes     │  │
│        │                                   │  🔍 Validates FUB signatures    │  │
│        │                                   │  📊 Deduplicates rapid events   │  │
│        │                                   │  🕐 Preserves real timestamps   │  │
│        │                                   └─────────────────────────────────┘  │
│        │                                             │                          │
│        │                                             │ Stores processed         │
│        │                                             │ stage changes            │
│        │                                             ▼                          │
│        │                                   ┌─────────────────────────────────┐  │
│        │                                   │        SUPABASE                 │  │
│        │        API calls for              │       Database                  │  │
│        │        complete person            │                                 │  │
│        │        data (when needed)         │  📋 stage_changes table        │  │
│        └─────────────────────────────────→ │  🕐 Real event timestamps       │  │
│                                            │  📡 Processing timestamps       │  │
│                                            │  🔄 Complete stage history      │  │
│                                            └─────────────────────────────────┘  │
│                                                      │                          │
│                                                      │ Dashboard reads          │
│                                                      │ (no manipulation)        │
│                                                      ▼                          │
│                                            ┌─────────────────────────────────┐  │
│                                            │         VERCEL                  │  │
│                                            │    Dashboard (Read-Only)        │  │
│                                            │                                 │  │
│                                            │  📊 Pipeline Activity Chart     │  │
│                                            │  📋 Recent Activity Table       │  │
│                                            │  🎯 Real-time Updates           │  │
│                                            │  📅 Accurate Timestamps         │  │
│                                            └─────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🔧 Component Details

### **Railway Webhook Server**
- **URL**: `https://fub-stage-tracker-production.up.railway.app`
- **Endpoint**: `/webhook/fub/stage-change`
- **Purpose**: Receives real-time FUB webhooks, processes stage changes
- **Environment Variables**:
  - `FUB_API_KEY`: Authentication for FUB API calls
  - `FUB_SYSTEM_KEY`: Webhook signature validation
  - `SUPABASE_DB_URL`: Database connection
  - `WEBHOOK_BASE_URL`: Current Railway deployment URL

### **Supabase Database**
- **Table**: `stage_changes`
- **Key Fields**:
  - `changed_at`: Real FUB event timestamp (source of truth)
  - `received_at`: When Railway processed the webhook
  - `source`: 'webhook_' prefix for real-time vs 'polling' for batch

### **Vercel Dashboard**
- **URL**: `https://fub-stage-tracker.vercel.app`
- **Purpose**: Read-only visualization of stage changes
- **Environment Variables**:
  - `SUPABASE_DB_URL`: Database read access only

## 📊 Data Flow

### **Real-Time Stage Changes**
```
1. Stage change in FUB → 2. Webhook to Railway → 3. Railway processes → 
4. Saves to Supabase → 5. Dashboard shows update (seconds)
```

### **Historical Data Integrity**
- ✅ **Database timestamps** = Real business event times
- ✅ **No manipulation** unless for calculated metrics
- ✅ **Source tracking** for audit trails

## 🎯 Key Architectural Principles

### **Single Source of Truth**
- Supabase database contains authoritative stage change data
- All components read from database, minimal data transformation

### **Separation of Concerns**
- **Railway**: Webhook processing and data ingestion
- **Supabase**: Data storage and persistence
- **Vercel**: User interface and visualization

### **Real-Time Capability**
- Stage changes appear on dashboard within seconds
- No polling delays or batch processing for current events

## 🚨 Critical Configuration

### **Webhook Registration**
FUB webhooks must be registered to point to Railway:
```bash
curl -X POST https://fub-stage-tracker-production.up.railway.app/register
```

### **Environment Variables Sync**
All three platforms need coordinated configuration:
- Railway: Full access (FUB API + Database)
- Vercel: Database read-only
- Supabase: Shared database connection

## 🔍 Troubleshooting Reference

### **No Real-Time Updates**
1. Check Railway webhook health: `/health`
2. Verify FUB webhook registration: `/stats`
3. Monitor Railway logs for webhook processing
4. Confirm environment variables are set

### **Incorrect Timestamps**
1. Verify Railway uses `person.updated` from FUB
2. Check `changed_at` vs `received_at` in database
3. Run timestamp correction scripts if needed

### **Dashboard Not Updating**
1. Confirm Vercel has database access
2. Check for webhook vs polling data sources
3. Verify chart date range calculations

---

**📅 Architecture Established**: September 10, 2025  
**🎯 Status**: Fully Operational  
**⚡ Real-Time**: Active