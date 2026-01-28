-- Create a reusable function to get throwaway leads for any time period

CREATE OR REPLACE FUNCTION get_throwaway_leads_summary(days_back INTEGER DEFAULT 60)
RETURNS TABLE (
    who_pushed_lead TEXT,
    throwaway_count BIGINT,
    num_campaigns BIGINT,
    throwaway_stages_used TEXT,
    first_throwaway TIMESTAMP,
    latest_throwaway TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(sc.who_pushed_lead, 'Unknown/Not Set') as who_pushed_lead,
        COUNT(*)::BIGINT as throwaway_count,
        COUNT(DISTINCT sc.campaign_id)::BIGINT as num_campaigns,
        STRING_AGG(DISTINCT sc.stage_to, ', ') as throwaway_stages_used,
        MIN(sc.changed_at) as first_throwaway,
        MAX(sc.changed_at) as latest_throwaway
    FROM stage_changes sc
    WHERE
        sc.stage_from IN (
            'ACQ - Qualified',
            'Qualified Phase 2 - Day 3 to 2 Weeks',
            'Qualified Phase 3 - 2 Weeks to 4 Weeks'
        )
        AND sc.stage_to IN (
            'ACQ - Price Motivated',
            'ACQ - Not Interested',
            'ACQ - Not Ready to Sell',
            'ACQ - Dead / DNC'
        )
        AND sc.changed_at >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY sc.who_pushed_lead
    ORDER BY throwaway_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Usage examples:
-- SELECT * FROM get_throwaway_leads_summary(60);  -- Past 60 days (default)
-- SELECT * FROM get_throwaway_leads_summary(30);  -- Past 30 days
-- SELECT * FROM get_throwaway_leads_summary(90);  -- Past 90 days
