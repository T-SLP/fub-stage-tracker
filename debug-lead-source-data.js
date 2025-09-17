// Debug lead source data inconsistencies across time frames
const { Client } = require('pg');
require('dotenv').config();

async function debugLeadSourceData() {
    console.log('🔍 DEBUGGING: Lead source data inconsistencies');
    console.log('=' .repeat(50));
    console.log('Analyzing lead source data across different time frames\n');

    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        // Check current week qualified leads with lead sources
        console.log('📊 CURRENT WEEK LEAD SOURCES:');
        console.log('-'.repeat(35));

        const currentWeekQuery = `
            SELECT
                lead_source_tag,
                COUNT(*) as count,
                STRING_AGG(first_name || ' ' || last_name, ', ') as names
            FROM stage_changes
            WHERE stage_to = 'ACQ - Qualified'
              AND changed_at >= date_trunc('week', CURRENT_DATE)
              AND changed_at <= NOW()
            GROUP BY lead_source_tag
            ORDER BY count DESC;
        `;

        const currentWeekResult = await client.query(currentWeekQuery);

        console.log('Current week qualified leads by source:');
        currentWeekResult.rows.forEach(row => {
            const source = row.lead_source_tag || 'Unknown';
            console.log(`  ${source}: ${row.count} leads`);
            console.log(`    Names: ${row.names}`);
        });
        console.log('');

        // Check last week qualified leads with lead sources
        console.log('📊 LAST WEEK LEAD SOURCES:');
        console.log('-'.repeat(32));

        const lastWeekQuery = `
            SELECT
                lead_source_tag,
                COUNT(*) as count,
                STRING_AGG(first_name || ' ' || last_name, ', ') as names
            FROM stage_changes
            WHERE stage_to = 'ACQ - Qualified'
              AND changed_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days'
              AND changed_at < date_trunc('week', CURRENT_DATE)
            GROUP BY lead_source_tag
            ORDER BY count DESC;
        `;

        const lastWeekResult = await client.query(lastWeekQuery);

        console.log('Last week qualified leads by source:');
        lastWeekResult.rows.forEach(row => {
            const source = row.lead_source_tag || 'Unknown';
            console.log(`  ${source}: ${row.count} leads`);
            console.log(`    Names: ${row.names}`);
        });
        console.log('');

        // Check 30-day period lead sources
        console.log('📊 LAST 30 DAYS LEAD SOURCES:');
        console.log('-'.repeat(35));

        const thirtyDayQuery = `
            SELECT
                lead_source_tag,
                COUNT(*) as count,
                STRING_AGG(first_name || ' ' || last_name, ', ') as names
            FROM stage_changes
            WHERE stage_to = 'ACQ - Qualified'
              AND changed_at >= CURRENT_DATE - INTERVAL '30 days'
              AND changed_at <= NOW()
            GROUP BY lead_source_tag
            ORDER BY count DESC;
        `;

        const thirtyDayResult = await client.query(thirtyDayQuery);

        console.log('Last 30 days qualified leads by source:');
        thirtyDayResult.rows.forEach(row => {
            const source = row.lead_source_tag || 'Unknown';
            console.log(`  ${source}: ${row.count} leads`);
        });
        console.log('');

        // Analyze lead_source_tag field quality
        console.log('🔍 LEAD SOURCE TAG ANALYSIS:');
        console.log('-'.repeat(35));

        const sourceAnalysisQuery = `
            SELECT
                CASE
                    WHEN lead_source_tag IS NULL THEN 'NULL'
                    WHEN lead_source_tag = '' THEN 'EMPTY_STRING'
                    WHEN TRIM(lead_source_tag) = '' THEN 'WHITESPACE_ONLY'
                    ELSE lead_source_tag
                END as source_category,
                COUNT(*) as total_records,
                COUNT(CASE WHEN stage_to = 'ACQ - Qualified' THEN 1 END) as qualified_records
            FROM stage_changes
            WHERE changed_at >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY source_category
            ORDER BY total_records DESC;
        `;

        const sourceAnalysisResult = await client.query(sourceAnalysisQuery);

        console.log('Lead source tag quality analysis:');
        sourceAnalysisResult.rows.forEach(row => {
            console.log(`  ${row.source_category}: ${row.total_records} total records, ${row.qualified_records} qualified`);
        });
        console.log('');

        // Check recent records with detailed lead source info
        console.log('🕐 RECENT QUALIFIED LEADS DETAIL:');
        console.log('-'.repeat(38));

        const recentQualifiedQuery = `
            SELECT
                first_name,
                last_name,
                lead_source_tag,
                changed_at,
                source
            FROM stage_changes
            WHERE stage_to = 'ACQ - Qualified'
              AND changed_at >= CURRENT_DATE - INTERVAL '7 days'
            ORDER BY changed_at DESC
            LIMIT 15;
        `;

        const recentQualifiedResult = await client.query(recentQualifiedQuery);

        console.log('Recent qualified leads:');
        recentQualifiedResult.rows.forEach((row, index) => {
            const source = row.lead_source_tag || 'Unknown';
            const date = new Date(row.changed_at).toDateString();
            console.log(`${index + 1}. ${row.first_name} ${row.last_name}`);
            console.log(`   Lead Source: "${source}"`);
            console.log(`   Date: ${date}`);
            console.log(`   Data Source: ${row.source}`);
            console.log('');
        });

        // Check if there's a pattern with webhook vs polling data
        console.log('📡 LEAD SOURCE BY DATA SOURCE:');
        console.log('-'.repeat(35));

        const sourceByOriginQuery = `
            SELECT
                CASE
                    WHEN source LIKE 'webhook_%' THEN 'WEBHOOK'
                    ELSE 'OTHER'
                END as data_source,
                lead_source_tag,
                COUNT(*) as count
            FROM stage_changes
            WHERE stage_to = 'ACQ - Qualified'
              AND changed_at >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY data_source, lead_source_tag
            ORDER BY data_source, count DESC;
        `;

        const sourceByOriginResult = await client.query(sourceByOriginQuery);

        console.log('Lead sources by data origin:');
        let currentOrigin = '';
        sourceByOriginResult.rows.forEach(row => {
            if (row.data_source !== currentOrigin) {
                console.log(`\n${row.data_source} records:`);
                currentOrigin = row.data_source;
            }
            const source = row.lead_source_tag || 'Unknown';
            console.log(`  ${source}: ${row.count}`);
        });

        console.log('\n🎯 DIAGNOSIS:');
        console.log('-'.repeat(15));

        const unknownCurrentWeek = currentWeekResult.rows.find(row => !row.lead_source_tag);
        const unknownLastWeek = lastWeekResult.rows.find(row => !row.lead_source_tag);

        if (unknownCurrentWeek && !unknownLastWeek) {
            console.log('✅ ISSUE IDENTIFIED:');
            console.log('   • Current week shows many "Unknown" sources');
            console.log('   • Previous periods show proper source names like "Roor"');
            console.log('   • This suggests recent data has missing lead_source_tag values');
            console.log('');
            console.log('💡 POSSIBLE CAUSES:');
            console.log('   1. Recent webhook payload changes missing lead source data');
            console.log('   2. Polling logic not capturing lead source properly');
            console.log('   3. Database field not being populated for new records');
            console.log('   4. Lead source mapping logic broken for recent data');
        } else if (!unknownCurrentWeek && !unknownLastWeek) {
            console.log('🤔 NO OBVIOUS DATA ISSUE FOUND');
            console.log('   • Check dashboard frontend logic for lead source filtering');
            console.log('   • Verify time range calculation matches backend queries');
        } else {
            console.log('📊 MIXED RESULTS - Need deeper investigation');
        }

        await client.end();

    } catch (error) {
        console.error('❌ ERROR:', error.message);
        await client.end();
    }
}

debugLeadSourceData().catch(console.error);