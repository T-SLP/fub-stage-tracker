// Check for recent offers made including today's webhook activity
const { Client } = require('pg');
require('dotenv').config();

async function checkRecentOffersMade() {
    console.log('🔍 CHECKING: Recent offers made including webhook activity');
    console.log('=' .repeat(65));
    console.log('Looking for offers made on Sep 8, 10 and webhook processing\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Check all offers made in last 3 days
        console.log('📊 ALL OFFERS MADE (Last 3 Days):');
        console.log('-'.repeat(40));
        
        const offersQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                changed_at,
                received_at,
                source
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
              AND changed_at >= NOW() - INTERVAL '3 days'
            ORDER BY changed_at DESC;
        `;
        
        const offersResult = await client.query(offersQuery);
        
        console.log(`Found ${offersResult.rows.length} offers made in last 3 days:\n`);
        
        let mondayOffers = [];
        let wednesdayOffers = [];
        let webhookOffers = [];
        
        offersResult.rows.forEach((row, index) => {
            const changeDate = new Date(row.changed_at);
            const dateString = changeDate.toDateString();
            const isWebhook = row.source && row.source.startsWith('webhook_');
            
            console.log(`${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   📅 ${row.changed_at}`);
            console.log(`   📊 Charts on: ${dateString}`);
            console.log(`   📡 Source: ${row.source} ${isWebhook ? '(Real-time webhook!)' : '(Polling/batch)'}`);
            
            // Categorize by day
            if (dateString.includes('Sep 08 2025')) {
                mondayOffers.push(`${row.first_name} ${row.last_name}`);
            } else if (dateString.includes('Sep 10 2025')) {
                wednesdayOffers.push(`${row.first_name} ${row.last_name}`);
            }
            
            if (isWebhook) {
                webhookOffers.push(`${row.first_name} ${row.last_name}`);
            }
            
            console.log('');
        });
        
        // Summary by day
        console.log('📈 OFFERS BY DAY:');
        console.log('-'.repeat(25));
        console.log(`📅 Monday Sep 8: ${mondayOffers.length} offers`);
        mondayOffers.forEach(name => console.log(`   - ${name}`));
        
        console.log(`📅 Wednesday Sep 10: ${wednesdayOffers.length} offers`);  
        wednesdayOffers.forEach(name => console.log(`   - ${name}`));
        
        console.log(`\n⚡ REAL-TIME WEBHOOK OFFERS: ${webhookOffers.length}`);
        webhookOffers.forEach(name => console.log(`   - ${name}`));
        
        // Check for very recent webhook activity (today)
        console.log('\n🕐 RECENT WEBHOOK ACTIVITY (Today):');
        console.log('-'.repeat(40));
        
        const todayQuery = `
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
        
        const todayResult = await client.query(todayQuery);
        
        if (todayResult.rows.length === 0) {
            console.log('❌ NO WEBHOOK ACTIVITY TODAY!');
            console.log('🚨 This means webhooks are being received but not processing stage changes');
        } else {
            console.log(`✅ Found ${todayResult.rows.length} webhook stage changes today:`);
            todayResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. ${row.first_name} ${row.last_name}: ${row.stage_from} → ${row.stage_to}`);
                console.log(`   📅 Event: ${row.changed_at}`);
                console.log(`   📨 Received: ${row.received_at}`);
                console.log(`   📡 Source: ${row.source}`);
            });
        }
        
        // Check what Railway thinks it processed
        console.log('\n🔍 RAILWAY VS DATABASE ANALYSIS:');
        console.log('-'.repeat(40));
        console.log('Railway health shows:');
        console.log('   - 408 webhooks received since 13:37 UTC');
        console.log('   - 0 stage_changes_captured');
        console.log('   - Last webhook: 17:22 UTC (about 1 hour ago)');
        console.log('');
        
        if (todayResult.rows.length === 0) {
            console.log('🚨 DIAGNOSIS: WEBHOOK PROCESSING ISSUE');
            console.log('   - Railway is receiving webhooks from FUB ✅');
            console.log('   - Railway is NOT creating database records ❌');
            console.log('   - Possible causes:');
            console.log('     1. Webhook processing logic failing silently');
            console.log('     2. Database connection issues from Railway');  
            console.log('     3. Stage change detection not triggering');
            console.log('     4. Webhook events not containing stage changes');
        } else {
            console.log('✅ Webhooks are processing correctly');
        }
        
        // Final recommendation
        console.log('\n💡 NEXT STEPS:');
        console.log('-'.repeat(15));
        
        if (mondayOffers.length < 3) {
            console.log(`⚠️  Expected 3 Monday Sep 8 offers, found ${mondayOffers.length}`);
        } else {
            console.log(`✅ Monday Sep 8: Found expected ${mondayOffers.length} offers`);
        }
        
        if (wednesdayOffers.length === 0 && todayResult.rows.length === 0) {
            console.log('❌ No Wednesday Sep 10 offers found via webhooks');
            console.log('🔧 Need to check Railway webhook processing logs');
        } else {
            console.log(`✅ Wednesday Sep 10: Found ${wednesdayOffers.length} offers`);
        }
        
        console.log('\n🎯 TO TEST REAL-TIME:');
        console.log('1. Make a test stage change in FUB');  
        console.log('2. Check if it appears in database within seconds');
        console.log('3. Monitor Railway logs for processing details');
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

checkRecentOffersMade().catch(console.error);