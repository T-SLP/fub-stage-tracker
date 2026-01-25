# Quarterly Lead Analysis Export

This document describes the lead-level data export used for quarterly statistical analysis of acquisition manager performance.

## Purpose

The export provides lead-level data to analyze the correlation between acquisition activities and signed contracts. This analysis helps evaluate:

- Acquisition manager effectiveness
- Pipeline conversion rates at each stage
- Time-to-close metrics
- Activity patterns that lead to successful closings

## Original Requirements

### Datasets Requested

1. **Dataset 1: All Signed Contracts**
   - All leads that reached "ACQ - Under Contract" stage
   - Full lifecycle timestamps from entry to signing

2. **Dataset 2: Contracts Sent But Not Signed**
   - Leads that reached "ACQ - Contract Sent" but never signed
   - Used to analyze drop-off at the contract stage

3. **Dataset 3: Verbal Offers Made But No Contract Sent**
   - Leads that reached "ACQ - Offers Made" but never progressed to contract
   - Used to analyze drop-off at the offer stage

### Filters

- **Agents**: Dante Hernandez, Madeleine Penales
- **Time Period**: Configurable (default: Oct 27, 2025 - Jan 12, 2026)

## Data Sources

### Stage Data (Supabase)

- **Table**: `stage_changes`
- **Key Stages Tracked**:
  - `ACQ - Offers Made` - Verbal offer made to seller
  - `ACQ - Contract Sent` - Contract sent for signature
  - `ACQ - Under Contract` - Contract signed

### Call Data (Follow Up Boss API)

- **Endpoint**: `/v1/calls`
- **Connection Threshold**: >= 120 seconds (2 minutes)
- **Used For**: First meaningful connection timestamp

## Assumptions and Business Rules

### 1. Contract Sent Inference

**Assumption**: If a lead signed a contract (reached "ACQ - Under Contract"), a contract must have been sent, even if the agent did not explicitly move the lead through the "ACQ - Contract Sent" stage.

**Implementation**: When `contract_sent_date` is missing but `signed_date` exists, the export infers `contract_sent_date = signed_date` and flags this with `contract_sent_inferred = Yes`.

**Rationale**: Agents sometimes skip intermediate stages when updating the CRM. A signed contract inherently means a contract was sent.

### 2. Agent Attribution (Historical Data)

**Assumption**: Before December 19, 2025, the `assigned_user_name` column was not populated in the database. For these older records:

1. First try `assigned_user_name` column
2. Fall back to `raw_payload->>'assignedTo'` from the webhook payload
3. For records before Dec 19, 2025 with no agent info, default to "Madeleine Penales" (she was the only acquisition agent at that time)

**Implementation**:
```sql
COALESCE(
    assigned_user_name,
    raw_payload->>'assignedTo',
    CASE WHEN changed_at < '2025-12-19' THEN 'Madeleine Penales' ELSE 'Unassigned' END
) as agent
```

### 3. Connection Definition

**Assumption**: A "connection" is defined as a call lasting >= 2 minutes (120 seconds). Calls shorter than this threshold are considered no-answer/voicemail.

**Rationale**: A meaningful conversation where information is exchanged typically requires at least 2 minutes.

### 4. First Connection Timing

**Assumption**: The `first_connection` field represents the first 2+ minute call to a lead, which may have occurred before or after they entered a tracked acquisition stage.

**Implementation**: Call data is fetched starting 60 days before the analysis period to capture connections that occurred before offers were made.

### 5. Unique Lead Counting

**Assumption**: A lead should only be counted once per stage, even if they move in and out of a stage multiple times.

**Implementation**: Uses `COUNT(DISTINCT person_id)` and `DISTINCT ON (person_id)` to prevent duplicate counting.

### 6. Entered System Date

**Assumption**: The `entered_system` date is approximated as the earliest `changed_at` timestamp in the `stage_changes` table for that lead. This represents when we first started tracking the lead, not necessarily when they were created in FUB.

## Output Files

Located in: `exports/` directory

| File | Description |
|------|-------------|
| `dataset1_signed_contracts.csv` | All leads that signed contracts |
| `dataset2_contracts_not_signed.csv` | Leads with contracts sent but not signed |
| `dataset3_offers_no_contract.csv` | Leads with verbal offers but no contract sent |

## Data Dictionary

### Dataset 1: Signed Contracts

| Column | Type | Description |
|--------|------|-------------|
| `person_id` | String | FUB lead/person ID |
| `lead_name` | String | First and last name |
| `county` | String | Property county |
| `state` | String | Property state (2-letter code) |
| `agent` | String | Assigned acquisition manager |
| `entered_system` | Date | First appearance in stage tracking (YYYY-MM-DD) |
| `first_connection` | Date | First 2+ min call (YYYY-MM-DD), blank if none |
| `verbal_offer_date` | Date | Date moved to "ACQ - Offers Made" |
| `contract_sent_date` | Date | Date moved to "ACQ - Contract Sent" (may be inferred) |
| `contract_sent_inferred` | String | "Yes" if contract_sent_date was inferred from signed_date |
| `signed_date` | Date | Date moved to "ACQ - Under Contract" |

