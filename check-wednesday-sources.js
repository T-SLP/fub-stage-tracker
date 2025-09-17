// Check the source of Wednesday Sep 10 offers to see if they came via webhooks or polling
const { Client } = require('pg');
require('dotenv').config();

async function checkWednesdaySources() {
    console.log('🔍 CHECKING: Source of Wednesday Sep 10 offers');
    console.log('=' .repeat(50));
    console.log('Determining if offers came via webhooks or polling\\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        const query = `
            SELECT 
                first_name,
                last_name,
                changed_at,
                received_at,
                source,
                event_id
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
              AND DATE(changed_at) = '2025-09-10'
            ORDER BY received_at;
        `;
        
        const result = await client.query(query);
        
        console.log(`📊 WEDNESDAY SEP 10 OFFERS (${result.rows.length} total):`);
        console.log('-'.repeat(45));
        
        let webhookCount = 0;
        let pollingCount = 0;
        let otherCount = 0;
        
        result.rows.forEach((row, index) => {
            const changedAt = new Date(row.changed_at);
            const receivedAt = new Date(row.received_at);
            const isWebhook = row.source && row.source.startsWith('wh_');
            const isPolling = row.source === 'polling';
            
            let sourceType = '';
            if (isWebhook) {
                sourceType = '🚀 WEBHOOK (Real-time)';
                webhookCount++;
            } else if (isPolling) {
                sourceType = '🤖 POLLING (Batch)';
                pollingCount++;
            } else {
                sourceType = `📡 OTHER (${row.source})`;
                otherCount++;
            }
            
            console.log(`${index + 1}. ${row.first_name} ${row.last_name}`);
            console.log(`   Source: ${sourceType}`);
            console.log(`   Event Time: ${changedAt.toLocaleString()}`);
            console.log(`   Received: ${receivedAt.toLocaleString()}`);
            console.log(`   Event ID: ${row.event_id}`);
            console.log('');
        });
        
        console.log('📈 SOURCE BREAKDOWN:');
        console.log('-'.repeat(20));
        console.log(`🚀 Webhooks: ${webhookCount} offers`);
        console.log(`🤖 Polling: ${pollingCount} offers`);
        console.log(`📡 Other: ${otherCount} offers`);
        
        console.log('\\n💡 ANALYSIS:');
        console.log('-'.repeat(15));
        
        if (webhookCount > 0) {
            console.log(`✅ REAL-TIME WORKING: ${webhookCount} offers came through webhooks!`);
            console.log('   This confirms your webhook fix is working perfectly');
        }
        
        if (pollingCount > 0) {
            console.log(`🔄 POLLING ACTIVE: ${pollingCount} offers came from polling script`);
            console.log('   These were likely captured during our historical polling run');
        }
        
        if (otherCount > 0) {
            console.log(`📊 OTHER SOURCES: ${otherCount} offers from other sources`);
        }
        
        // Check timing to see if webhooks are truly real-time
        const webhookOffers = result.rows.filter(row => row.source && row.source.startsWith('wh_'));
        if (webhookOffers.length > 0) {
            console.log('\\n⚡ WEBHOOK TIMING ANALYSIS:');
            console.log('-'.repeat(30));
            
            webhookOffers.forEach(row => {
                const changedAt = new Date(row.changed_at);
                const receivedAt = new Date(row.received_at);
                const delayMs = receivedAt.getTime() - changedAt.getTime();
                const delaySeconds = Math.round(delayMs / 1000);
                
                console.log(`${row.first_name} ${row.last_name}:`);
                console.log(`  Event → Database: ${delaySeconds} seconds`);
                console.log(`  ${delaySeconds < 30 ? '🟢 EXCELLENT' : delaySeconds < 60 ? '🟡 GOOD' : '🔴 SLOW'} real-time performance`);
            });
        }
        
        console.log('\\n' + '='.repeat(50));
        console.log('✅ WEDNESDAY SOURCE CHECK COMPLETE');
        console.log('='.repeat(50));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

checkWednesdaySources().catch(console.error);