// Test the polling filter fix
const { Client } = require('pg');
require('dotenv').config();

// Replicate the improved filtering logic
const shouldFilterOut = (change) => {
  if (change.source === 'polling') {
    const changeHour = new Date(change.changed_at).getHours();
    const changeMinute = new Date(change.changed_at).getMinutes();
    const changeSecond = new Date(change.changed_at).getSeconds();
    
    // Skip automated batch processing records
    if (changeHour === 0 && changeMinute < 30) {
      return true;
    }
    
    // Skip batch updates with identical timestamps
    if (changeSecond < 10 && changeMinute === 5) { // 00:05:0x pattern
      return true;
    }
  }
  return false;
};

async function testPollingFilter() {
    console.log('🧪 TESTING: Polling filter to exclude automated records\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        // Get recent records including the problematic Wednesday ones
        const query = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                stage_from,
                changed_at,
                source
            FROM stage_changes 
            WHERE changed_at >= '2025-09-08'
              AND stage_to IN ('ACQ - Qualified', 'ACQ - Offers Made', 'ACQ - Price Motivated')
            ORDER BY changed_at DESC
            LIMIT 20;
        `;
        
        const result = await client.query(query);
        
        console.log('🔍 TESTING FILTER ON RECENT RECORDS:');
        console.log('=' .repeat(50));
        
        let filteredOut = 0;
        let kept = 0;
        
        result.rows.forEach((row, index) => {
            const willFilter = shouldFilterOut(row);
            const status = willFilter ? '🚫 FILTER OUT' : '✅ KEEP';
            
            console.log(`${index + 1}. ${row.first_name} ${row.last_name} - ${row.stage_to}`);
            console.log(`   📅 ${row.changed_at}`);
            console.log(`   📡 Source: ${row.source}, From: ${row.stage_from}`);
            console.log(`   ${status}`);
            
            if (willFilter) {
                filteredOut++;
                console.log(`   🤖 Automated polling record - not real business activity`);
            } else {
                kept++;
            }
            console.log('');
        });
        
        console.log('📊 FILTER RESULTS:');
        console.log(`   🚫 Filtered out: ${filteredOut} automated records`);
        console.log(`   ✅ Kept: ${kept} real business activities`);
        
        // Show what Wednesday should look like after filtering
        console.log('\n📅 WEDNESDAY SEP 10 AFTER FILTERING:');
        console.log('=' .repeat(40));
        
        const wednesdayRecords = result.rows.filter(row => 
            row.changed_at.toISOString().startsWith('2025-09-10')
        );
        
        const wednesdayFiltered = wednesdayRecords.filter(row => !shouldFilterOut(row));
        
        console.log(`Before filter: ${wednesdayRecords.length} Wednesday records`);
        console.log(`After filter: ${wednesdayFiltered.length} Wednesday records`);
        
        if (wednesdayFiltered.length === 0) {
            console.log('✅ SUCCESS: Wednesday will now show 0 activity (correct!)');
        } else {
            console.log('⚠️  Still has Wednesday activity:');
            wednesdayFiltered.forEach(row => {
                console.log(`   - ${row.first_name} ${row.last_name}: ${row.stage_to}`);
            });
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ EXPECTED RESULT: Chart will no longer show Wednesday activity');
        console.log('📊 Only real business activities will be plotted');
        console.log('🤖 Automated polling records will be excluded');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

testPollingFilter().catch(console.error);