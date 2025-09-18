// Investigate recent webhook activity to see if real-time updates are working
const { Client } = require('pg');
require('dotenv').config();

async function investigateWebhookActivity() {
    console.log('🔍 INVESTIGATING WEBHOOK REAL-TIME ACTIVITY:');
    console.log('=' .repeat(60));
    console.log('Checking if webhooks are receiving and processing real-time events\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Check recent webhook activity vs polling activity
        console.log('📊 RECENT ACTIVITY BY SOURCE (Last 3 Days):');
        console.log('-'.repeat(50));
        
        const sourceQuery = `
            SELECT 
                source,
                COUNT(*) as total_records,
                MIN(received_at) as earliest_received,
                MAX(received_at) as latest_received,
                MAX(changed_at) as latest_event_time
            FROM stage_changes 
            WHERE received_at >= NOW() - INTERVAL '3 days'
            GROUP BY source
            ORDER BY total_records DESC;
        `;
        
        const sourceResult = await client.query(sourceQuery);
        
        sourceResult.rows.forEach(row => {
            console.log(`📡 ${row.source || 'NULL'}:`);
            console.log(`   Records: ${row.total_records}`);
            console.log(`   First received: ${row.earliest_received}`);
            console.log(`   Last received: ${row.latest_received}`);
            console.log(`   Latest event: ${row.latest_event_time}`);
            
            if (row.source && row.source.startsWith('webhook_')) {
                console.log(`   ✅ WEBHOOK ACTIVITY DETECTED`);
            } else if (row.source === 'polling') {
                console.log(`   🤖 POLLING ACTIVITY`);
            }
            console.log('');
        });
        
        // Check for webhook records specifically
        console.log('🎯 WEBHOOK-SPECIFIC ANALYSIS:');
        console.log('-'.repeat(35));
        
        const webhookQuery = `
            SELECT 
                source,
                first_name,
                last_name,
                stage_to,
                changed_at,
                received_at,
                (received_at - changed_at) as processing_delay
            FROM stage_changes 
            WHERE source LIKE 'webhook_%'
              AND received_at >= NOW() - INTERVAL '3 days'
            ORDER BY received_at DESC
            LIMIT 10;
        `;
        
        const webhookResult = await client.query(webhookQuery);
        
        if (webhookResult.rows.length === 0) {
            console.log('❌ NO WEBHOOK RECORDS FOUND in last 3 days!');
            console.log('🚨 This suggests webhooks are NOT working properly');
        } else {
            console.log(`✅ Found ${webhookResult.rows.length} recent webhook records:`);
            console.log('');
            
            webhookResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. ${row.first_name} ${row.last_name} - ${row.stage_to}`);
                console.log(`   📅 Event time: ${row.changed_at}`);
                console.log(`   📨 Received: ${row.received_at}`);
                console.log(`   ⏱️  Delay: ${row.processing_delay || 'None'}`);
                console.log(`   📡 Source: ${row.source}`);
                console.log('');
            });
        }
        
        // Check what should have been recent offers made
        console.log('💰 CHECKING "OFFERS MADE" ACTIVITY:');
        console.log('-'.repeat(40));
        
        const offersQuery = `
            SELECT 
                first_name,
                last_name,
                changed_at,
                received_at,
                source
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
              AND changed_at >= NOW() - INTERVAL '3 days'
            ORDER BY changed_at DESC;
        `;
        
        const offersResult = await client.query(offersQuery);
        
        console.log(`Found ${offersResult.rows.length} "Offers Made" in last 3 days:`);
        
        if (offersResult.rows.length === 0) {
            console.log('❌ No recent offers made found');
            console.log('⚠️  This could mean:');
            console.log('   1. No offers were actually made');
            console.log('   2. Webhooks failed to capture them');
            console.log('   3. They are in polling records but not processed yet');
        } else {
            let webhookOffers = 0;
            let pollingOffers = 0;
            
            offersResult.rows.forEach((row, index) => {
                const isRealTime = row.source && row.source.startsWith('webhook_');
                if (isRealTime) webhookOffers++;
                else pollingOffers++;
                
                console.log(`${index + 1}. ${row.first_name} ${row.last_name}:`);
                console.log(`   📅 ${row.changed_at}`);
                console.log(`   📡 Source: ${row.source} ${isRealTime ? '(Real-time webhook)' : '(Polling/batch)'}`);
                console.log('');
            });
            
            console.log('📈 OFFERS BREAKDOWN:');
            console.log(`   Real-time (webhook): ${webhookOffers}`);
            console.log(`   Batch (polling): ${pollingOffers}`);
            
            if (webhookOffers === 0 && pollingOffers > 0) {
                console.log('🚨 ALL OFFERS FROM POLLING - WEBHOOKS NOT WORKING!');
            }
        }
        
        // Check webhook endpoint health
        console.log('\n🔗 WEBHOOK ENDPOINT VERIFICATION:');
        console.log('-'.repeat(40));
        
        try {
            const response = await fetch('https://fub-stage-tracker.vercel.app/api/webhook-health', {
                method: 'GET',
                timeout: 10000
            });
            
            if (response.ok) {
                const health = await response.json();
                console.log('✅ Webhook endpoint is accessible');
                console.log(`   Status: ${health.status || 'Unknown'}`);
            } else {
                console.log('❌ Webhook endpoint returned error:', response.status);
            }
        } catch (error) {
            console.log('❌ Webhook endpoint not accessible:', error.message);
            console.log('🚨 This explains why webhooks are not working!');
        }
        
        console.log('\n' + '='.repeat(70));
        console.log('🔍 DIAGNOSIS:');
        
        const hasRecentWebhooks = webhookResult.rows.length > 0;
        const hasRecentOffers = offersResult.rows.length > 0;
        const offersFromWebhooks = offersResult.rows.some(r => r.source && r.source.startsWith('webhook_'));
        
        if (!hasRecentWebhooks) {
            console.log('❌ PROBLEM: No webhook activity detected');
            console.log('💡 LIKELY CAUSES:');
            console.log('   1. Webhooks not registered with FUB');
            console.log('   2. Webhook endpoint not accessible');
            console.log('   3. FUB not sending webhook events');
            console.log('   4. Webhook processing failing silently');
        } else if (hasRecentOffers && !offersFromWebhooks) {
            console.log('❌ PROBLEM: Offers detected but only from polling');
            console.log('💡 This means webhooks are not capturing offers in real-time');
        } else if (hasRecentWebhooks && offersFromWebhooks) {
            console.log('✅ WORKING: Webhook real-time updates are functioning');
        } else {
            console.log('⚠️  UNCLEAR: More investigation needed');
        }
        
        console.log('\n📋 RECOMMENDATIONS:');
        console.log('1. Check FUB webhook registration');
        console.log('2. Test webhook endpoint manually');
        console.log('3. Review webhook processing logs');
        console.log('4. Verify network/firewall access to Vercel');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

investigateWebhookActivity().catch(console.error);