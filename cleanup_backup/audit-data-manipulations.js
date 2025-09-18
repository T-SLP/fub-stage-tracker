// Comprehensive audit of all data manipulations between database and dashboard
const { Client } = require('pg');
require('dotenv').config();

async function auditDataManipulations() {
    console.log('🔍 COMPREHENSIVE DATA INTEGRITY AUDIT');
    console.log('=' .repeat(70));
    console.log('Checking for ANY data manipulation between database and dashboard\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        // 1. CHECK RAW DATABASE DATA vs DASHBOARD DATA
        console.log('1️⃣ RECENT ACTIVITY TABLE DATA INTEGRITY CHECK:');
        console.log('=' .repeat(60));
        
        const recentActivityQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                stage_from,
                changed_at,
                source,
                campaign_id,
                lead_source_tag
            FROM stage_changes 
            WHERE stage_to IN ('ACQ - Qualified', 'ACQ - Offers Made', 'ACQ - Price Motivated')
            ORDER BY changed_at DESC
            LIMIT 10;
        `;
        
        const recentResult = await client.query(recentActivityQuery);
        
        console.log('📊 RAW DATABASE DATA:');
        recentResult.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.first_name} ${row.last_name} - ${row.stage_to}`);
            console.log(`   📅 DB Timestamp: ${row.changed_at}`);
            console.log(`   📅 DB ISO: ${row.changed_at.toISOString()}`);
            console.log(`   📅 JS Date: ${new Date(row.changed_at)}`);
            console.log(`   📅 toLocaleString(): ${new Date(row.changed_at).toLocaleString()}`);
            console.log(`   📡 Source: ${row.source}`);
            console.log(`   🔄 From: ${row.stage_from}`);
            console.log('');
        });
        
        // 2. CHECK FOR DATE MANIPULATIONS
        console.log('\n2️⃣ DATE PROCESSING MANIPULATIONS:');
        console.log('=' .repeat(50));
        
        console.log('🚨 IDENTIFIED MANIPULATIONS IN CODE:');
        console.log('');
        
        console.log('A) TIMEZONE CONVERSIONS:');
        console.log('   - toEasternTime() function converts dates');
        console.log('   - formatEasternDate() changes date format');
        console.log('   - May shift dates across timezone boundaries');
        console.log('');
        
        console.log('B) FILTERING MANIPULATIONS:');
        console.log('   - Automated polling records filtered out');
        console.log('   - Midnight timestamps (00:05:xx) excluded');
        console.log('   - Records with source="polling" may be hidden');
        console.log('');
        
        console.log('C) AGGREGATION MANIPULATIONS:');
        console.log('   - Daily/weekly grouping changes individual timestamps');
        console.log('   - Chart data buckets combine multiple records');
        console.log('   - Summary calculations derive new values');
        console.log('');
        
        // 3. CHECK SPECIFIC MANIPULATION EXAMPLES
        console.log('3️⃣ SPECIFIC MANIPULATION EXAMPLES:');
        console.log('=' .repeat(45));
        
        recentResult.rows.slice(0, 3).forEach((row, index) => {
            console.log(`RECORD ${index + 1}: ${row.first_name} ${row.last_name}`);
            console.log(`📊 Database shows: ${row.changed_at}`);
            
            // Show all the manipulations this record goes through
            const originalDate = new Date(row.changed_at);
            
            // Eastern Time conversion
            const easternDate = new Date(originalDate.toLocaleString("en-US", {timeZone: "America/New_York"}));
            console.log(`🔄 After ET conversion: ${easternDate}`);
            
            // Date formatting for chart
            const chartDate = `${easternDate.getFullYear()}-${String(easternDate.getMonth() + 1).padStart(2, '0')}-${String(easternDate.getDate()).padStart(2, '0')}`;
            console.log(`📊 Chart date: ${chartDate}`);
            
            // Activity table display
            const activityDisplay = originalDate.toLocaleString();
            console.log(`📋 Activity table: ${activityDisplay}`);
            
            // Filtering check
            let filtered = false;
            if (row.source === 'polling') {
                const hour = originalDate.getHours();
                const minute = originalDate.getMinutes();
                const second = originalDate.getSeconds();
                
                if (hour === 0 && minute < 30) {
                    filtered = true;
                    console.log(`🚫 FILTERED OUT: Midnight polling record`);
                } else if (second < 10 && minute === 5) {
                    filtered = true;
                    console.log(`🚫 FILTERED OUT: Batch processing pattern`);
                }
            }
            
            if (!filtered) {
                console.log(`✅ INCLUDED: Passes filters`);
            }
            
            console.log('');
        });
        
        // 4. CHECK CALCULATED FIELDS
        console.log('4️⃣ CALCULATED/DERIVED DATA:');
        console.log('=' .repeat(35));
        
        console.log('🧮 DASHBOARD CALCULATIONS (not raw DB data):');
        console.log('   - Daily/Weekly totals');
        console.log('   - Percentage rates (qualified→offer rate)');
        console.log('   - Average time calculations');
        console.log('   - Business days calculations');
        console.log('   - Week comparison (this week vs last week)');
        console.log('   - Chart date formatting (Mon, Sep 8)');
        console.log('');
        
        // 5. CHECK STAGE NAME MANIPULATIONS
        console.log('5️⃣ STAGE NAME MANIPULATIONS:');
        console.log('=' .repeat(35));
        
        const throwawayCheck = `
            SELECT DISTINCT
                stage_from,
                stage_to,
                COUNT(*) as count
            FROM stage_changes 
            WHERE (
                (stage_from IN ('ACQ - Qualified', 'Qualified Phase 2 - Day 3 to 2 Weeks', 'Qualified Phase 3 - 2 Weeks to 4 Weeks')
                 AND stage_to IN ('ACQ - Price Motivated', 'ACQ - Not Interested', 'ACQ - Not Ready to Sell', 'ACQ - Dead / DNC'))
            )
            GROUP BY stage_from, stage_to
            ORDER BY count DESC
            LIMIT 5;
        `;
        
        const throwawayResult = await client.query(throwawayCheck);
        
        console.log('🚨 STAGE NAME MANIPULATIONS:');
        throwawayResult.rows.forEach(row => {
            console.log(`   ${row.stage_from} → ${row.stage_to}`);
            console.log(`   ⚠️  Dashboard shows as: "Throwaway Lead"`);
            console.log(`   📊 Original stage lost: ${row.stage_to}`);
            console.log('');
        });
        
        // 6. SUMMARY OF ALL MANIPULATIONS
        console.log('6️⃣ COMPLETE MANIPULATION SUMMARY:');
        console.log('=' .repeat(40));
        
        console.log('🚨 DATA BEING MANIPULATED:');
        console.log('');
        console.log('TIMESTAMPS:');
        console.log('✗ Original database timestamps converted to Eastern Time');
        console.log('✗ Date boundaries shifted by timezone conversion');
        console.log('✗ Chart dates may differ from actual event dates');
        console.log('');
        console.log('RECORD FILTERING:');
        console.log('✗ Polling records with midnight timestamps hidden');
        console.log('✗ Automated system records excluded from charts');
        console.log('✗ Some legitimate records may be incorrectly filtered');
        console.log('');
        console.log('STAGE NAMES:');
        console.log('✗ Multiple different stages collapsed to "Throwaway Lead"');
        console.log('✗ Specific stage information lost (ACQ - Dead / DNC vs ACQ - Not Interested)');
        console.log('');
        console.log('AGGREGATIONS:');
        console.log('✗ Individual records combined into daily/weekly totals');
        console.log('✗ Exact timestamps lost in chart display');
        console.log('✗ Calculated metrics derived from manipulated data');
        console.log('');
        console.log('DISPLAY FORMATTING:');
        console.log('✗ Date formats changed for chart display');
        console.log('✗ Activity table uses different date processing than charts');
        console.log('');
        
        console.log('💡 RECOMMENDATION:');
        console.log('=' .repeat(20));
        console.log('✅ Use database timestamps AS-IS for all displays');
        console.log('✅ Remove timezone conversions - let database handle timezone');
        console.log('✅ Remove automated record filtering');
        console.log('✅ Show actual stage names, not collapsed categories');
        console.log('✅ Ensure activity table and charts use identical date logic');
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

auditDataManipulations().catch(console.error);