### Dataset 2: Contracts Not Signed

| Column | Type | Description |
|--------|------|-------------|
| `person_id` | String | FUB lead/person ID |
| `lead_name` | String | First and last name |
| `county` | String | Property county |
| `state` | String | Property state |
| `agent` | String | Assigned acquisition manager |
| `entered_system` | Date | First appearance in stage tracking |
| `first_connection` | Date | First 2+ min call, blank if none |
| `verbal_offer_date` | Date | Date moved to "ACQ - Offers Made" |
| `contract_sent_date` | Date | Date moved to "ACQ - Contract Sent" |

### Dataset 3: Offers No Contract

| Column | Type | Description |
|--------|------|-------------|
| `person_id` | String | FUB lead/person ID |
| `lead_name` | String | First and last name |
| `county` | String | Property county |
| `state` | String | Property state |
| `agent` | String | Assigned acquisition manager |
| `entered_system` | Date | First appearance in stage tracking |
| `first_connection` | Date | First 2+ min call, blank if none |
| `verbal_offer_date` | Date | Date moved to "ACQ - Offers Made" |

## Running the Export

### Command

```bash
python reports/export_lead_analysis.py --start-date YYYY-MM-DD --end-date YYYY-MM-DD
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--start-date` | 2025-10-27 | Start of analysis period |
| `--end-date` | 2026-01-12 | End of analysis period |
| `--output-dir` | exports | Output directory for CSV files |

### Example: Q4 2025 Analysis

```bash
python reports/export_lead_analysis.py --start-date 2025-10-01 --end-date 2025-12-31
```

### Example: Q1 2026 Analysis

```bash
python reports/export_lead_analysis.py --start-date 2026-01-01 --end-date 2026-03-31
```

## Data Quality Notes

### Missing First Connection Data

Some leads may have blank `first_connection` values. This occurs when:

- The lead was never called
- All calls to the lead were under 2 minutes
- The call occurred outside the data fetch window (60 days before start date)
- The call was not logged in FUB

### Missing Verbal Offer Date

Some signed contracts may have blank `verbal_offer_date`. This occurs when the agent moved the lead directly to "Contract Sent" or "Under Contract" without first moving to "Offers Made".

### API Limitations

The FUB API has pagination limits. The export fetches calls in weekly chunks to avoid hitting rate limits. Large date ranges may take several minutes to process.

## Quarterly Analysis Checklist

Before running the quarterly analysis:

1. [ ] Confirm date range covers the full quarter
2. [ ] Verify both agents are still active and should be included
3. [ ] Check for any new acquisition agents to add to `INCLUDED_AGENTS`
4. [ ] Review stage names haven't changed in FUB
5. [ ] Confirm connection threshold (2 min) is still appropriate

After running:

1. [ ] Verify row counts are reasonable
2. [ ] Check for unexpected blank values
3. [ ] Review `contract_sent_inferred` count
4. [ ] Spot-check a few records against FUB for accuracy

## Call Activity Export

In addition to the lead milestone data, a separate export provides call activity metrics for predictive analysis.

### Running the Call Activity Export

```bash
python reports/export_call_activity.py --start-date YYYY-MM-DD --end-date YYYY-MM-DD
```

### Output Files

| File | Description |
|------|-------------|
| `call_activity_aggregated.csv` | Per-lead call metrics (join on person_id) |
| `call_activity_detail.csv` | Individual call records |

### Key Metrics Provided

- Total calls and connections per lead
- First call/connection dates
- Calls before first connection (persistence metric)
- Calls before vs. after verbal offer
- Call-level detail with disposition (connected, voicemail, no answer)

See `exports/CALL_ACTIVITY_DATA_DESCRIPTION.md` for full column documentation.

## Related Files

- `reports/export_lead_analysis.py` - Lead milestone export script
- `reports/export_call_activity.py` - Call activity export script
- `reports/weekly_agent_report.py` - Weekly KPI report (uses similar logic)
- `docs/DATA_SOURCES.md` - General data source documentation
- `exports/DATA_DESCRIPTION_FOR_ANALYST.md` - Analyst guide for milestone data
- `exports/CALL_ACTIVITY_DATA_DESCRIPTION.md` - Analyst guide for call data

## Change Log

| Date | Change |
|------|--------|
| 2026-01-25 | Initial documentation created |
| 2026-01-25 | Added contract_sent_inferred logic |
| 2026-01-25 | Fixed person_id type matching (string vs int) |
| 2026-01-25 | Added call activity export for predictive analysis |
