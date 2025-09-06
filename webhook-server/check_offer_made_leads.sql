-- SQL Script to check if Rose Hutton and Gary Yarbrough reached "ACQ - Offers Made" stage
-- Run this against your Supabase/PostgreSQL database

-- Option 1: Check specific leads for "ACQ - Offers Made" stage
SELECT 
    first_name,
    last_name,
    stage_to,
    stage_from,
    changed_at,
    source,
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
    AND stage_to = 'ACQ - Offers Made'
ORDER BY changed_at DESC;

-- Option 2: Show ALL stage changes for these specific leads to see their complete journey
SELECT 
    first_name,
    last_name,
    stage_from,
    stage_to,
    changed_at,
    source,
    time_in_previous_stage_days,
    time_in_previous_stage_hours,
    campaign_id,
    lead_source_tag
FROM stage_changes 
WHERE 
    (
        (LOWER(first_name) = 'rose' AND LOWER(last_name) = 'hutton')
        OR 
        (LOWER(first_name) = 'gary' AND LOWER(last_name) = 'yarbrough')
    )
ORDER BY first_name, last_name, changed_at ASC;

-- Option 3: Check if these leads exist in the database at all (any stage)
SELECT DISTINCT
    first_name,
    last_name,
    person_id,
    COUNT(*) as total_stage_changes,
    MAX(changed_at) as last_stage_change,
    STRING_AGG(DISTINCT stage_to, ', ' ORDER BY stage_to) as all_stages_reached
FROM stage_changes 
WHERE 
    (
        (LOWER(first_name) = 'rose' AND LOWER(last_name) = 'hutton')
        OR 
        (LOWER(first_name) = 'gary' AND LOWER(last_name) = 'yarbrough')
    )
GROUP BY first_name, last_name, person_id
ORDER BY first_name, last_name;

-- Option 4: Check for similar names (in case of slight variations)
SELECT 
    first_name,
    last_name,
    stage_to,
    changed_at,
    source
FROM stage_changes 
WHERE 
    (
        (first_name ILIKE '%rose%' AND last_name ILIKE '%hutt%')
        OR 
        (first_name ILIKE '%gary%' AND last_name ILIKE '%yarbr%')
    )
    AND stage_to = 'ACQ - Offers Made'
ORDER BY changed_at DESC;

-- Option 5: Summary - Count of all leads that reached "ACQ - Offers Made" recently
SELECT 
    COUNT(*) as total_offer_made_leads,
    COUNT(DISTINCT person_id) as unique_people,
    MIN(changed_at) as earliest_offer_made,
    MAX(changed_at) as latest_offer_made
FROM stage_changes 
WHERE stage_to = 'ACQ - Offers Made'
AND changed_at >= NOW() - INTERVAL '30 days';