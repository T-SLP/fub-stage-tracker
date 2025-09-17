// Check for the stage change that just happened
const { Client } = require('pg');
require('dotenv').config();

async function checkLiveStageChange() {
    console.log('🔍 CHECKING: Live stage change from just now');
    console.log('=' .repeat(50));
    console.log('Looking for webhook stage change in last 2 minutes\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Check for any new records in last 2 minutes
        console.log('📊 ALL NEW RECORDS (Last 2 Minutes):');
        console.log('-'.repeat(40));
        
        const recentQuery = `
            SELECT 
                first_name,
                last_name,
                stage_from,
                stage_to,
                changed_at,
                received_at,
                source
            FROM stage_changes 
            WHERE received_at >= NOW() - INTERVAL '2 minutes'
            ORDER BY received_at DESC;
        `;
        
        const recentResult = await client.query(recentQuery);
        
        if (recentResult.rows.length === 0) {
            console.log('❌ NO NEW RECORDS FOUND!');
            console.log('🚨 Webhook was received by Railway but did NOT create database record');
        } else {
            console.log(`✅ Found ${recentResult.rows.length} new records:`);
            recentResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. ${row.first_name} ${row.last_name}: ${row.stage_from} → ${row.stage_to}`);
                console.log(`   📅 Event time: ${row.changed_at}`);
                console.log(`   📨 Received: ${row.received_at}`);
                console.log(`   📡 Source: ${row.source}`);
                
                if (row.source && row.source.startsWith('webhook_')) {
                    console.log('   🎉 SUCCESS: Real-time webhook processing working!');
                } else {
                    console.log('   ⚠️  Not from webhook - likely polling');
                }
                console.log('');
            });
        }
        
        // Also check webhook-specific records from today
        console.log('🕐 ALL WEBHOOK RECORDS TODAY:');
        console.log('-'.repeat(35));
        
        const webhookQuery = `
            SELECT 
                first_name,
                last_name,
                stage_from,
                stage_to,
                changed_at,
                received_at,
                source
            FROM stage_changes 
            WHERE source LIKE 'webhook_%'
              AND received_at >= CURRENT_DATE
            ORDER BY received_at DESC;
        `;
        
        const webhookResult = await client.query(webhookQuery);
        
        if (webhookResult.rows.length === 0) {
            console.log('❌ NO WEBHOOK RECORDS CREATED TODAY');
            console.log('');
            console.log('🚨 PROBLEM DIAGNOSIS:');
            console.log('   1. Railway receives webhooks from FUB ✅');
            console.log('   2. Railway processes webhook events ✅');  
            console.log('   3. Railway detects stage changes ❌');
            console.log('   4. Railway creates database records ❌');
            console.log('');
            console.log('💡 LIKELY CAUSES:');
            console.log('   • Webhook contains no actual stage change');
            console.log('   • Stage change detection logic is broken');
            console.log('   • Database connection fails silently');
            console.log('   • Webhook processing logic has errors');
        } else {
            console.log(`✅ Found ${webhookResult.rows.length} webhook records today!`);
            webhookResult.rows.forEach(row => {
                console.log(`   ${row.first_name} ${row.last_name}: ${row.stage_from} → ${row.stage_to}`);
            });
        }
        
        console.log('\n🎯 NEXT DEBUG STEPS:');
        console.log('1. Check Railway server logs for webhook processing details');
        console.log('2. Verify webhook payload contains actual stage change');
        console.log('3. Test database connection from Railway');
        console.log('4. Review webhook processing logic for errors');
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

checkLiveStageChange().catch(console.error);