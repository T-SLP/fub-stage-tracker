// Debug script to test the exact chart date processing logic
const { Client } = require('pg');
require('dotenv').config();

// Helper function to get week start (Sunday) - copied from dataProcessing.js
const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

async function debugChartDates() {
    console.log('📊 DEBUG: Testing chart date processing logic\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        // Get last 3 offers to test with
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
        
        // Simulate the chart date range (last 7 days like the dashboard)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        
        console.log('🗓️  CHART DATE RANGE:');
        console.log(`Start: ${startDate.toISOString()} (${startDate.toLocaleDateString()})`);
        console.log(`End: ${endDate.toISOString()} (${endDate.toLocaleDateString()})`);
        console.log('');
        
        // Create daily buckets (simulating the chart creation logic)
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        const dailyData = [];
        
        console.log('📅 CREATING CHART BUCKETS:');
        console.log('=' .repeat(50));
        
        for (let i = 0; i < totalDays; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const bucket = {
                date: date.toISOString().split('T')[0],
                dateFormatted: date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    weekday: 'short'
                }),
                offers: 0
            };
            dailyData.push(bucket);
            console.log(`${i + 1}. Bucket: "${bucket.date}" → Display: "${bucket.dateFormatted}"`);
        }
        
        console.log('\n🎯 TESTING OFFER ASSIGNMENTS:');
        console.log('=' .repeat(50));
        
        // Test assignment logic for each offer
        result.rows.forEach((row, index) => {
            const dbTimestamp = row.changed_at;
            
            // This is the problematic line from the original code
            const changeDate = new Date(dbTimestamp).toISOString().split('T')[0];
            
            console.log(`\n${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   Database timestamp: ${dbTimestamp}`);
            console.log(`   Processed changeDate: "${changeDate}"`);
            
            // Find which bucket this would be assigned to
            const matchingBucket = dailyData.find(d => d.date === changeDate);
            if (matchingBucket) {
                console.log(`   ✅ Assigned to bucket: "${changeDate}"`);
                console.log(`   📊 Chart shows: "${matchingBucket.dateFormatted}"`);
                matchingBucket.offers++;
            } else {
                console.log(`   ❌ NO MATCHING BUCKET! (outside date range)`);
            }
            
            // Show what day this actually represents
            const actualDay = new Date(dbTimestamp).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                weekday: 'short'
            });
            console.log(`   🗓️  Actual day: "${actualDay}"`);
            
            // Check if they match
            if (matchingBucket && matchingBucket.dateFormatted !== actualDay) {
                console.log(`   ⚠️  MISMATCH! Chart shows "${matchingBucket.dateFormatted}" but actual day is "${actualDay}"`);
            }
        });
        
        console.log('\n📊 FINAL CHART DATA:');
        console.log('=' .repeat(30));
        dailyData.forEach(bucket => {
            if (bucket.offers > 0) {
                console.log(`${bucket.dateFormatted}: ${bucket.offers} offers`);
            }
        });
        
        // Test alternative date processing
        console.log('\n🔬 TESTING ALTERNATIVE DATE PROCESSING:');
        console.log('=' .repeat(50));
        
        result.rows.forEach((row, index) => {
            const dbTimestamp = row.changed_at;
            
            console.log(`\n${index + 1}. ${row.first_name} ${row.last_name}:`);
            
            // Method 1: Current (potentially problematic)
            const method1 = new Date(dbTimestamp).toISOString().split('T')[0];
            console.log(`   Method 1 (current): "${method1}"`);
            
            // Method 2: Use database timestamp directly
            const method2 = dbTimestamp.toISOString().split('T')[0];
            console.log(`   Method 2 (direct): "${method2}"`);
            
            // Method 3: Use local date
            const localDate = new Date(dbTimestamp);
            const method3 = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
            console.log(`   Method 3 (local): "${method3}"`);
            
            if (method1 !== method2 || method2 !== method3) {
                console.log(`   ⚠️  METHODS GIVE DIFFERENT RESULTS!`);
            }
        });
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

debugChartDates().catch(console.error);