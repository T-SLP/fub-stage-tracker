// Investigate why data is showing on Wednesday when no work was done
const { Client } = require('pg');
require('dotenv').config();

async function investigateWednesdayData() {
    console.log('🕵️ INVESTIGATING: Why data shows on Wednesday Sep 10 when no work was done\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        // Check all records that have Wednesday Sep 10 timestamps
        console.log('🚨 RECORDS WITH WEDNESDAY SEP 10 TIMESTAMPS:');
        console.log('=' .repeat(60));
        
        const wednesdayQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                stage_from,
                changed_at,
                source
            FROM stage_changes 
            WHERE DATE(changed_at) = '2025-09-10'
              AND stage_to IN ('ACQ - Qualified', 'ACQ - Offers Made', 'ACQ - Price Motivated')
            ORDER BY changed_at;
        `;
        
        const wednesdayResult = await client.query(wednesdayQuery);
        
        if (wednesdayResult.rows.length === 0) {
            console.log('✅ No records found with Wednesday Sep 10 dates - good!');
            console.log('❌ But chart is showing Wednesday data, so dates are being processed incorrectly');
        } else {
            console.log(`🚨 Found ${wednesdayResult.rows.length} records with Wednesday Sep 10 dates:`);
            console.log('');
            
            wednesdayResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. ${row.first_name} ${row.last_name} - ${row.stage_to}`);
                console.log(`   ⏰ changed_at: ${row.changed_at}`);
                console.log(`   📅 Date portion: ${row.changed_at.toISOString().split('T')[0]}`);
                console.log(`   🕐 Time: ${row.changed_at.toLocaleTimeString()}`);
                console.log(`   🔄 From: ${row.stage_from}`);
                console.log(`   📡 Source: ${row.source || 'Unknown'}`);
                
                // Check if these are actually from a different day but with wrong timestamps
                const hour = new Date(row.changed_at).getHours();
                if (hour === 0) {
                    console.log(`   ⚠️  MIDNIGHT TIMESTAMP: This could be a system-generated timestamp!`);
                }
                console.log('');
            });
            
            // Group by exact timestamp to see if there are batches
            console.log('🔍 TIMESTAMP PATTERNS:');
            console.log('-'.repeat(30));
            
            const timestampGroups = {};
            wednesdayResult.rows.forEach(row => {
                const timestamp = row.changed_at.toISOString();
                if (!timestampGroups[timestamp]) {
                    timestampGroups[timestamp] = [];
                }
                timestampGroups[timestamp].push(`${row.first_name} ${row.last_name}`);
            });
            
            Object.entries(timestampGroups).forEach(([timestamp, names]) => {
                console.log(`⏰ ${timestamp}: ${names.length} records`);
                if (names.length > 1) {
                    console.log(`   🚨 BATCH: ${names.join(', ')}`);
                }
            });
        }
        
        // Check for suspicious patterns - identical timestamps
        console.log('\n🔍 CHECKING FOR SUSPICIOUS TIMESTAMP PATTERNS:');
        console.log('=' .repeat(55));
        
        const suspiciousQuery = `
            SELECT 
                changed_at,
                COUNT(*) as record_count,
                STRING_AGG(first_name || ' ' || last_name, ', ') as names
            FROM stage_changes 
            WHERE changed_at >= '2025-09-08'
              AND changed_at <= '2025-09-10 23:59:59'
              AND stage_to IN ('ACQ - Qualified', 'ACQ - Offers Made', 'ACQ - Price Motivated')
            GROUP BY changed_at
            HAVING COUNT(*) > 1
            ORDER BY changed_at DESC;
        `;
        
        const suspiciousResult = await client.query(suspiciousQuery);
        
        if (suspiciousResult.rows.length > 0) {
            console.log('🚨 FOUND BATCH UPDATES (multiple records with identical timestamps):');
            suspiciousResult.rows.forEach(row => {
                console.log(`\n⏰ ${row.changed_at}: ${row.record_count} records`);
                console.log(`   👥 Names: ${row.names}`);
                console.log(`   🤔 This suggests automated/batch processing, not real-time activity`);
            });
        } else {
            console.log('✅ No suspicious batch timestamps found');
        }
        
        // Check the actual chart date range calculation
        console.log('\n📊 CHECKING CHART DATE RANGE CALCULATION:');
        console.log('=' .repeat(50));
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        
        console.log(`Chart range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
        console.log(`Today is: ${endDate.toLocaleDateString()}`);
        
        if (endDate.toISOString().split('T')[0] === '2025-09-10') {
            console.log('📅 Today is indeed Sep 10, so if no work was done, Wednesday should show 0 activity');
        }
        
        // Final analysis
        console.log('\n' + '='.repeat(70));
        console.log('🔍 ANALYSIS CONCLUSION:');
        if (wednesdayResult.rows.length > 0) {
            console.log('❌ Issue: Database contains Sep 10 timestamps when no work was done');
            console.log('💡 Likely causes:');
            console.log('   1. System-generated timestamps (batch processing)');
            console.log('   2. Incorrect timezone handling in data import');
            console.log('   3. Historical data being updated with current timestamps');
        } else {
            console.log('✅ Database is clean - no Sep 10 activity recorded');
            console.log('❌ Problem: Chart processing is incorrectly assigning dates');
            console.log('💡 The issue is in our date processing logic, not the data');
        }
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

investigateWednesdayData().catch(console.error);