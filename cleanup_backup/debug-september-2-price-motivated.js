// Debug why price-motivated lead shows on September 2nd
const { Client } = require('pg');
require('dotenv').config();

// Function to safely log data that might contain invalid Unicode
function safeLog(message) {
    try {
        console.log(message);
    } catch (error) {
        console.log('[Unicode error in log output]');
    }
}

// Function to safely parse JSON with Unicode handling
function safeParseJSON(jsonString) {
    try {
        // Clean invalid Unicode surrogates that can break JSON parsing
        const cleanedString = jsonString.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
        return JSON.parse(cleanedString);
    } catch (error) {
        console.log(`   ⚠️  JSON parse error: ${error.message}`);
        return null;
    }
}

async function debugSeptember2PriceMotivated() {
    console.log('🔍 DEBUGGING: Price Motivated lead on September 2nd');
    console.log('=' .repeat(60));
    console.log('Investigating why this stage change is appearing on the chart\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Check for any records on September 2nd
        console.log('📊 ALL RECORDS ON SEPTEMBER 2ND, 2025:');
        console.log('-'.repeat(50));
        
        const sep2Query = `
            SELECT 
                first_name,
                last_name,
                stage_from,
                stage_to,
                changed_at,
                received_at,
                source,
                raw_payload
            FROM stage_changes 
            WHERE DATE(changed_at) = '2025-09-02'
            ORDER BY changed_at DESC;
        `;
        
        const sep2Result = await client.query(sep2Query);
        
        console.log(`Found ${sep2Result.rows.length} records on September 2nd, 2025:`);
        
        if (sep2Result.rows.length === 0) {
            console.log('❌ No records found on September 2nd');
            console.log('⚠️  The chart may be using incorrect date processing');
        } else {
            sep2Result.rows.forEach((row, index) => {
                console.log(`\n${index + 1}. ${row.first_name} ${row.last_name}:`);
                console.log(`   🔄 Stage: ${row.stage_from} → ${row.stage_to}`);
                console.log(`   📅 changed_at: ${row.changed_at}`);
                console.log(`   📨 received_at: ${row.received_at}`);
                console.log(`   📡 source: ${row.source}`);
                
                if (row.stage_to === 'ACQ - Price Motivated') {
                    console.log(`   🎯 FOUND THE PRICE MOTIVATED RECORD!`);
                    
                    // Check if this is legitimate or a data issue
                    const changeDate = new Date(row.changed_at);
                    const receivedDate = new Date(row.received_at);
                    
                    console.log(`   📊 Chart should plot on: ${changeDate.toDateString()}`);
                    
                    if (row.source === 'polling' && row.changed_at === row.received_at) {
                        console.log(`   🚨 POTENTIAL ISSUE: Identical timestamps suggest processing time used instead of real event time`);
                    }
                    
                    if (row.raw_payload) {
                        const payload = safeParseJSON(JSON.stringify(row.raw_payload));
                        if (payload) {
                            const realTimestamp = payload.updated || payload.lastActivity;
                            if (realTimestamp) {
                                console.log(`   🕐 Real FUB timestamp: ${realTimestamp}`);
                                const realDate = new Date(realTimestamp);
                                console.log(`   📅 Real event date: ${realDate.toDateString()}`);
                                
                                if (realDate.toDateString() !== changeDate.toDateString()) {
                                    console.log(`   🚨 DATE MISMATCH: Real event was on ${realDate.toDateString()}, not ${changeDate.toDateString()}`);
                                }
                            }
                        } else {
                            console.log(`   ⚠️  Could not parse raw_payload, skipping timestamp analysis`);
                        }
                    }
                }
            });
        }
        
        // Check nearby dates for potential mis-dated records
        console.log('\n🔍 CHECKING NEARBY DATES FOR CONTEXT:');
        console.log('-'.repeat(45));
        
        const nearbyQuery = `
            SELECT 
                DATE(changed_at) as event_date,
                COUNT(*) as total_records,
                COUNT(CASE WHEN stage_to = 'ACQ - Price Motivated' THEN 1 END) as price_motivated_count,
                STRING_AGG(
                    CASE WHEN stage_to = 'ACQ - Price Motivated' 
                    THEN first_name || ' ' || last_name 
                    END, ', '
                ) as price_motivated_names
            FROM stage_changes 
            WHERE DATE(changed_at) BETWEEN '2025-09-01' AND '2025-09-05'
            GROUP BY DATE(changed_at)
            ORDER BY event_date;
        `;
        
        const nearbyResult = await client.query(nearbyQuery);
        
        nearbyResult.rows.forEach(row => {
            console.log(`📅 ${row.event_date}:`);
            console.log(`   Total records: ${row.total_records}`);
            console.log(`   Price Motivated: ${row.price_motivated_count}`);
            if (row.price_motivated_names) {
                console.log(`   Names: ${row.price_motivated_names}`);
            }
            
            if (row.event_date === '2025-09-02' && row.price_motivated_count > 0) {
                console.log(`   🎯 THIS IS THE SEPTEMBER 2ND RECORD SHOWING ON CHART`);
            }
        });
        
        // Check chart date processing logic
        console.log('\n📊 CHART DATE PROCESSING ANALYSIS:');
        console.log('-'.repeat(40));
        
        // Check what the current chart would show for recent data
        const chartQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                changed_at,
                DATE(changed_at) as chart_date
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Price Motivated'
              AND changed_at >= '2025-09-01'
            ORDER BY changed_at DESC;
        `;
        
        const chartResult = await client.query(chartQuery);
        
        console.log('Recent Price Motivated records and how they would appear on chart:');
        chartResult.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   📅 Event time: ${row.changed_at}`);
            console.log(`   📊 Chart plots on: ${row.chart_date}`);
            
            if (row.chart_date === '2025-09-02') {
                console.log(`   🎯 THIS RECORD APPEARS ON SEPTEMBER 2ND BAR`);
            }
        });
        
        console.log('\n' + '='.repeat(60));
        console.log('🔍 ANALYSIS SUMMARY:');
        
        if (sep2Result.rows.some(row => row.stage_to === 'ACQ - Price Motivated')) {
            console.log('✅ Found Price Motivated record with September 2nd timestamp');
            console.log('💡 POSSIBLE CAUSES:');
            console.log('   1. Legitimate business activity on September 2nd');
            console.log('   2. Incorrect timestamp from batch processing');  
            console.log('   3. Historical data correction needed');
            console.log('   4. System-generated timestamp instead of real event time');
        } else {
            console.log('❌ No Price Motivated records found on September 2nd');
            console.log('💡 CHART PROCESSING ISSUE:');
            console.log('   The chart may be incorrectly bucketing dates');
            console.log('   Check timezone handling or date boundary calculations');
        }
        
        console.log('\n📋 RECOMMENDED ACTIONS:');
        console.log('1. Review the specific record details above');
        console.log('2. Check if timestamp needs correction');
        console.log('3. Verify chart date processing logic');
        console.log('4. Consider if this is legitimate September 2nd activity');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

debugSeptember2PriceMotivated().catch(console.error);