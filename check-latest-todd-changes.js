// Check if Todd's latest stage changes are in database and why dashboard isn't updating
const { Client } = require('pg');
require('dotenv').config();

async function checkLatestToddChanges() {
    console.log('🔍 CHECKING: Todd\'s Latest Stage Changes');
    console.log('=' .repeat(45));
    console.log('Verifying database records vs dashboard display\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Check Todd's recent records
        console.log('📋 TODD\'S RECENT STAGE CHANGES:');
        console.log('-'.repeat(35));
        
        const toddQuery = `
            SELECT 
                id,
                first_name,
                last_name,
                stage_from,
                stage_to,
                changed_at,
                received_at,
                source,
                event_id,
                EXTRACT(EPOCH FROM (NOW() - received_at))/60 as minutes_ago
            FROM stage_changes 
            WHERE (LOWER(first_name) LIKE '%todd%' AND LOWER(last_name) LIKE '%brumm%')
               OR (LOWER(first_name) LIKE '%brumm%' AND LOWER(last_name) LIKE '%todd%')
            ORDER BY received_at DESC
            LIMIT 10;
        `;
        
        const toddResult = await client.query(toddQuery);
        
        if (toddResult.rows.length === 0) {
            console.log('❌ No Todd Brumm records found');
            return;
        }
        
        console.log(`Found ${toddResult.rows.length} Todd Brumm records:`);
        
        let latestWebhookRecord = null;
        
        toddResult.rows.forEach((row, index) => {
            const isWebhook = row.source && row.source.startsWith('webhook_');
            const ago = Math.round(row.minutes_ago);
            const timeStr = ago < 60 ? `${ago} min ago` : `${Math.round(ago/60)} hrs ago`;
            
            console.log(`${index + 1}. ${row.first_name} ${row.last_name}`);
            console.log(`   ${row.stage_from || 'NEW'} → ${row.stage_to}`);
            console.log(`   ${timeStr} (${row.source})`);
            console.log(`   Changed: ${new Date(row.changed_at).toLocaleString()}`);
            
            if (isWebhook && (!latestWebhookRecord || row.received_at > latestWebhookRecord.received_at)) {
                latestWebhookRecord = row;
            }
            
            if (isWebhook && ago < 10) {
                console.log(`   🚀 RECENT WEBHOOK - Should appear on dashboard!`);
            }
            console.log('');
        });
        
        // Check dashboard data source
        console.log('📊 DASHBOARD DATA SOURCE CHECK:');
        console.log('-'.repeat(35));
        
        if (latestWebhookRecord) {
            const latest = latestWebhookRecord;
            console.log('Most recent webhook record:');
            console.log(`  Name: ${latest.first_name} ${latest.last_name}`);
            console.log(`  Stage: ${latest.stage_to}`);
            console.log(`  Date: ${new Date(latest.changed_at).toDateString()}`);
            console.log(`  Time: ${new Date(latest.changed_at).toLocaleTimeString()}`);
            console.log('');
            
            // Check if this record would appear in dashboard queries
            const dashboardTestQuery = `
                SELECT 
                    DATE(changed_at) as change_date,
                    stage_to,
                    COUNT(*) as count
                FROM stage_changes 
                WHERE stage_to = $1
                  AND DATE(changed_at) >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY DATE(changed_at), stage_to
                ORDER BY change_date DESC;
            `;
            
            const dashboardTest = await client.query(dashboardTestQuery, [latest.stage_to]);
            
            console.log(`Dashboard query test for "${latest.stage_to}":`,);
            if (dashboardTest.rows.length === 0) {
                console.log('❌ Record would NOT appear in dashboard (outside date range or filtered out)');
            } else {
                console.log('✅ Record should appear in dashboard:');
                dashboardTest.rows.forEach(row => {
                    console.log(`  ${row.change_date}: ${row.count} records`);
                });
            }
        }
        
        console.log('');
        
        // Check total records today
        console.log('📅 TODAY\'S STAGE CHANGES:');
        console.log('-'.repeat(26));
        
        const todayQuery = `
            SELECT 
                stage_to,
                COUNT(*) as count,
                STRING_AGG(first_name || ' ' || last_name, ', ') as names
            FROM stage_changes 
            WHERE DATE(changed_at) = CURRENT_DATE
              AND source LIKE 'webhook_%'
            GROUP BY stage_to
            ORDER BY count DESC;
        `;
        
        const todayResult = await client.query(todayQuery);
        
        if (todayResult.rows.length === 0) {
            console.log('❌ No webhook stage changes today');
        } else {
            console.log('Today\'s webhook stage changes:');
            todayResult.rows.forEach(row => {
                console.log(`  ${row.stage_to}: ${row.count} (${row.names})`);
            });
        }
        
        console.log('');
        
        // Dashboard troubleshooting
        console.log('🔧 DASHBOARD TROUBLESHOOTING:');
        console.log('-'.repeat(30));
        
        console.log('Possible reasons dashboard isn\'t updating:');
        console.log('1. 🕐 Caching - Dashboard may have client-side caching');
        console.log('2. 🔄 API refresh - Dashboard may not be polling for updates');
        console.log('3. 📅 Date filtering - Records outside dashboard date range');
        console.log('4. 🎯 Stage filtering - Dashboard only shows specific stages');
        console.log('5. 📡 Source filtering - Dashboard may exclude webhook sources');
        console.log('');
        console.log('💡 SOLUTIONS:');
        console.log('• Hard refresh dashboard (Ctrl+Shift+R)');
        console.log('• Check dashboard date range settings');
        console.log('• Verify dashboard is querying recent data');
        console.log('• Test dashboard API endpoint directly');
        
        await client.end();
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        await client.end();
    }
}

checkLatestToddChanges().catch(console.error);