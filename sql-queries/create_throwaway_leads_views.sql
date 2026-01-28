-- Create reusable views for throwaway leads analysis

-- View 1: Summary by who pushed lead (past 60 days)
CREATE OR REPLACE VIEW throwaway_leads_summary_60d AS
SELECT
    COALESCE(who_pushed_lead, 'Unknown/Not Set') as who_pushed_lead,
    COUNT(*) as throwaway_count,
    COUNT(DISTINCT campaign_id) as num_campaigns,
    STRING_AGG(DISTINCT stage_to, ', ') as throwaway_stages_used,
    MIN(changed_at) as first_throwaway,
    MAX(changed_at) as latest_throwaway
FROM stage_changes
WHERE
    stage_from IN (
        'ACQ - Qualified',
        'Qualified Phase 2 - Day 3 to 2 Weeks',
        'Qualified Phase 3 - 2 Weeks to 4 Weeks'
    )
    AND stage_to IN (
        'ACQ - Price Motivated',
        'ACQ - Not Interested',
        'ACQ - Not Ready to Sell',
        'ACQ - Dead / DNC'
    )
    AND changed_at >= NOW() - INTERVAL '60 days'
GROUP BY who_pushed_lead
ORDER BY throwaway_count DESC;

-- View 2: Detailed throwaway leads (past 60 days)
CREATE OR REPLACE VIEW throwaway_leads_detail_60d AS
SELECT
    who_pushed_lead,
    first_name,
    last_name,
    stage_from,
    stage_to,
    changed_at,
    campaign_id,
    lead_source_tag,
    parcel_county,
    parcel_state,
    person_id
FROM stage_changes
WHERE
    stage_from IN (
        'ACQ - Qualified',
        'Qualified Phase 2 - Day 3 to 2 Weeks',
        'Qualified Phase 3 - 2 Weeks to 4 Weeks'
    )
    AND stage_to IN (
        'ACQ - Price Motivated',
        'ACQ - Not Interested',
        'ACQ - Not Ready to Sell',
        'ACQ - Dead / DNC'
    )
    AND changed_at >= NOW() - INTERVAL '60 days'
ORDER BY who_pushed_lead, changed_at DESC;

-- View 3: Breakdown by person and stage (past 60 days)
CREATE OR REPLACE VIEW throwaway_leads_breakdown_60d AS
SELECT
    COALESCE(who_pushed_lead, 'Unknown/Not Set') as who_pushed_lead,
    stage_to as throwaway_stage,
    COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY who_pushed_lead), 2) as percentage_of_person_total
FROM stage_changes
WHERE
    stage_from IN (
        'ACQ - Qualified',
        'Qualified Phase 2 - Day 3 to 2 Weeks',
        'Qualified Phase 3 - 2 Weeks to 4 Weeks'
    )
    AND stage_to IN (
        'ACQ - Price Motivated',
        'ACQ - Not Interested',
        'ACQ - Not Ready to Sell',
        'ACQ - Dead / DNC'
    )
    AND changed_at >= NOW() - INTERVAL '60 days'
GROUP BY who_pushed_lead, stage_to
ORDER BY who_pushed_lead, count DESC;

-- Grant permissions (adjust as needed)
-- GRANT SELECT ON throwaway_leads_summary_60d TO authenticated;
-- GRANT SELECT ON throwaway_leads_detail_60d TO authenticated;
-- GRANT SELECT ON throwaway_leads_breakdown_60d TO authenticated;
