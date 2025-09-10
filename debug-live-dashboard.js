// Debug why the live dashboard still shows incorrect dates
const { Client } = require('pg');
require('dotenv').config();

// Replicate the exact ET functions from our updated code
const toEasternTime = (date) => {
  return new Date(date.toLocaleString("en-US", {timeZone: "America/New_York"}));
};

const formatEasternDate = (date) => {
  const easternDate = toEasternTime(new Date(date));
  return `${easternDate.getFullYear()}-${String(easternDate.getMonth() + 1).padStart(2, '0')}-${String(easternDate.getDate()).padStart(2, '0')}`;
};

async function debugLiveDashboard() {
    console.log('🔍 DEBUG: Live dashboard date plotting issue\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        // Check what the dashboard should be showing for the date range
        console.log('📊 ANALYZING CURRENT DASHBOARD RANGE (Sept 7-10):');
        console.log('=' .repeat(60));
        
        // Get all stage changes for the visible date range
        const rangeQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                changed_at,
                DATE(changed_at) as db_date
            FROM stage_changes 
            WHERE changed_at >= '2025-09-07'
              AND changed_at <= '2025-09-10 23:59:59'
              AND stage_to IN ('ACQ - Qualified', 'ACQ - Offers Made', 'ACQ - Price Motivated')
            ORDER BY changed_at DESC;
        `;
        
        const rangeResult = await client.query(rangeQuery);
        
        // Group by stage and date
        const stagesByDate = {};
        
        rangeResult.rows.forEach(row => {
            const dbTimestamp = row.changed_at;
            const stage = row.stage_to;
            
            // Use our ET processing
            const etDate = formatEasternDate(dbTimestamp);
            
            if (!stagesByDate[etDate]) {
                stagesByDate[etDate] = {
                    qualified: 0,
                    offers: 0,
                    priceMotivated: 0
                };
            }
            
            if (stage === 'ACQ - Qualified') {
                stagesByDate[etDate].qualified++;
            } else if (stage === 'ACQ - Offers Made') {
                stagesByDate[etDate].offers++;
            } else if (stage === 'ACQ - Price Motivated') {
                stagesByDate[etDate].priceMotivated++;
            }
            
            console.log(`${row.first_name} ${row.last_name}: ${stage}`);
            console.log(`  DB timestamp: ${dbTimestamp}`);
            console.log(`  ET date: ${etDate}`);
            console.log(`  Should appear on: ${new Date(etDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`);
            console.log('');
        });
        
        console.log('📈 EXPECTED CHART DATA:');
        console.log('=' .repeat(40));
        
        // Show what the chart should display
        const expectedDays = ['2025-09-07', '2025-09-08', '2025-09-09', '2025-09-10'];
        expectedDays.forEach(date => {
            const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
            });
            const data = stagesByDate[date] || { qualified: 0, offers: 0, priceMotivated: 0 };
            
            console.log(`${dayName}:`);
            console.log(`  📘 Qualified: ${data.qualified}`);
            console.log(`  📗 Offers: ${data.offers}`);
            console.log(`  📙 Price Motivated: ${data.priceMotivated}`);
        });
        
        console.log('\n🚨 POSSIBLE ISSUES:');
        console.log('=' .repeat(30));
        console.log('1. Browser cache - Force refresh (Ctrl+F5)');
        console.log('2. Vercel deployment not complete - Check deployment status');
        console.log('3. Old code still running - May need a few minutes to deploy');
        console.log('4. Database connection using different timezone setting');
        
        // Test specific offers we know about
        console.log('\n🎯 SPECIFIC OFFERS CHECK:');
        console.log('=' .repeat(35));
        
        const offersQuery = `
            SELECT 
                first_name,
                last_name,
                changed_at,
                EXTRACT(HOUR FROM changed_at) as hour
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
              AND changed_at >= '2025-09-05'
            ORDER BY changed_at DESC
            LIMIT 5;
        `;
        
        const offersResult = await client.query(offersQuery);
        
        offersResult.rows.forEach((row, index) => {
            const dbTimestamp = row.changed_at;
            const etDate = formatEasternDate(dbTimestamp);
            const etDay = new Date(etDate + 'T12:00:00').toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
            });
            
            console.log(`${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   Time: ${dbTimestamp.toLocaleString()} (hour: ${row.hour})`);
            console.log(`   Should show on chart: ${etDay}`);
        });
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

debugLiveDashboard().catch(console.error);