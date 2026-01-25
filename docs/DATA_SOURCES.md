# Data Sources Documentation

This document describes the data sources used for the Weekly Agent Report and Analysis Export.

## Overview

The reporting system pulls data from two primary sources:

1. **Supabase Database** - Stage progression metrics (KPIs)
2. **Follow Up Boss (FUB) API** - Call activity metrics

## Data Sources by Metric

### KPIs (from Supabase)

| Metric | Source | Table/Field | Notes |
|--------|--------|-------------|-------|
| Offers Made | Supabase | `stage_changes.stage_to = 'ACQ - Offers Made'` | Count of leads moved to this stage |
| Contracts Sent | Supabase | `stage_changes.stage_to = 'ACQ - Contract Sent'` | Count of leads moved to this stage |
| Signed Contracts | Supabase | `stage_changes.stage_to = 'ACQ - Under Contract'` | Count of leads moved to this stage |

### Call Metrics (from FUB API)

| Metric | Source | API Endpoint | Calculation |
|--------|--------|--------------|-------------|
| Talk Time (min) | FUB API | `/v1/calls` | Sum of all call durations |
| Outbound Calls | FUB API | `/v1/calls` | Count where `isIncoming = false` |
| Connections (2+ min) | FUB API | `/v1/calls` | Count where `duration >= 120` seconds |
| Connection Rate (%) | FUB API | Calculated | `Connections / Outbound Calls * 100` |
| Unique Leads Dialed | FUB API | `/v1/calls` | Distinct `personId` for outbound calls |
| Unique Leads Connected | FUB API | `/v1/calls` | Distinct `personId` where `duration >= 120` |
| Unique Lead Connection Rate (%) | FUB API | Calculated | `Unique Leads Connected / Unique Leads Dialed * 100` |
| Avg Call (min) | FUB API | Calculated | Average duration of calls >= 2 min |
| Single Dial | FUB API | Calculated | Sequences with 1 call to same number |
| 2x Dial | FUB API | Calculated | Sequences with 2 calls to same number within 2 min |
| 3x Dial | FUB API | Calculated | Sequences with 3+ calls to same number within 2 min |

## Supabase Database Details

### Table: `stage_changes`

This table captures all stage transitions from Follow Up Boss.

**Key Columns:**
- `changed_at` - Timestamp of the stage change
- `stage_from` - Previous stage
- `stage_to` - New stage
- `assigned_user_name` - Agent assigned to the lead (populated after Dec 2025)
- `raw_payload->>'assignedTo'` - Agent name from FUB payload (fallback for older records)
- `person_id` - FUB person/lead ID
- `first_name`, `last_name` - Lead name
- `parcel_county`, `parcel_state` - Property location

**Important Note:** The `assigned_user_name` column wasn't populated before December 19, 2025. For older records, queries must fall back to `raw_payload->>'assignedTo'`:

```sql
COALESCE(assigned_user_name, raw_payload->>'assignedTo', 'Unassigned') as agent
```

### Tracked Stages

The following stages are tracked for KPI reporting:
- `ACQ - Offers Made`
- `ACQ - Contract Sent`
- `ACQ - Under Contract`

## Follow Up Boss API Details

### Authentication

The FUB API uses Basic Authentication with the API key:
```
Authorization: Basic {base64(API_KEY + ":")}
```

### Endpoints Used

#### GET /v1/users
Returns list of all FUB users. Used to map `userId` to agent names.

#### GET /v1/calls
Returns call records. Key parameters:
- `createdAfter` - Start date filter
- `createdBefore` - End date filter
- `limit` - Results per page (max 100)
- `offset` - Pagination offset

**Key Response Fields:**
- `userId` - FUB user ID who made/received the call
- `userName` - Agent name
- `isIncoming` - Boolean, true for inbound calls
- `duration` - Call duration in seconds
- `toNumber` - Phone number called (for outbound)
- `personId` - Associated lead/person ID
- `created` - Timestamp of the call

## Thresholds and Definitions

| Term | Definition |
|------|------------|
| Connection | Call lasting >= 2 minutes (120 seconds) |
| No Answer/Voicemail | Call lasting < 2 minutes |
| Dial Sequence | Consecutive calls to same number within 2 minutes |
| Single Dial | One call with no immediate retry |
| Double Dial (2x) | Two calls to same number within 2 minutes |
| Triple Dial (3x) | Three+ calls to same number within 2 minutes |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_DB_URL` | PostgreSQL connection string for Supabase |
| `FUB_API_KEY` | Follow Up Boss API key |
| `GOOGLE_SHEETS_CREDENTIALS` | Google service account JSON for Sheets API |

## Data Flow

```
Follow Up Boss
      │
      ├──► FUB API ──► Call Metrics ──► Weekly Report
      │
      └──► Webhook/Polling ──► Supabase ──► Stage Metrics ──► Weekly Report
                                  │
                                  └──► stage_changes table
```

## Related Files

- `reports/weekly_agent_report.py` - Main weekly report generator
- `reports/backfill_history.py` - Historical data backfill script
- `.github/workflows/weekly-agent-report.yml` - Scheduled report workflow
- `.github/workflows/backfill-history.yml` - Manual backfill workflow
