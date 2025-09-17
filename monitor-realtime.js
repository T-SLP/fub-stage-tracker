// Monitor database in real-time for new webhook entries
const { Client } = require('pg');
require('dotenv').config();

async function monitorRealtime() {
    console.log('🚀 MONITORING: Real-time webhook processing');
    console.log('=' .repeat(50));
    console.log('Watching for new stage changes...');
    console.log('Make a test stage change in FUB now!\\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Get baseline count
        const baselineQuery = `SELECT COUNT(*) as count FROM stage_changes`;
        const baselineResult = await client.query(baselineQuery);
        const baselineCount = parseInt(baselineResult.rows[0].count);
        
        console.log(`📊 Baseline: ${baselineCount} total records in database`);
        console.log('⏰ Starting monitoring...');
        console.log('   (Press Ctrl+C to stop)\\n');
        
        let lastCount = baselineCount;
        let checkCount = 0;
        
        const monitor = setInterval(async () => {
            try {
                checkCount++;
                
                // Check for new records
                const currentQuery = `SELECT COUNT(*) as count FROM stage_changes`;
                const currentResult = await client.query(currentQuery);
                const currentCount = parseInt(currentResult.rows[0].count);
                
                if (currentCount > lastCount) {
                    const newRecords = currentCount - lastCount;
                    console.log(`\\n🎉 NEW RECORD(S) DETECTED! (+${newRecords})`);
                    console.log('=' .repeat(40));
                    
                    // Get the latest records
                    const latestQuery = `
                        SELECT 
                            first_name,
                            last_name,
                            stage_to,
                            source,
                            changed_at,
                            received_at,
                            event_id
                        FROM stage_changes 
                        ORDER BY received_at DESC 
                        LIMIT ${newRecords};
                    `;
                    
                    const latestResult = await client.query(latestQuery);
                    
                    latestResult.rows.forEach((row, index) => {
                        const changedAt = new Date(row.changed_at);
                        const receivedAt = new Date(row.received_at);
                        const delayMs = receivedAt.getTime() - changedAt.getTime();
                        const delaySeconds = Math.round(delayMs / 1000);
                        const isWebhook = row.source && row.source.startsWith('wh_');
                        
                        console.log(`\\n📋 Record ${index + 1}:`);
                        console.log(`   Name: ${row.first_name} ${row.last_name}`);
                        console.log(`   Stage: ${row.stage_to}`);
                        console.log(`   Source: ${row.source} ${isWebhook ? '🚀 (WEBHOOK!)' : '📡 (Other)'}`);
                        console.log(`   Event Time: ${changedAt.toLocaleString()}`);
                        console.log(`   Received: ${receivedAt.toLocaleString()}`);
                        console.log(`   Delay: ${delaySeconds} seconds`);
                        console.log(`   Event ID: ${row.event_id || 'null'}`);
                        
                        if (isWebhook) {
                            console.log(`   ✅ WEBHOOK SUCCESS! Real-time processing working!`);
                        } else {
                            console.log(`   ⚠️  Non-webhook source - check Railway logs`);
                        }
                    });
                    
                    lastCount = currentCount;
                } else {
                    // Show periodic status
                    if (checkCount % 6 === 0) { // Every 30 seconds
                        console.log(`⏰ Still monitoring... (${checkCount * 5}s elapsed, ${currentCount} total records)`);
                    }
                }
                
            } catch (error) {
                console.error(`❌ Monitor Error: ${error.message}`);
            }
        }, 5000); // Check every 5 seconds
        
        // Stop monitoring after 5 minutes
        setTimeout(() => {
            clearInterval(monitor);
            console.log('\\n⏰ Monitoring stopped after 5 minutes');
            console.log('If no webhooks appeared, Railway webhook server needs investigation');
            client.end();
        }, 300000);
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        await client.end();
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\\n\\n🛑 Monitoring stopped by user');
    process.exit(0);
});

monitorRealtime().catch(console.error);