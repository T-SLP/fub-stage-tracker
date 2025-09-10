// Examine webhook data to understand original timestamps
const { Client } = require('pg');
require('dotenv').config();

async function examineWebhookData() {
    console.log('🔍 EXAMINING WEBHOOK DATA TO UNDERSTAND ORIGINAL TIMESTAMPS:');
    console.log('=' .repeat(65));
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // First, look at non-polling records to see what real webhook data looks like
        console.log('📡 CHECKING NON-POLLING RECORDS (Real Webhooks):');
        console.log('-'.repeat(50));
        
        const webhookQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                changed_at,
                received_at,
                source,
                raw_payload
            FROM stage_changes 
            WHERE source != 'polling' OR source IS NULL
            ORDER BY received_at DESC
            LIMIT 5;
        `;
        
        const webhookResult = await client.query(webhookQuery);
        
        if (webhookResult.rows.length > 0) {
            webhookResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. ${row.first_name} ${row.last_name} - ${row.stage_to}`);
                console.log(`   📅 changed_at: ${row.changed_at}`);
                console.log(`   📨 received_at: ${row.received_at}`);
                console.log(`   📡 source: ${row.source || 'NULL (webhook)'}`);
                
                // Look at raw payload to see original timestamp format
                if (row.raw_payload) {
                    const payload = row.raw_payload;
                    console.log(`   📦 Raw payload keys: ${Object.keys(payload).join(', ')}`);
                    
                    // Look for timestamp-related fields in payload
                    Object.keys(payload).forEach(key => {
                        if (key.toLowerCase().includes('time') || key.toLowerCase().includes('date') || key.toLowerCase().includes('at')) {
                            console.log(`   🕐 ${key}: ${payload[key]}`);
                        }
                    });
                }
                console.log('');
            });
        } else {
            console.log('❌ No non-polling records found - all recent records are from polling!');
        }
        
        // Now look at polling records to see what they contain
        console.log('\n🤖 EXAMINING POLLING RECORDS RAW PAYLOADS:');
        console.log('-'.repeat(45));
        
        const pollingQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                changed_at,
                received_at,
                raw_payload
            FROM stage_changes 
            WHERE source = 'polling'
              AND raw_payload IS NOT NULL
            ORDER BY received_at DESC
            LIMIT 3;
        `;
        
        const pollingResult = await client.query(pollingQuery);
        
        pollingResult.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.first_name} ${row.last_name} - ${row.stage_to}`);
            console.log(`   📅 changed_at: ${row.changed_at}`);
            console.log(`   📨 received_at: ${row.received_at}`);
            
            if (row.raw_payload) {
                const payload = row.raw_payload;
                console.log(`   📦 Raw payload structure:`);
                
                // Look for all timestamp fields
                Object.keys(payload).forEach(key => {
                    const value = payload[key];
                    console.log(`   ${key}: ${value} (${typeof value})`);
                });
                
                // Specifically look for original event timestamp
                if (payload.changed_at || payload.changedAt || payload.event_time || payload.timestamp) {
                    console.log(`   🚨 FOUND ORIGINAL TIMESTAMP IN PAYLOAD!`);
                    console.log(`   📅 Original: ${payload.changed_at || payload.changedAt || payload.event_time || payload.timestamp}`);
                }
            }
            console.log('');
        });
        
        // Check if there are any recent records that might show the original timestamp
        console.log('\n🔍 CHECKING FOR TIMESTAMP DISCREPANCIES:');
        console.log('-'.repeat(40));
        
        const discrepancyQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                changed_at,
                received_at,
                (received_at - changed_at) as time_diff
            FROM stage_changes 
            WHERE changed_at != received_at
              AND changed_at >= '2025-09-08'
            ORDER BY received_at DESC
            LIMIT 5;
        `;
        
        const discrepancyResult = await client.query(discrepancyQuery);
        
        if (discrepancyResult.rows.length > 0) {
            console.log('📊 RECORDS WHERE changed_at ≠ received_at:');
            discrepancyResult.rows.forEach(row => {
                console.log(`   ${row.first_name} ${row.last_name}:`);
                console.log(`     changed_at: ${row.changed_at}`);
                console.log(`     received_at: ${row.received_at}`);
                console.log(`     Difference: ${row.time_diff}`);
            });
        } else {
            console.log('❌ All recent records have identical changed_at and received_at');
            console.log('🚨 This confirms polling is overwriting original timestamps!');
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

examineWebhookData().catch(console.error);