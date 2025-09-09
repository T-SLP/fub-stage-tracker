-- SIMPLIFIED SQL Script - works with basic database schema
-- Check if Rose Hutton and Gary Yarbrough reached "ACQ - Offers Made" stage

-- Option 1: Check specific leads for "ACQ - Offers Made" stage
SELECT 
    first_name,
    last_name,
    stage_to,
    stage_from,
    changed_at,
    source
FROM stage_changes 
WHERE 
    (
        (LOWER(first_name) = 'rose' AND LOWER(last_name) = 'hutton')
        OR 
        (LOWER(first_name) = 'gary' AND LOWER(last_name) = 'yarbrough')
    )
    AND stage_to = 'ACQ - Offers Made'
ORDER BY changed_at DESC;

-- Option 2: Show ALL stage changes for these specific leads (SIMPLIFIED)
SELECT 
    first_name,
    last_name,
    stage_from,
    stage_to,
    changed_at,
    source
FROM stage_changes 
WHERE 
    (
        (LOWER(first_name) = 'rose' AND LOWER(last_name) = 'hutton')
        OR 
        (LOWER(first_name) = 'gary' AND LOWER(last_name) = 'yarbrough')
    )
ORDER BY first_name, last_name, changed_at ASC;

-- Option 3: Check what columns actually exist in your table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'stage_changes'
ORDER BY ordinal_position;

-- Option 4: Check if these leads exist at all in the database
SELECT DISTINCT
    first_name,
    last_name,
    person_id,
    COUNT(*) as total_stage_changes,
    MAX(changed_at) as last_stage_change
FROM stage_changes 
WHERE 
    (
        (LOWER(first_name) = 'rose' AND LOWER(last_name) = 'hutton')
        OR 
        (LOWER(first_name) = 'gary' AND LOWER(last_name) = 'yarbrough')
    )
GROUP BY first_name, last_name, person_id
ORDER BY first_name, last_name;