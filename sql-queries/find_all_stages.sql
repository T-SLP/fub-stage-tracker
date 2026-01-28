-- Find all unique stage names in the database
SELECT DISTINCT stage_to as stage_name
FROM stage_changes
ORDER BY stage_to;
