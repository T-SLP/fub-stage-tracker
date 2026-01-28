-- Backfill who_pushed_lead from raw_payload if available
-- RUN THE INVESTIGATION QUERIES FIRST to see if this is possible!

-- Check if we can extract who_pushed_lead from raw_payload
SELECT
    id,
    first_name,
    last_name,
    changed_at,
    who_pushed_lead as current_value,
    raw_payload->'person'->>'customWhoPushedTheLead' as extracted_value
FROM stage_changes
WHERE
    who_pushed_lead IS NULL
    AND raw_payload IS NOT NULL
    AND raw_payload->'person'->>'customWhoPushedTheLead' IS NOT NULL
LIMIT 10;


-- If the above query shows data CAN be extracted, uncomment and run this UPDATE:
/*
UPDATE stage_changes
SET who_pushed_lead = raw_payload->'person'->>'customWhoPushedTheLead'
WHERE
    who_pushed_lead IS NULL
    AND raw_payload IS NOT NULL
    AND raw_payload->'person'->>'customWhoPushedTheLead' IS NOT NULL
    AND raw_payload->'person'->>'customWhoPushedTheLead' != '';

-- Check how many records were updated
-- SELECT COUNT(*) FROM stage_changes WHERE who_pushed_lead IS NOT NULL;
*/
