-- Throwaway Leads Report - Past 60 Days
-- Shows who generated "throwaway leads" (qualified leads that moved to disqualified stages)

-- SUMMARY: Count by who pushed lead
SELECT
    COALESCE(who_pushed_lead, 'Unknown/Not Set') as who_pushed_lead,
    COUNT(*) as throwaway_count,
    COUNT(DISTINCT campaign_id) as num_campaigns,
    STRING_AGG(DISTINCT stage_to, ', ') as throwaway_stages_used
FROM stage_changes
WHERE
    -- From qualified stages
    stage_from IN (
        'ACQ - Qualified',
        'Qualified Phase 2 - Day 3 to 2 Weeks',
        'Qualified Phase 3 - 2 Weeks to 4 Weeks'
    )
    -- To throwaway stages
    AND stage_to IN (
        'ACQ - Price Motivated',
        'ACQ - Not Interested',
        'ACQ - Not Ready to Sell',
        'ACQ - Dead / DNC'
    )
    -- Past 60 days
    AND changed_at >= NOW() - INTERVAL '60 days'
GROUP BY who_pushed_lead
ORDER BY throwaway_count DESC;


-- DETAILED: All throwaway leads with person details
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
    parcel_state
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


-- BREAKDOWN: Count by person and throwaway stage
SELECT
    COALESCE(who_pushed_lead, 'Unknown/Not Set') as who_pushed_lead,
    stage_to as throwaway_stage,
    COUNT(*) as count
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
