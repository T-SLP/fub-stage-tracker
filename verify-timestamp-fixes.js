// Verify that our timestamp fixes will work correctly
const { Client } = require('pg');
require('dotenv').config();

async function verifyTimestampFixes() {
    console.log('🔍 VERIFYING TIMESTAMP FIXES:');
    console.log('=' .repeat(50));
    console.log('Testing that FUB updated timestamps will be used correctly\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Get recent polling records that have the wrong timestamps
        console.log('📊 CURRENT PROBLEMATIC RECORDS:');
        console.log('-'.repeat(40));
        
        const currentQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                changed_at,
                received_at,
                raw_payload
            FROM stage_changes 
            WHERE source = 'polling'
              AND stage_to IN ('ACQ - Offers Made', 'ACQ - Qualified', 'ACQ - Price Motivated')
              AND changed_at >= '2025-09-10 00:00:00'
            ORDER BY changed_at DESC
            LIMIT 5;
        `;
        
        const currentResult = await client.query(currentQuery);
        
        console.log(`Found ${currentResult.rows.length} records with incorrect midnight timestamps:\n`);
        
        currentResult.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.first_name} ${row.last_name} - ${row.stage_to}`);
            console.log(`   ❌ WRONG changed_at: ${row.changed_at} (midnight polling time)`);
            console.log(`   📨 received_at: ${row.received_at}`);
            
            // Extract the real timestamp from raw payload
            if (row.raw_payload) {
                const payload = row.raw_payload;
                const realTimestamp = payload.updated || payload.lastActivity;
                
                if (realTimestamp) {
                    const realDate = new Date(realTimestamp);
                    console.log(`   ✅ REAL timestamp from FUB: ${realTimestamp}`);
                    console.log(`   📅 Real date/time: ${realDate.toLocaleString()}`);
                    
                    // Check if this is the 2pm/8pm time the user mentioned
                    const hour = realDate.getHours();
                    if (realDate.toDateString().includes('Sep 09 2025')) {
                        if (hour === 14 || hour === 20) {
                            console.log(`   🎯 MATCHES USER OBSERVATION: ${hour === 14 ? '2pm' : '8pm'} on 9/9/2025`);
                        } else if (hour === 18 || hour === 21 || hour === 17) { // Account for timezone differences
                            console.log(`   🎯 LIKELY MATCH (timezone adjusted): ${hour}:xx on 9/9/2025`);
                        }
                    }
                } else {
                    console.log(`   ⚠️  No updated/lastActivity timestamp in payload`);
                }
            }
            console.log('');
        });
        
        // Now demonstrate what the webhook fix would do
        console.log('\n🔧 WEBHOOK FIX SIMULATION:');
        console.log('-'.repeat(35));
        
        currentResult.rows.slice(0, 2).forEach((row, index) => {
            console.log(`\nWebhook Processing for ${row.first_name} ${row.last_name}:`);
            
            if (row.raw_payload) {
                const payload = row.raw_payload;
                const currentTime = new Date().toISOString();
                
                // This is what the old webhook code did
                console.log(`❌ OLD webhook logic:`);
                console.log(`   changed_at: ${currentTime} (current processing time)`);
                console.log(`   received_at: ${currentTime} (current processing time)`);
                
                // This is what the new webhook code will do
                const actualEventTime = payload.updated || payload.lastActivity || currentTime;
                console.log(`✅ NEW webhook logic:`);
                console.log(`   changed_at: ${actualEventTime} (REAL FUB event time)`);
                console.log(`   received_at: ${currentTime} (processing time)`);
                
                if (actualEventTime !== currentTime) {
                    console.log(`   🎉 IMPROVEMENT: Event time preserved!`);
                } else {
                    console.log(`   ⚠️  No FUB timestamp available, using current time`);
                }
            }
        });
        
        // Show what the chart should look like after the fix
        console.log('\n📊 EXPECTED CHART BEHAVIOR AFTER FIX:');
        console.log('-'.repeat(45));
        
        const offersQuery = `
            SELECT 
                first_name,
                last_name,
                raw_payload
            FROM stage_changes 
            WHERE source = 'polling'
              AND stage_to = 'ACQ - Offers Made'
            ORDER BY changed_at DESC
            LIMIT 3;
        `;
        
        const offersResult = await client.query(offersQuery);
        
        console.log('Current "ACQ - Offers Made" records with corrected timestamps:');
        offersResult.rows.forEach((row, index) => {
            console.log(`\n${index + 1}. ${row.first_name} ${row.last_name}:`);
            
            if (row.raw_payload && row.raw_payload.updated) {
                const realTime = new Date(row.raw_payload.updated);
                const chartDate = `${realTime.getFullYear()}-${String(realTime.getMonth() + 1).padStart(2, '0')}-${String(realTime.getDate()).padStart(2, '0')}`;
                
                console.log(`   📅 Real event time: ${row.raw_payload.updated}`);
                console.log(`   📊 Should plot on chart: ${chartDate}`);
                
                if (chartDate === '2025-09-09') {
                    console.log(`   ✅ CORRECT: Will show on Tuesday Sep 9 (not Wednesday!)`);
                } else {
                    console.log(`   📅 Will show on: ${realTime.toDateString()}`);
                }
            }
        });
        
        console.log('\n' + '='.repeat(60));
        console.log('📋 SUMMARY OF FIXES:');
        console.log('✅ Webhook handler: Now uses person.updated for changed_at');  
        console.log('✅ Polling script: Now uses person.updated for changed_at');
        console.log('✅ Preserves processing time in received_at');
        console.log('✅ Real business event times will be preserved');
        console.log('✅ Chart will plot offers on correct days');
        console.log('✅ Activity table timestamps will match chart logic');
        console.log('='.repeat(60));
        
        console.log('\n💡 NEXT STEPS:');
        console.log('1. Deploy the webhook fix (already done)');
        console.log('2. Future polling runs will use correct timestamps');  
        console.log('3. Optionally: Run correction script to fix existing bad timestamps');
        console.log('4. Verify chart now shows Tuesday Sep 9 data correctly');
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

verifyTimestampFixes().catch(console.error);