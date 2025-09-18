// Check if the manual stage change just made appeared in database
const { Client } = require('pg');
require('dotenv').config();

async function checkImmediateWebhookResult() {
    console.log('⚡ CHECKING: Immediate result of manual stage change');
    console.log('=' .repeat(60));
    console.log('Looking for stage changes in last 10 minutes from webhook sources\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Check for any webhook-sourced records in last 10 minutes
        console.log('⚡ WEBHOOK STAGE CHANGES (Last 10 Minutes):');
        console.log('-'.repeat(50));
        
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
              AND received_at >= NOW() - INTERVAL '10 minutes'
            ORDER BY received_at DESC;
        `;
        
        const webhookResult = await client.query(webhookQuery);
        
        if (webhookResult.rows.length === 0) {
            console.log('❌ NO webhook stage changes in last 10 minutes');
        } else {
            console.log(`✅ Found ${webhookResult.rows.length} webhook stage changes:`);
            webhookResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. ${row.first_name} ${row.last_name}:`);
                console.log(`   🔄 ${row.stage_from} → ${row.stage_to}`);
                console.log(`   📅 Event: ${row.changed_at}`);
                console.log(`   📨 Received: ${row.received_at}`);
                console.log(`   📡 Source: ${row.source}`);
                console.log('');
            });
        }
        
        // Check for ANY stage changes in last 10 minutes (any source)
        console.log('📊 ALL STAGE CHANGES (Last 10 Minutes):');
        console.log('-'.repeat(45));
        
        const allQuery = `
            SELECT 
                first_name,
                last_name,
                stage_from,
                stage_to,
                changed_at,
                received_at,
                source
            FROM stage_changes 
            WHERE received_at >= NOW() - INTERVAL '10 minutes'
            ORDER BY received_at DESC;
        `;
        
        const allResult = await client.query(allQuery);
        
        if (allResult.rows.length === 0) {
            console.log('❌ NO stage changes at all in last 10 minutes');
            console.log('🚨 This means the webhook was received but didn\'t create any database record');
        } else {
            console.log(`📋 Found ${allResult.rows.length} total stage changes:`);
            allResult.rows.forEach((row, index) => {
                const isWebhook = row.source && row.source.startsWith('webhook_');
                console.log(`${index + 1}. ${row.first_name} ${row.last_name}:`);
                console.log(`   🔄 ${row.stage_from} → ${row.stage_to}`);
                console.log(`   📅 Event: ${row.changed_at}`);
                console.log(`   📨 Received: ${row.received_at}`);
                console.log(`   📡 Source: ${row.source} ${isWebhook ? '(WEBHOOK!)' : '(Other)'}`);
                console.log('');
            });
        }
        
        // Check very recent Railway webhook activity timestamp
        console.log('🕐 RAILWAY WEBHOOK TIMING:');
        console.log('-'.repeat(30));
        console.log('Railway shows last webhook: Wed, 10 Sep 2025 17:30:14 GMT');
        console.log(`Current time: ${new Date().toISOString()}`);
        
        const railwayTime = new Date('Wed, 10 Sep 2025 17:30:14 GMT');
        const currentTime = new Date();
        const timeDiff = Math.round((currentTime - railwayTime) / 1000);
        
        console.log(`Time since last Railway webhook: ${timeDiff} seconds ago`);
        
        if (timeDiff < 300) { // Less than 5 minutes
            console.log('⚡ RECENT WEBHOOK DETECTED - should have created database record');
        }
        
        // Final diagnosis
        console.log('\n🔍 DIAGNOSIS:');
        console.log('-'.repeat(15));
        
        if (webhookResult.rows.length === 0 && allResult.rows.length === 0) {
            console.log('🚨 WEBHOOK PROCESSING FAILURE:');
            console.log('   - Railway received webhook ✅');
            console.log('   - Database record NOT created ❌');
            console.log('   - Webhook processing logic has issues');
            console.log('');
            console.log('💡 POSSIBLE CAUSES:');
            console.log('   1. Database connection failure from Railway');
            console.log('   2. Webhook processing logic crashing silently');
            console.log('   3. Stage change not detected in webhook payload');
            console.log('   4. Duplicate detection filtering out the change');
        } else if (allResult.rows.length > 0 && webhookResult.rows.length === 0) {
            console.log('⚠️  DATABASE RECORD CREATED BUT NOT FROM WEBHOOK:');
            console.log('   - Some other process created the record');
            console.log('   - Webhook processing still not working');
        } else if (webhookResult.rows.length > 0) {
            console.log('🎉 SUCCESS: WEBHOOK PROCESSING WORKING!');
            console.log('   - Railway received webhook ✅');
            console.log('   - Database record created ✅');
            console.log('   - Real-time processing functional ✅');
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

checkImmediateWebhookResult().catch(console.error);