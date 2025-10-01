// check-duplicates.js
// Script to check for duplicate stage_changes records

require('dotenv').config();
const { Client } = require('pg');

async function checkDuplicates() {
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check for exact duplicates (same person, stage, timestamp)
    console.log('🔍 Checking for exact duplicate records...\n');
    const exactDuplicatesQuery = `
      SELECT
        person_id,
        first_name,
        last_name,
        stage_from,
        stage_to,
        changed_at,
        COUNT(*) as duplicate_count
      FROM stage_changes
      GROUP BY person_id, first_name, last_name, stage_from, stage_to, changed_at
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC, changed_at DESC
      LIMIT 20
    `;

    const exactDuplicates = await client.query(exactDuplicatesQuery);

    if (exactDuplicates.rows.length > 0) {
      console.log(`❌ Found ${exactDuplicates.rows.length} sets of exact duplicates:\n`);
      exactDuplicates.rows.forEach(row => {
        console.log(`  ${row.first_name} ${row.last_name} (${row.person_id})`);
        console.log(`    ${row.stage_from} → ${row.stage_to} at ${row.changed_at}`);
        console.log(`    Appears ${row.duplicate_count} times`);
        console.log('');
      });
    } else {
      console.log('✅ No exact duplicates found\n');
    }

    // Check for near-duplicates (same person, same stage transition, within 1 minute)
    console.log('🔍 Checking for near-duplicate records (within 1 minute)...\n');
    const nearDuplicatesQuery = `
      WITH ranked_changes AS (
        SELECT
          id,
          person_id,
          first_name,
          last_name,
          stage_from,
          stage_to,
          changed_at,
          LAG(changed_at) OVER (
            PARTITION BY person_id, stage_from, stage_to
            ORDER BY changed_at
          ) as prev_changed_at
        FROM stage_changes
        WHERE changed_at >= NOW() - INTERVAL '7 days'
      )
      SELECT
        person_id,
        first_name,
        last_name,
        stage_from,
        stage_to,
        changed_at,
        prev_changed_at,
        EXTRACT(EPOCH FROM (changed_at - prev_changed_at)) as seconds_diff
      FROM ranked_changes
      WHERE prev_changed_at IS NOT NULL
        AND changed_at - prev_changed_at < INTERVAL '1 minute'
      ORDER BY changed_at DESC
      LIMIT 20
    `;

    const nearDuplicates = await client.query(nearDuplicatesQuery);

    if (nearDuplicates.rows.length > 0) {
      console.log(`⚠️  Found ${nearDuplicates.rows.length} near-duplicate records (within 1 minute):\n`);
      nearDuplicates.rows.forEach(row => {
        console.log(`  ${row.first_name} ${row.last_name} (${row.person_id})`);
        console.log(`    ${row.stage_from} → ${row.stage_to}`);
        console.log(`    First: ${row.prev_changed_at}`);
        console.log(`    Second: ${row.changed_at} (${Math.round(row.seconds_diff)}s later)`);
        console.log('');
      });
    } else {
      console.log('✅ No near-duplicates found\n');
    }

    // Check table constraints
    console.log('🔍 Checking table structure and constraints...\n');
    const constraintsQuery = `
      SELECT
        constraint_name,
        constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'stage_changes'
    `;

    const constraints = await client.query(constraintsQuery);
    console.log('Table constraints:');
    if (constraints.rows.length > 0) {
      constraints.rows.forEach(row => {
        console.log(`  - ${row.constraint_name}: ${row.constraint_type}`);
      });
    } else {
      console.log('  ⚠️  No constraints found - this could allow duplicates!');
    }
    console.log('');

    // Check total record count
    const countQuery = `SELECT COUNT(*) as total FROM stage_changes`;
    const totalCount = await client.query(countQuery);
    console.log(`📊 Total stage_changes records: ${totalCount.rows[0].total}\n`);

    await client.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDuplicates();
