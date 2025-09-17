// Verify all price-motivated leads show on correct chart dates
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

async function verifyPriceMotivatedChartDates() {
    console.log('🔍 VERIFYING: All Price Motivated leads show on correct chart dates');
    console.log('=' .repeat(70));
    console.log('Checking that chart dates match actual stage change event dates\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Get all price-motivated stage changes from last 30 days
        console.log('📊 ALL PRICE MOTIVATED STAGE CHANGES (Last 30 Days):');
        console.log('-'.repeat(60));
        
        const priceMotivatedQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                changed_at,
                received_at,
                source,
                raw_payload
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Price Motivated'
              AND changed_at >= NOW() - INTERVAL '30 days'
            ORDER BY changed_at DESC;
        `;
        
        const result = await client.query(priceMotivatedQuery);
        
        if (result.rows.length === 0) {
            console.log('❌ No price-motivated leads found in last 30 days');
            return;
        }
        
        console.log(`Found ${result.rows.length} price-motivated stage changes:\n`);
        
        let correctDates = 0;
        let incorrectDates = 0;
        let noRealTimestamp = 0;
        let dateMismatches = [];
        
        result.rows.forEach((row, index) => {
            const changeDate = new Date(row.changed_at);
            const chartDate = changeDate.toDateString();
            
            console.log(`${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   📅 Database changed_at: ${row.changed_at}`);
            console.log(`   📊 Charts will plot on: ${chartDate}`);
            console.log(`   📡 Source: ${row.source}`);
            
            // Check if this is a corrected timestamp or original processing time
            if (row.source === 'polling' && row.changed_at.getTime() === row.received_at.getTime()) {
                console.log(`   ⚠️  IDENTICAL TIMESTAMPS: May be using processing time instead of real event time`);
            }
            
            // Extract real FUB timestamp if available
            if (row.raw_payload) {
                const payload = safeParseJSON(JSON.stringify(row.raw_payload));
                if (payload) {
                    const realTimestamp = payload.updated || payload.lastActivity;
                    if (realTimestamp) {
                        const realDate = new Date(realTimestamp);
                        const realChartDate = realDate.toDateString();
                        
                        console.log(`   🕐 Real FUB timestamp: ${realTimestamp}`);
                        console.log(`   📅 Real event date: ${realChartDate}`);
                        
                        if (chartDate === realChartDate) {
                            console.log(`   ✅ CORRECT: Chart date matches real event date`);
                            correctDates++;
                        } else {
                            console.log(`   ❌ MISMATCH: Chart shows ${chartDate}, but real event was ${realChartDate}`);
                            incorrectDates++;
                            dateMismatches.push({
                                name: `${row.first_name} ${row.last_name}`,
                                chartDate: chartDate,
                                realDate: realChartDate,
                                realTimestamp: realTimestamp,
                                dbTimestamp: row.changed_at
                            });
                        }
                    } else {
                        console.log(`   ⚠️  No real timestamp in FUB payload`);
                        noRealTimestamp++;
                    }
                } else {
                    console.log(`   ❌ Could not parse raw_payload`);
                    noRealTimestamp++;
                }
            } else {
                console.log(`   ❌ No raw_payload available`);
                noRealTimestamp++;
            }
            
            console.log('');
        });
        
        // Summary of findings
        console.log('📊 VERIFICATION SUMMARY:');
        console.log('=' .repeat(30));
        console.log(`✅ Correct dates: ${correctDates}`);
        console.log(`❌ Incorrect dates: ${incorrectDates}`);
        console.log(`⚠️  No real timestamp: ${noRealTimestamp}`);
        console.log(`📈 Total records: ${result.rows.length}`);
        
        const accuracyRate = ((correctDates / (correctDates + incorrectDates)) * 100).toFixed(1);
        console.log(`🎯 Date accuracy: ${accuracyRate}%`);
        
        // Show date mismatches in detail
        if (dateMismatches.length > 0) {
            console.log('\n🚨 DATE MISMATCHES REQUIRING CORRECTION:');
            console.log('-'.repeat(50));
            
            dateMismatches.forEach((mismatch, index) => {
                console.log(`${index + 1}. ${mismatch.name}:`);
                console.log(`   📊 Currently plots on: ${mismatch.chartDate}`);
                console.log(`   📅 Should plot on: ${mismatch.realDate}`);
                console.log(`   🔧 Fix: Update changed_at from ${mismatch.dbTimestamp} to ${mismatch.realTimestamp}`);
                console.log('');
            });
            
            console.log('💡 RECOMMENDATION:');
            console.log('Run the timestamp correction script to fix these mismatches:');
            console.log('node fix-existing-timestamps.js');
        }
        
        // Group by chart dates to show distribution
        console.log('\n📈 PRICE MOTIVATED BY CHART DATE:');
        console.log('-'.repeat(40));
        
        const dateGroups = {};
        result.rows.forEach(row => {
            const chartDate = new Date(row.changed_at).toDateString();
            if (!dateGroups[chartDate]) {
                dateGroups[chartDate] = [];
            }
            dateGroups[chartDate].push(`${row.first_name} ${row.last_name}`);
        });
        
        Object.entries(dateGroups)
            .sort(([a], [b]) => new Date(a) - new Date(b))
            .forEach(([date, names]) => {
                console.log(`📅 ${date}: ${names.length} leads`);
                names.forEach(name => console.log(`   - ${name}`));
                console.log('');
            });
        
        // Final status
        console.log('=' .repeat(70));
        if (incorrectDates === 0) {
            console.log('🎉 SUCCESS: All price-motivated leads show on correct chart dates!');
        } else {
            console.log(`🚨 ISSUE: ${incorrectDates} leads showing on wrong chart dates`);
            console.log('💡 These need timestamp correction to show accurate chart data');
        }
        console.log('=' .repeat(70));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

verifyPriceMotivatedChartDates().catch(console.error);