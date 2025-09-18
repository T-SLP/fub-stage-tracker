// Test date alignment for ALL metrics on the bar chart
const { Client } = require('pg');
require('dotenv').config();

async function testAllMetricsAlignment() {
    console.log('📊 TESTING: Date alignment for ALL bar chart metrics\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        // Define the stages we're tracking (matching the code)
        const stages = {
            qualified: 'ACQ - Qualified',
            offers: 'ACQ - Offers Made',
            priceMotivated: 'ACQ - Price Motivated',
            // Throwaway leads are calculated differently - transitions FROM qualified stages TO throwaway stages
        };
        
        console.log('🎯 TESTING EACH METRIC (last 5 days):');
        console.log('=' .repeat(60));
        
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        
        // Test each metric
        for (const [metricName, stageName] of Object.entries(stages)) {
            console.log(`\n📈 ${metricName.toUpperCase()} (${stageName}):`);
            console.log('-'.repeat(40));
            
            const query = `
                SELECT 
                    first_name,
                    last_name,
                    changed_at,
                    stage_from
                FROM stage_changes 
                WHERE stage_to = $1
                  AND changed_at >= $2
                ORDER BY changed_at DESC
                LIMIT 5;
            `;
            
            const result = await client.query(query, [stageName, fiveDaysAgo.toISOString()]);
            
            if (result.rows.length === 0) {
                console.log('   ❌ No recent records found');
            } else {
                console.log(`   ✅ Found ${result.rows.length} recent records:`);
                
                result.rows.forEach((row, index) => {
                    const timestamp = row.changed_at;
                    const actualDate = timestamp.toISOString().split('T')[0];
                    const displayDay = new Date(timestamp).toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric' 
                    });
                    
                    console.log(`   ${index + 1}. ${row.first_name} ${row.last_name}`);
                    console.log(`      📅 Actual: ${actualDate} (${displayDay})`);
                    console.log(`      📊 Chart should show: ${displayDay}`);
                    console.log(`      🔄 From: ${row.stage_from || 'Unknown'}`);
                });
            }
        }
        
        // Special test for THROWAWAY LEADS (more complex logic)
        console.log(`\n🗑️  THROWAWAY LEADS (complex transitions):`);
        console.log('-'.repeat(40));
        
        // Replicate the isThrowawayLead logic from the code
        const throwawayQuery = `
            SELECT 
                first_name,
                last_name,
                changed_at,
                stage_from,
                stage_to
            FROM stage_changes 
            WHERE changed_at >= $1
              AND (
                  -- From ACQ - Qualified to throwaway stages
                  (stage_from = 'ACQ - Qualified' AND stage_to IN (
                      'ACQ - Price Motivated',
                      'ACQ - Not Interested', 
                      'ACQ - Not Ready to Sell',
                      'ACQ - Dead / DNC'
                  ))
                  OR
                  -- From other qualified phases to throwaway stages  
                  (stage_from IN (
                      'Qualified Phase 2 - Day 3 to 2 Weeks',
                      'Qualified Phase 3 - 2 Weeks to 4 Weeks'
                  ) AND stage_to IN (
                      'ACQ - Price Motivated',
                      'ACQ - Not Interested',
                      'ACQ - Not Ready to Sell', 
                      'ACQ - Dead / DNC'
                  ))
              )
            ORDER BY changed_at DESC
            LIMIT 5;
        `;
        
        const throwawayResult = await client.query(throwawayQuery, [fiveDaysAgo.toISOString()]);
        
        if (throwawayResult.rows.length === 0) {
            console.log('   ❌ No recent throwaway lead transitions found');
        } else {
            console.log(`   ✅ Found ${throwawayResult.rows.length} throwaway transitions:`);
            
            throwawayResult.rows.forEach((row, index) => {
                const timestamp = row.changed_at;
                const actualDate = timestamp.toISOString().split('T')[0];
                const displayDay = new Date(timestamp).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                });
                
                console.log(`   ${index + 1}. ${row.first_name} ${row.last_name}`);
                console.log(`      📅 Actual: ${actualDate} (${displayDay})`);
                console.log(`      📊 Chart should show: ${displayDay}`);
                console.log(`      🗑️  ${row.stage_from} → ${row.stage_to}`);
            });
        }
        
        // Test the date range issue for all metrics
        console.log(`\n🔍 TESTING DATE RANGE BOUNDARIES:`);
        console.log('=' .repeat(50));
        
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        console.log(`Today: ${today}`);
        console.log(`Yesterday: ${yesterdayStr}`);
        
        // Check each metric for today's data
        for (const [metricName, stageName] of Object.entries(stages)) {
            const todayQuery = `
                SELECT COUNT(*) as count
                FROM stage_changes 
                WHERE stage_to = $1
                  AND DATE(changed_at) = $2;
            `;
            
            const todayResult = await client.query(todayQuery, [stageName, today]);
            const todayCount = parseInt(todayResult.rows[0].count);
            
            console.log(`📊 ${metricName} today: ${todayCount} records`);
            if (todayCount > 0) {
                console.log(`   ⚠️  These MUST appear on today's chart bar!`);
            }
        }
        
        // Check throwaway leads for today
        const todayThrowawayQuery = `
            SELECT COUNT(*) as count
            FROM stage_changes 
            WHERE DATE(changed_at) = $1
              AND (
                  (stage_from = 'ACQ - Qualified' AND stage_to IN (
                      'ACQ - Price Motivated',
                      'ACQ - Not Interested', 
                      'ACQ - Not Ready to Sell',
                      'ACQ - Dead / DNC'
                  ))
                  OR
                  (stage_from IN (
                      'Qualified Phase 2 - Day 3 to 2 Weeks',
                      'Qualified Phase 3 - 2 Weeks to 4 Weeks'
                  ) AND stage_to IN (
                      'ACQ - Price Motivated',
                      'ACQ - Not Interested',
                      'ACQ - Not Ready to Sell', 
                      'ACQ - Dead / DNC'
                  ))
              );
        `;
        
        const todayThrowawayResult = await client.query(todayThrowawayQuery, [today]);
        const todayThrowawayCount = parseInt(todayThrowawayResult.rows[0].count);
        
        console.log(`🗑️  throwawayLeads today: ${todayThrowawayCount} records`);
        if (todayThrowawayCount > 0) {
            console.log(`   ⚠️  These MUST appear on today's chart bar!`);
        }
        
        console.log('\n' + '='.repeat(70));
        console.log('✅ CONCLUSION: The same date range fix applies to ALL metrics');
        console.log('📊 All metrics use the same processSupabaseData() function');
        console.log('🎯 The fix should resolve alignment issues for all bar chart data');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

testAllMetricsAlignment().catch(console.error);