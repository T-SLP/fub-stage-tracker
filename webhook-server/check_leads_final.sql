-- Final SQL queries using your EXACT database schema
-- Check for Rose Hutton and Gary Yarbrough "ACQ - Offers Made" stage

-- QUERY 1: Direct check for "ACQ - Offers Made" stage
SELECT 
    first_name,
    last_name,
    stage_from,
    stage_to,
    changed_at,
    campaign_id,
    who_pushed_lead,
    lead_source_tag,
    parcel_county,
    parcel_state
FROM stage_changes 
WHERE 
    (
        (LOWER(first_name) = 'rose' AND LOWER(last_name) = 'hutton')
        OR 
        (LOWER(first_name) = 'gary' AND LOWER(last_name) = 'yarbrough')
    )
    AND stage_to = 'ACQ - Offers Made'
ORDER BY changed_at DESC;

-- QUERY 2: Complete stage journey for both leads
SELECT 
    first_name,
    last_name,
    stage_from,
    stage_to,
    changed_at,
    campaign_id,
    who_pushed_lead,
    lead_source_tag
FROM stage_changes 
WHERE 
    (
        (LOWER(first_name) = 'rose' AND LOWER(last_name) = 'hutton')
        OR 
        (LOWER(first_name) = 'gary' AND LOWER(last_name) = 'yarbrough')
    )
ORDER BY first_name, last_name, changed_at ASC;

-- QUERY 3: Check if these leads exist at all in your database
SELECT DISTINCT
    first_name,
    last_name,
    person_id,
    COUNT(*) as total_stage_changes,
    MAX(changed_at) as last_stage_change,
    MAX(stage_to) as current_stage
FROM stage_changes 
WHERE 
    (
        (LOWER(first_name) = 'rose' AND LOWER(last_name) = 'hutton')
        OR 
        (LOWER(first_name) = 'gary' AND LOWER(last_name) = 'yarbrough')
    )
GROUP BY first_name, last_name, person_id
ORDER BY first_name, last_name;

-- QUERY 4: Fuzzy search for similar names
SELECT 
    first_name,
    last_name,
    stage_to,
    changed_at,
    campaign_id,
    lead_source_tag
FROM stage_changes 
WHERE 
    (
        (first_name ILIKE '%rose%' AND last_name ILIKE '%hutt%')
        OR 
        (first_name ILIKE '%gary%' AND last_name ILIKE '%yarbr%')
    )
    AND stage_to = 'ACQ - Offers Made'
ORDER BY changed_at DESC;

-- QUERY 5: Recent "ACQ - Offers Made" activity (for context)
SELECT 
    first_name,
    last_name,
    changed_at,
    campaign_id,
    lead_source_tag
FROM stage_changes 
WHERE stage_to = 'ACQ - Offers Made'
AND changed_at >= NOW() - INTERVAL '30 days'
ORDER BY changed_at DESC
LIMIT 20;