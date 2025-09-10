// Check offers made in last 3 days
const { Client } = require('pg');
require('dotenv').config();

async function checkLast3Days() {
    console.log('🔍 Checking "Offers Made" in last 3 days\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        
        console.log(`📅 Looking from ${threeDaysAgo.toISOString().split('T')[0]} to today`);
        console.log('=' .repeat(50));
        
        const query = `
            SELECT 
                first_name,
                last_name,
                stage_from,
                changed_at,
                campaign_id,
                lead_source_tag
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
              AND changed_at >= $1
            ORDER BY changed_at DESC;
        `;
        
        const result = await client.query(query, [threeDaysAgo.toISOString()]);
        
        console.log(`🎯 Found ${result.rows.length} "ACQ - Offers Made" in last 3 days:`);
        console.log('');
        
        if (result.rows.length === 0) {
            console.log('❌ No offers made in the last 3 days');
        } else {
            result.rows.forEach((row, index) => {
                const date = new Date(row.changed_at).toLocaleDateString();
                const time = new Date(row.changed_at).toLocaleTimeString();
                console.log(`${index + 1}. ${row.first_name} ${row.last_name}`);
                console.log(`   📅 ${date} at ${time}`);
                console.log(`   📈 From: ${row.stage_from}`);
                console.log(`   🏷️  Campaign: ${row.campaign_id || 'No Campaign'}`);
                console.log(`   🔗 Source: ${row.lead_source_tag || 'Unknown'}`);
                console.log('');
            });
        }
        
        // Group by day
        const byDay = {};
        result.rows.forEach(row => {
            const date = new Date(row.changed_at).toLocaleDateString();
            byDay[date] = (byDay[date] || 0) + 1;
        });
        
        console.log('📊 BREAKDOWN BY DAY:');
        console.log('=' .repeat(30));
        Object.entries(byDay).forEach(([date, count]) => {
            console.log(`${date}: ${count} offers`);
        });
        
        if (Object.keys(byDay).length === 0) {
            console.log('No offers in any of the last 3 days');
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

checkLast3Days().catch(console.error);