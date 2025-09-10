// Test the timezone fix for chart date processing
const { Client } = require('pg');
require('dotenv').config();

async function testTimezoneFix() {
    console.log('🔧 TESTING: Timezone fix for chart date processing\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        // Get the problematic offers (especially late evening ones)
        const query = `
            SELECT 
                first_name,
                last_name,
                changed_at,
                stage_to
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
            ORDER BY changed_at DESC
            LIMIT 5;
        `;
        
        const result = await client.query(query);
        
        console.log('🧪 TESTING DATE PROCESSING FOR EACH OFFER:');
        console.log('=' .repeat(60));
        
        result.rows.forEach((row, index) => {
            const dbTimestamp = row.changed_at;
            
            console.log(`\n${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   📅 Database timestamp: ${dbTimestamp}`);
            
            // OLD METHOD (problematic - ISO conversion)
            const oldMethod = dbTimestamp.toISOString().split('T')[0];
            
            // NEW METHOD (fixed - local date)
            const localDate = new Date(dbTimestamp);
            const newMethod = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
            
            console.log(`   ❌ Old method (ISO): "${oldMethod}"`);
            console.log(`   ✅ New method (local): "${newMethod}"`);
            
            if (oldMethod !== newMethod) {
                console.log(`   🚨 TIMEZONE SHIFT DETECTED! Old method was wrong by 1 day`);
                
                // Show which chart day it would appear on
                const wrongDay = new Date(oldMethod + 'T12:00:00').toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                });
                const correctDay = localDate.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                });
                
                console.log(`   📊 Old: Would show on "${wrongDay}"`);
                console.log(`   📊 New: Will show on "${correctDay}"`);
            } else {
                console.log(`   ✅ No timezone shift - dates match`);
                
                const chartDay = localDate.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                });
                console.log(`   📊 Chart day: "${chartDay}"`);
            }
            
            // Show the exact time to understand why shifts happen
            const hourLocal = localDate.getHours();
            const hourUTC = localDate.getUTCHours();
            console.log(`   🕐 Local time: ${hourLocal}:${String(localDate.getMinutes()).padStart(2, '0')}`);
            console.log(`   🌍 UTC time: ${hourUTC}:${String(localDate.getUTCMinutes()).padStart(2, '0')}`);
            
            if (hourLocal >= 20 || hourLocal <= 3) { // Evening or very early morning
                console.log(`   ⚠️  TIMEZONE BOUNDARY RISK: Late/early hour could cause date shifts`);
            }
        });
        
        console.log('\n' + '='.repeat(70));
        console.log('✅ SUMMARY: The fix ensures chart uses local dates');
        console.log('📊 Events will appear on the day they actually occurred locally');
        console.log('🚫 No more timezone-induced date shifts for late evening events');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

testTimezoneFix().catch(console.error);