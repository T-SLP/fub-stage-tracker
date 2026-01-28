-- Investigate why who_pushed_lead is NULL for throwaway leads

-- 1. Check date distribution of Unknown vs Known who_pushed_lead
SELECT
    CASE
        WHEN who_pushed_lead IS NULL THEN 'Unknown/Not Set'
        ELSE 'Has Value'
    END as who_pushed_status,
    COUNT(*) as count,
    MIN(changed_at) as earliest_date,
    MAX(changed_at) as latest_date,
    COUNT(DISTINCT campaign_id) as num_campaigns
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
GROUP BY who_pushed_status
ORDER BY count DESC;


-- 2. Show specific examples of Unknown throwaway leads with all available info
SELECT
    first_name,
    last_name,
    stage_from,
    stage_to,
    changed_at,
    campaign_id,
    lead_source_tag,
    source,
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
    AND who_pushed_lead IS NULL
ORDER BY changed_at DESC
LIMIT 20;


-- 3. Check if raw_payload contains who_pushed_lead data that wasn't extracted
-- (This will help determine if we can backfill the data)
SELECT
    first_name,
    last_name,
    changed_at,
    campaign_id,
    who_pushed_lead,
    raw_payload::text LIKE '%WhoPushedTheLead%' as has_who_pushed_in_payload,
    raw_payload::text LIKE '%customWhoPushedTheLead%' as has_custom_who_pushed_in_payload
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
    AND who_pushed_lead IS NULL
LIMIT 10;


-- 4. Compare campaigns - which campaigns have more Unknown values?
SELECT
    campaign_id,
    COUNT(*) FILTER (WHERE who_pushed_lead IS NULL) as unknown_count,
    COUNT(*) FILTER (WHERE who_pushed_lead IS NOT NULL) as known_count,
    COUNT(*) as total_throwaway_leads,
    ROUND(100.0 * COUNT(*) FILTER (WHERE who_pushed_lead IS NULL) / COUNT(*), 1) as percent_unknown
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
GROUP BY campaign_id
ORDER BY unknown_count DESC;
