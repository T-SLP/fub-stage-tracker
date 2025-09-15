const { Client } = require('pg');
require('dotenv').config();

async function checkConstraints() {
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        console.log('=== DATABASE SCHEMA ANALYSIS ===');

        // Check current field lengths
        const schemaQuery = `
            SELECT
                column_name,
                data_type,
                character_maximum_length,
                is_nullable
            FROM information_schema.columns
            WHERE table_name = 'stage_changes'
            ORDER BY ordinal_position;
        `;

        const schemaResult = await client.query(schemaQuery);

        console.log('Current field specifications:');
        schemaResult.rows.forEach(row => {
            const maxLength = row.character_maximum_length || 'unlimited';
            console.log(`  ${row.column_name}: ${row.data_type}(${maxLength})`);
        });

        // Check for recent database errors or constraint violations
        console.log('\n=== CHECKING FOR RECENT ERRORS ===');

        // Look for any failed inserts in the last few days
        const errorQuery = `
            SELECT
                COUNT(*) as total_records,
                MAX(received_at) as most_recent,
                MIN(received_at) as oldest
            FROM stage_changes
            WHERE received_at >= NOW() - INTERVAL '7 days'
        `;

        const errorResult = await client.query(errorQuery);
        console.log('Recent records:', errorResult.rows[0]);

        // Check source field lengths
        const sourceQuery = `
            SELECT
                source,
                LENGTH(source) as source_length,
                COUNT(*) as count
            FROM stage_changes
            WHERE received_at >= NOW() - INTERVAL '7 days'
            GROUP BY source
            ORDER BY source_length DESC;
        `;

        const sourceResult = await client.query(sourceQuery);
        console.log('\nRecent source field usage:');
        sourceResult.rows.forEach(row => {
            const warning = row.source_length > 20 ? ' ⚠️ EXCEEDS VARCHAR(20)' : '';
            console.log(`  ${row.source} (${row.source_length} chars, ${row.count} records)${warning}`);
        });

        await client.end();

    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkConstraints().catch(console.error);