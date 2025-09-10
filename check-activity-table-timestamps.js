// Check what timestamps are shown in the pipeline activity table
const { Client } = require('pg');
require('dotenv').config();

async function checkActivityTableTimestamps() {
    console.log('📋 CHECKING: Pipeline activity table timestamps for offers made\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        
        // Get the exact 3 ACQ - Offers Made records
        console.log('🎯 CHECKING THE 3 "ACQ - OFFERS MADE" RECORDS:');
        console.log('=' .repeat(60));
        
        const offersQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                stage_from,
                changed_at,
                source,
                campaign_id,
                lead_source_tag
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
            ORDER BY changed_at DESC
            LIMIT 3;
        `;
        
        const offersResult = await client.query(offersQuery);
        
        offersResult.rows.forEach((row, index) => {
            const dbTimestamp = row.changed_at;
            
            console.log(`${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   📅 Database timestamp: ${dbTimestamp}`);
            console.log(`   🕐 Raw time: ${dbTimestamp.toString()}`);
            
            // This is what the pipeline activity table shows (toLocaleString)
            const activityTableDisplay = new Date(row.changed_at).toLocaleString();
            console.log(`   📋 Activity table shows: ${activityTableDisplay}`);
            
            // Break down the time components
            const localDate = new Date(dbTimestamp);
            const year = localDate.getFullYear();
            const month = localDate.getMonth() + 1;
            const day = localDate.getDate();
            const hour = localDate.getHours();
            const minute = localDate.getMinutes();
            
            console.log(`   📆 Date parts: ${year}-${month.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`);
            console.log(`   🕐 Time parts: ${hour}:${minute.toString().padStart(2,'0')} (${hour > 12 ? hour-12 : hour}:${minute.toString().padStart(2,'0')} ${hour >= 12 ? 'PM' : 'AM'})`);
            
            // Check if this matches what you saw (9/9/2025 at 2pm or 8pm)
            if (month === 9 && day === 9 && year === 2025) {
                if (hour === 14) {
                    console.log(`   ✅ MATCHES: 9/9/2025 at 2 PM (${hour}:${minute})`);
                } else if (hour === 20) {
                    console.log(`   ✅ MATCHES: 9/9/2025 at 8 PM (${hour}:${minute})`);
                } else {
                    console.log(`   ⚠️  9/9/2025 but different time: ${hour}:${minute} (${hour > 12 ? hour-12 : hour}:${minute} ${hour >= 12 ? 'PM' : 'AM'})`);
                }
            } else {
                console.log(`   ❌ DIFFERENT DATE: Shows as ${month}/${day}/${year}`);
            }
            
            console.log(`   🏷️  Campaign: ${row.campaign_id || 'No Campaign'}`);
            console.log(`   📡 Source: ${row.source}`);
            console.log(`   🔄 From stage: ${row.stage_from}`);
            console.log('');
        });
        
        // Now check what date these SHOULD be plotted on the chart
        console.log('📊 CHART PLOTTING ANALYSIS:');
        console.log('=' .repeat(40));
        
        offersResult.rows.forEach((row, index) => {
            const dbTimestamp = row.changed_at;
            const localDate = new Date(dbTimestamp);
            
            // What date should this be plotted as?
            const chartDate = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
            const chartDay = localDate.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
            });
            
            console.log(`${index + 1}. ${row.first_name} ${row.last_name}:`);
            console.log(`   📊 Should plot on: ${chartDay} (${chartDate})`);
            
            if (chartDate === '2025-09-09') {
                console.log(`   ✅ CORRECT: Should show on Tuesday, Sep 9 bar`);
            } else {
                console.log(`   ❌ INCORRECT: Would show on wrong day`);
            }
        });
        
        console.log('\n' + '='.repeat(70));
        console.log('💡 KEY INSIGHT:');
        console.log('If activity table shows 9/9/2025 at 2pm or 8pm,');
        console.log('then chart should plot ALL offers on Tuesday Sep 9, not Wednesday Sep 10');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

checkActivityTableTimestamps().catch(console.error);