// Debug script to demonstrate the timezone issue in date processing
const { Client } = require('pg');
require('dotenv').config();

async function debugTimezoneIssue() {
    console.log('🕐 DEBUG: Investigating timezone/date parsing issues\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        console.log('🔍 Checking the last 3 "ACQ - Offers Made" records:');
        console.log('=' .repeat(60));
        
        const query = `
            SELECT 
                first_name,
                last_name,
                changed_at
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
            ORDER BY changed_at DESC
            LIMIT 3;
        `;
        
        const result = await client.query(query);
        
        result.rows.forEach((row, index) => {
            const dbTimestamp = row.changed_at;
            console.log(`\n${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   📅 Database timestamp: ${dbTimestamp}`);
            console.log(`   📅 Database date only: ${dbTimestamp.toISOString().split('T')[0]}`);
            
            // Current problematic method (what the code does now)
            const currentMethod = new Date(dbTimestamp).toISOString().split('T')[0];
            console.log(`   🚨 CURRENT METHOD: new Date(timestamp).toISOString().split('T')[0]`);
            console.log(`       Result: "${currentMethod}"`);
            
            // Better method - use the date directly from database
            const betterMethod = dbTimestamp.toISOString().split('T')[0];
            console.log(`   ✅ BETTER METHOD: timestamp.toISOString().split('T')[0]`);
            console.log(`       Result: "${betterMethod}"`);
            
            // Show if they're different
            if (currentMethod !== betterMethod) {
                console.log(`   ⚠️  MISMATCH! Current method gives wrong date!`);
            } else {
                console.log(`   ✅ Methods match`);
            }
            
            // Show local timezone interpretation
            const localDate = new Date(dbTimestamp).toLocaleDateString();
            console.log(`   🌍 Local timezone date: ${localDate}`);
            
            // Show what day of week
            const dayOfWeek = new Date(dbTimestamp).toLocaleDateString('en-US', { weekday: 'long' });
            console.log(`   📆 Day of week: ${dayOfWeek}`);
        });
        
        console.log('\n' + '='.repeat(60));
        console.log('🔍 TIMEZONE ANALYSIS:');
        console.log('Current system timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
        console.log('Current time:', new Date().toString());
        console.log('Current UTC time:', new Date().toISOString());
        
        // Test the exact problematic line from the code
        console.log('\n🧪 TESTING THE PROBLEMATIC LINE:');
        if (result.rows.length > 0) {
            const testTimestamp = result.rows[0].changed_at;
            console.log(`Original timestamp: ${testTimestamp}`);
            console.log(`new Date(timestamp): ${new Date(testTimestamp)}`);
            console.log(`new Date(timestamp).toISOString(): ${new Date(testTimestamp).toISOString()}`);
            console.log(`new Date(timestamp).toISOString().split('T')[0]: ${new Date(testTimestamp).toISOString().split('T')[0]}`);
            console.log(`Direct timestamp.toISOString().split('T')[0]: ${testTimestamp.toISOString().split('T')[0]}`);
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

debugTimezoneIssue().catch(console.error);