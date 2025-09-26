// Debug the specific offers showing date misalignment
const { Client } = require('pg');
require('dotenv').config();

async function debugSpecificOffers() {
    console.log('🕵️ DEBUG: Investigating specific offers date misalignment\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        // Get the exact offers that are misaligned
        console.log('🔍 CHECKING RECENT OFFERS WITH DETAILED TIMESTAMPS:');
        console.log('=' .repeat(60));
        
        const query = `
            SELECT 
                first_name,
                last_name,
                stage_from,
                stage_to,
                changed_at,
                campaign_id,
                lead_source_tag
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
            ORDER BY changed_at DESC
            LIMIT 5;
        `;
        
        const result = await client.query(query);
        
        result.rows.forEach((row, index) => {
            const dbTimestamp = row.changed_at;
            console.log(`\n${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   📅 Raw DB timestamp: ${dbTimestamp}`);
            console.log(`   📅 ISO string: ${dbTimestamp.toISOString()}`);
            console.log(`   🗓️  Local date: ${dbTimestamp.toLocaleDateString()}`);
            console.log(`   🕐 Local time: ${dbTimestamp.toLocaleTimeString()}`);
            console.log(`   🌍 Timezone: ${dbTimestamp.toString()}`);
            
            // Test our date processing logic
            console.log(`\n   🔧 PROCESSING TESTS:`);
            
            // Method 1: What our current code does
            const method1 = dbTimestamp.toISOString().split('T')[0];
            console.log(`   Method 1 (current): "${method1}"`);
            
            // Method 2: What we used to do (problematic)
            const method2 = new Date(dbTimestamp).toISOString().split('T')[0];
            console.log(`   Method 2 (old): "${method2}"`);
            
            // Method 3: Local date approach
            const localDate = new Date(dbTimestamp);
            const year = localDate.getFullYear();
            const month = String(localDate.getMonth() + 1).padStart(2, '0');
            const day = String(localDate.getDate()).padStart(2, '0');
            const method3 = `${year}-${month}-${day}`;
            console.log(`   Method 3 (local): "${method3}"`);
            
            // Method 4: UTC date parts
            const utcDate = new Date(dbTimestamp);
            const utcYear = utcDate.getUTCFullYear();
            const utcMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
            const utcDay = String(utcDate.getUTCDate()).padStart(2, '0');
            const method4 = `${utcYear}-${utcMonth}-${utcDay}`;
            console.log(`   Method 4 (UTC): "${method4}"`);
            
            console.log(`   ⏰ Hour in local TZ: ${localDate.getHours()}:${String(localDate.getMinutes()).padStart(2, '0')}`);
            console.log(`   ⏰ Hour in UTC: ${utcDate.getUTCHours()}:${String(utcDate.getUTCMinutes()).padStart(2, '0')}`);
            
            if (method1 !== method3) {
                console.log(`   ⚠️  DATE MISMATCH! ISO vs Local: "${method1}" vs "${method3}"`);
            }
            
            // Show which day this would be bucketed to
            const expectedChartDay = new Date(method3 + 'T12:00:00').toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
            });
            console.log(`   📊 Should appear on chart as: "${expectedChartDay}"`);
        });
        
        // Special check for the timezone boundary issue
        console.log(`\n🌍 TIMEZONE BOUNDARY ANALYSIS:`);
        console.log('=' .repeat(50));
        
        const timezoneQuery = `
            SELECT 
                first_name,
                last_name,
                changed_at,
                EXTRACT(HOUR FROM changed_at) as hour_local,
                EXTRACT(HOUR FROM changed_at AT TIME ZONE 'UTC') as hour_utc
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
            ORDER BY changed_at DESC
            LIMIT 5;
        `;
        
        const timezoneResult = await client.query(timezoneQuery);
        
        timezoneResult.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   Local hour: ${row.hour_local}, UTC hour: ${row.hour_utc}`);
            
            if (row.hour_local < 4 && row.hour_utc >= 20) {
                console.log(`   🚨 TIMEZONE BOUNDARY ISSUE! Early morning local = previous day UTC`);
            }
        });
        
        // Test the exact scenario: late evening entries showing as next day
        console.log(`\n🕐 LATE EVENING ENTRIES CHECK:`);
        console.log('=' .repeat(40));
        
        const lateEveningQuery = `
            SELECT 
                first_name,
                last_name,
                changed_at,
                DATE(changed_at) as db_date,
                DATE(changed_at AT TIME ZONE 'UTC') as utc_date
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
              AND EXTRACT(HOUR FROM changed_at) BETWEEN 18 AND 23
            ORDER BY changed_at DESC
            LIMIT 5;
        `;
        
        const lateResult = await client.query(lateEveningQuery);
        
        if (lateResult.rows.length > 0) {
            console.log('Found late evening entries:');
            lateResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. ${row.first_name} ${row.last_name}:`);
                console.log(`   DB date: ${row.db_date.toISOString().split('T')[0]}`);
                console.log(`   UTC date: ${row.utc_date ? row.utc_date.toISOString().split('T')[0] : 'N/A'}`);
                console.log(`   Full timestamp: ${row.changed_at}`);
            });
        } else {
            console.log('No late evening entries found in recent offers');
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

debugSpecificOffers().catch(console.error);