// Test the Eastern Time implementation
const { Client } = require('pg');
require('dotenv').config();

// Import the new ET helper functions (simulate them for testing)
const toEasternTime = (date) => {
  return new Date(date.toLocaleString("en-US", {timeZone: "America/New_York"}));
};

const formatEasternDate = (date) => {
  const easternDate = toEasternTime(new Date(date));
  return `${easternDate.getFullYear()}-${String(easternDate.getMonth() + 1).padStart(2, '0')}-${String(easternDate.getDate()).padStart(2, '0')}`;
};

async function testEasternTime() {
    console.log('🕐 TESTING: Eastern Time implementation\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        // Test with recent offers to see ET processing
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
        
        console.log('🧪 TESTING EASTERN TIME PROCESSING:');
        console.log('=' .repeat(60));
        
        result.rows.forEach((row, index) => {
            const dbTimestamp = row.changed_at;
            
            console.log(`\n${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   📅 Database timestamp: ${dbTimestamp}`);
            console.log(`   🌍 Timezone: ${dbTimestamp.toString()}`);
            
            // Test Eastern Time conversion
            const easternTime = toEasternTime(dbTimestamp);
            const easternDate = formatEasternDate(dbTimestamp);
            
            console.log(`   🕐 Eastern Time: ${easternTime}`);
            console.log(`   📊 Eastern Date (for chart): "${easternDate}"`);
            
            // Show display formatting
            const displayFormat = easternTime.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                weekday: 'short',
                timeZone: 'America/New_York'
            });
            console.log(`   📊 Chart display: "${displayFormat}"`);
            
            // Compare with previous methods
            const oldLocalMethod = new Date(dbTimestamp);
            const oldLocalDate = `${oldLocalMethod.getFullYear()}-${String(oldLocalMethod.getMonth() + 1).padStart(2, '0')}-${String(oldLocalMethod.getDate()).padStart(2, '0')}`;
            const oldISOMethod = dbTimestamp.toISOString().split('T')[0];
            
            console.log(`\n   🔄 Method comparison:`);
            console.log(`   - ET method: "${easternDate}"`);
            console.log(`   - Old local: "${oldLocalDate}"`);
            console.log(`   - Old ISO: "${oldISOMethod}"`);
            
            if (easternDate !== oldLocalDate || easternDate !== oldISOMethod) {
                console.log(`   📈 ET method ensures consistency regardless of server timezone`);
            } else {
                console.log(`   ✅ All methods agree (likely running on ET server)`);
            }
        });
        
        // Test timezone edge cases
        console.log(`\n🌍 TIMEZONE EDGE CASE TESTING:`);
        console.log('=' .repeat(50));
        
        // Test with a known late evening timestamp
        const testCases = [
            new Date('2025-09-05T23:59:56-04:00'), // 11:59 PM EDT
            new Date('2025-09-05T03:59:56Z'), // Same time in UTC (next day)
            new Date('2025-12-05T23:59:56-05:00'), // 11:59 PM EST (winter)
            new Date('2025-12-06T04:59:56Z') // Same winter time in UTC (next day)
        ];
        
        testCases.forEach((testDate, index) => {
            console.log(`\nTest case ${index + 1}:`);
            console.log(`  Input: ${testDate}`);
            console.log(`  ET Date: ${formatEasternDate(testDate)}`);
            console.log(`  ET Time: ${toEasternTime(testDate)}`);
        });
        
        console.log('\n' + '='.repeat(70));
        console.log('✅ EASTERN TIME BENEFITS:');
        console.log('📊 Consistent dates regardless of server deployment location');
        console.log('🕐 Handles EDT/EST transitions automatically');
        console.log('🎯 All users see data in their business timezone (ET)');
        console.log('📈 Charts always reflect when events occurred in Eastern Time');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

testEasternTime().catch(console.error);