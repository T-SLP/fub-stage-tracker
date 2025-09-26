// Test the date range fix
const { Client } = require('pg');
require('dotenv').config();

// Helper function to get week start (Sunday) - copied from dataProcessing.js
const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

// Simulate the fixed processSupabaseData logic
async function testDateRangeFix() {
    console.log('🧪 TESTING: Date range fix for chart data\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        // Get recent offers
        const query = `
            SELECT 
                first_name,
                last_name,
                changed_at
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
            ORDER BY changed_at DESC
            LIMIT 5;
        `;
        
        const result = await client.query(query);
        
        // Simulate dashboard date range (last 7 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        
        console.log('🗓️  SIMULATING DASHBOARD DATE RANGE:');
        console.log(`Start: ${startDate.toLocaleDateString()} (${startDate.toISOString().split('T')[0]})`);
        console.log(`End: ${endDate.toLocaleDateString()} (${endDate.toISOString().split('T')[0]})`);
        console.log('');
        
        // OLD METHOD (before fix)
        console.log('❌ OLD METHOD (problematic):');
        console.log('=' .repeat(40));
        const oldTotalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        console.log(`Total days calculated: ${oldTotalDays}`);
        
        const oldDailyData = [];
        for (let i = 0; i < oldTotalDays; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            oldDailyData.push({
                date: date.toISOString().split('T')[0],
                dateFormatted: date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    weekday: 'short'
                })
            });
        }
        
        console.log('Old chart buckets:');
        oldDailyData.forEach((bucket, i) => {
            console.log(`  ${i + 1}. ${bucket.date} → "${bucket.dateFormatted}"`);
        });
        
        // NEW METHOD (after fix)
        console.log('\n✅ NEW METHOD (fixed):');
        console.log('=' .repeat(40));
        const newTotalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        console.log(`Total days calculated: ${newTotalDays}`);
        
        const newDailyData = [];
        for (let i = 0; i < newTotalDays; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const dateKey = date.toISOString().split('T')[0];
            
            newDailyData.push({
                date: dateKey,
                dateFormatted: new Date(dateKey + 'T12:00:00').toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    weekday: 'short'
                })
            });
        }
        
        console.log('New chart buckets:');
        newDailyData.forEach((bucket, i) => {
            console.log(`  ${i + 1}. ${bucket.date} → "${bucket.dateFormatted}"`);
        });
        
        // Test offer assignments
        console.log('\n🎯 TESTING OFFER ASSIGNMENTS:');
        console.log('=' .repeat(50));
        
        result.rows.forEach((row, index) => {
            const dbTimestamp = row.changed_at;
            const changeDate = dbTimestamp.toISOString().split('T')[0];
            
            console.log(`\n${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   Database timestamp: ${dbTimestamp}`);
            console.log(`   Change date: ${changeDate}`);
            
            // Check old method
            const oldMatch = oldDailyData.find(d => d.date === changeDate);
            if (oldMatch) {
                console.log(`   ❌ Old method: Found in bucket "${oldMatch.dateFormatted}"`);
            } else {
                console.log(`   ❌ Old method: NOT FOUND (outside range)`);
            }
            
            // Check new method
            const newMatch = newDailyData.find(d => d.date === changeDate);
            if (newMatch) {
                console.log(`   ✅ New method: Found in bucket "${newMatch.dateFormatted}"`);
            } else {
                console.log(`   ❌ New method: NOT FOUND (outside range)`);
            }
        });
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ SUMMARY: The fix should include today\'s data in the chart');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

testDateRangeFix().catch(console.error);