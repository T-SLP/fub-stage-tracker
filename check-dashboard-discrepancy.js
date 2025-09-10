// Check the exact discrepancy the user is seeing
const { Client } = require('pg');
require('dotenv').config();

async function checkDashboardDiscrepancy() {
    console.log('🔍 CHECKING: Dashboard discrepancy for Sept 9 vs Sept 10\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        // Check what the user is seeing in the pipeline activity table
        console.log('📋 PIPELINE ACTIVITY TABLE (what user sees):');
        console.log('=' .repeat(50));
        
        const activityQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                changed_at,
                TO_CHAR(changed_at, 'YYYY-MM-DD HH24:MI:SS TZ') as formatted_timestamp
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
            ORDER BY changed_at DESC
            LIMIT 3;
        `;
        
        const activityResult = await client.query(activityQuery);
        
        activityResult.rows.forEach((row, index) => {
            const dbTimestamp = row.changed_at;
            console.log(`${index + 1}. ${row.first_name} ${row.last_name}`);
            console.log(`   Stage: ${row.stage_to}`);
            console.log(`   Timestamp: ${row.formatted_timestamp}`);
            console.log(`   Display date: ${dbTimestamp.toLocaleDateString()} at ${dbTimestamp.toLocaleTimeString()}`);
        });
        
        console.log('\n📊 BAR CHART PROCESSING (what code does):');
        console.log('=' .repeat(50));
        
        activityResult.rows.forEach((row, index) => {
            const dbTimestamp = row.changed_at;
            
            // Current problematic method
            const chartDate = dbTimestamp.toISOString().split('T')[0];
            const chartDay = new Date(chartDate + 'T12:00:00').toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
            });
            
            // Correct method (local date)
            const localDate = new Date(dbTimestamp);
            const correctDate = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
            const correctDay = localDate.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
            });
            
            console.log(`${index + 1}. ${row.first_name} ${row.last_name}`);
            console.log(`   ❌ Chart shows: ${chartDay} (from date: ${chartDate})`);
            console.log(`   ✅ Should show: ${correctDay} (from date: ${correctDate})`);
            
            if (chartDate !== correctDate) {
                console.log(`   🚨 MISMATCH DETECTED! Off by 1 day due to timezone conversion`);
            } else {
                console.log(`   ✅ Dates match`);
            }
        });
        
        console.log('\n🕐 TIMEZONE ISSUE EXPLANATION:');
        console.log('=' .repeat(45));
        console.log('When timestamps are late in the day (evening):');
        console.log('1. Local time: 11:59 PM Sept 9 (Eastern)');
        console.log('2. toISOString(): converts to UTC = 3:59 AM Sept 10');
        console.log('3. split("T")[0]: takes "2025-09-10" instead of "2025-09-09"');
        console.log('4. Chart plots on wrong day!');
        
        console.log('\n✅ SOLUTION: Use local date instead of ISO string conversion');
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

checkDashboardDiscrepancy().catch(console.error);