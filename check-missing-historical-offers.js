// Check what historical offers we might be missing from Monday/Tuesday
const { Client } = require('pg');
require('dotenv').config();

async function checkMissingHistoricalOffers() {
    console.log('🔍 CHECKING: Missing historical offers Monday/Tuesday');
    console.log('=' .repeat(60));
    console.log('Analyzing what offers we have vs what you expect\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Check current offers by day
        console.log('📊 CURRENT OFFERS IN DATABASE BY DAY:');
        console.log('-'.repeat(45));
        
        const offersByDayQuery = `
            SELECT 
                DATE(changed_at) as offer_date,
                COUNT(*) as offer_count,
                STRING_AGG(first_name || ' ' || last_name, ', ') as names
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
              AND changed_at >= '2025-09-08'
              AND changed_at <= '2025-09-10 23:59:59'
            GROUP BY DATE(changed_at)
            ORDER BY offer_date;
        `;
        
        const offersByDayResult = await client.query(offersByDayQuery);
        
        let mondayOffers = 0;
        let tuesdayOffers = 0;
        let wednesdayOffers = 0;
        
        if (offersByDayResult.rows.length === 0) {
            console.log('❌ No offers found Sep 8-10');
        } else {
            offersByDayResult.rows.forEach(row => {
                const date = new Date(row.offer_date);
                const dayName = date.toDateString();
                
                console.log(`📅 ${dayName}: ${row.offer_count} offers`);
                console.log(`   Names: ${row.names}`);
                
                if (dayName.includes('Sep 08')) mondayOffers = parseInt(row.offer_count);
                if (dayName.includes('Sep 09')) tuesdayOffers = parseInt(row.offer_count);
                if (dayName.includes('Sep 10')) wednesdayOffers = parseInt(row.offer_count);
                
                console.log('');
            });
        }
        
        // Compare with expectations
        console.log('🎯 COMPARISON WITH YOUR EXPECTATIONS:');
        console.log('-'.repeat(40));
        console.log(`📅 Monday Sep 8:`);
        console.log(`   Expected: 3 offers (you mentioned)`);
        console.log(`   Found in DB: ${mondayOffers} offers`);
        
        if (mondayOffers < 3) {
            console.log(`   🚨 MISSING: ${3 - mondayOffers} offers from Monday`);
        } else if (mondayOffers >= 3) {
            console.log(`   ✅ COMPLETE: Monday offers accounted for`);
        }
        
        console.log(`\n📅 Wednesday Sep 10:`);
        console.log(`   Expected: At least 1 offer (you mentioned)`);
        console.log(`   Found in DB: ${wednesdayOffers} offers`);
        
        if (wednesdayOffers < 1) {
            console.log(`   🚨 MISSING: At least ${1 - wednesdayOffers} offers from today`);
        } else if (wednesdayOffers >= 1) {
            console.log(`   ✅ COMPLETE: Wednesday offers accounted for`);
        }
        
        // Check source breakdown
        console.log('\n📊 OFFERS BY SOURCE (Last 3 Days):');
        console.log('-'.repeat(35));
        
        const sourceQuery = `
            SELECT 
                source,
                COUNT(*) as count,
                STRING_AGG(first_name || ' ' || last_name, ', ') as names
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
              AND changed_at >= '2025-09-08'
            GROUP BY source
            ORDER BY count DESC;
        `;
        
        const sourceResult = await client.query(sourceQuery);
        
        sourceResult.rows.forEach(row => {
            const isWebhook = row.source && row.source.startsWith('wh_');
            const isPolling = row.source === 'polling';
            
            console.log(`📡 ${row.source}: ${row.count} offers`);
            
            if (isWebhook) {
                console.log(`   🎉 REAL-TIME: These came through webhooks!`);
            } else if (isPolling) {
                console.log(`   🤖 POLLING: These came from midnight batch`);
            }
            
            console.log(`   Names: ${row.names}`);
            console.log('');
        });
        
        // Recommendations
        console.log('💡 RECOMMENDATIONS:');
        console.log('-'.repeat(20));
        
        const totalMissing = Math.max(0, 3 - mondayOffers) + Math.max(0, 1 - wednesdayOffers);
        
        if (totalMissing > 0) {
            console.log(`🚨 MISSING DATA: ~${totalMissing} offers not captured`);
            console.log('');
            console.log('📋 SOLUTIONS:');
            console.log('1. ✅ REAL-TIME: Fixed webhooks will capture future offers');
            console.log('2. 🔄 HISTORICAL: Run Python polling script to backfill');
            console.log('3. 📊 MANUAL: Check FUB directly for missing Monday offers');
            console.log('');
            console.log('🔧 TO BACKFILL HISTORICAL DATA:');
            console.log('The Python polling collector can fetch historical data');
            console.log('But requires interactive setup for API credentials');
        } else {
            console.log('✅ DATA COMPLETE: All expected offers are in database');
            console.log('🚀 WEBHOOKS: Now working for future real-time capture');
        }
        
        // Test webhook status
        console.log('\n🚀 WEBHOOK STATUS CHECK:');
        console.log('-'.repeat(25));
        
        const recentWebhookQuery = `
            SELECT COUNT(*) as count
            FROM stage_changes 
            WHERE source LIKE 'wh_%'
              AND received_at >= NOW() - INTERVAL '1 hour';
        `;
        
        const webhookResult = await client.query(recentWebhookQuery);
        const recentWebhooks = parseInt(webhookResult.rows[0].count);
        
        if (recentWebhooks > 0) {
            console.log(`✅ WEBHOOKS WORKING: ${recentWebhooks} webhook records in last hour`);
        } else {
            console.log('⚠️  NO RECENT WEBHOOKS: Test with FUB stage change to verify');
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

checkMissingHistoricalOffers().catch(console.error);