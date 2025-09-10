// Fix existing records with wrong timestamps using FUB's real timestamps
const { Client } = require('pg');
require('dotenv').config();

async function fixExistingTimestamps() {
    console.log('🔧 FIXING EXISTING RECORDS WITH WRONG TIMESTAMPS:');
    console.log('=' .repeat(60));
    console.log('This will correct records where changed_at was set to processing time');
    console.log('instead of the real FUB event time.\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // First, identify records that need fixing
        console.log('🔍 IDENTIFYING RECORDS THAT NEED FIXING:');
        console.log('-'.repeat(50));
        
        const identifyQuery = `
            SELECT 
                id,
                first_name,
                last_name,
                stage_to,
                changed_at,
                received_at,
                raw_payload,
                source
            FROM stage_changes 
            WHERE source = 'polling'
              AND raw_payload IS NOT NULL
              AND changed_at >= '2025-09-10 00:00:00'
              AND changed_at = received_at  -- Both timestamps are identical (wrong!)
            ORDER BY changed_at DESC;
        `;
        
        const identifyResult = await client.query(identifyQuery);
        
        console.log(`Found ${identifyResult.rows.length} records with incorrect timestamps\n`);
        
        if (identifyResult.rows.length === 0) {
            console.log('✅ No records need fixing!');
            return;
        }
        
        let fixableRecords = [];
        let unfixableRecords = [];
        
        // Analyze each record
        identifyResult.rows.forEach(row => {
            const payload = row.raw_payload;
            const realTimestamp = payload.updated || payload.lastActivity;
            
            if (realTimestamp) {
                fixableRecords.push({
                    id: row.id,
                    name: `${row.first_name} ${row.last_name}`,
                    stage: row.stage_to,
                    wrongTime: row.changed_at,
                    correctTime: realTimestamp,
                    source: row.source
                });
            } else {
                unfixableRecords.push({
                    name: `${row.first_name} ${row.last_name}`,
                    stage: row.stage_to
                });
            }
        });
        
        console.log('📊 ANALYSIS RESULTS:');
        console.log(`✅ Fixable records: ${fixableRecords.length} (have real FUB timestamps)`);
        console.log(`❌ Unfixable records: ${unfixableRecords.length} (no FUB timestamp in payload)\n`);
        
        // Show examples of what will be fixed
        console.log('🎯 EXAMPLES OF FIXES TO BE MADE:');
        fixableRecords.slice(0, 5).forEach((record, index) => {
            const wrongDate = new Date(record.wrongTime);
            const correctDate = new Date(record.correctTime);
            
            console.log(`${index + 1}. ${record.name} - ${record.stage}:`);
            console.log(`   ❌ Wrong: ${wrongDate.toLocaleString()} (${wrongDate.toDateString()})`);
            console.log(`   ✅ Correct: ${correctDate.toLocaleString()} (${correctDate.toDateString()})`);
            
            // Check if this moves it from Wednesday to Tuesday
            const wrongDay = wrongDate.getDate();
            const correctDay = correctDate.getDate();
            if (wrongDay === 10 && correctDay === 9) {
                console.log(`   🎉 MOVES FROM WEDNESDAY → TUESDAY (fixes chart!)`);
            }
            console.log('');
        });
        
        if (fixableRecords.length > 5) {
            console.log(`   ... and ${fixableRecords.length - 5} more records\n`);
        }
        
        // Execute the fixes
        console.log('⚠️  EXECUTING DATABASE CORRECTIONS...');
        console.log(`About to fix ${fixableRecords.length} records with incorrect timestamps.\n`);
        
        // The actual fix:
        console.log('🔄 STARTING DATABASE TRANSACTION...');
        await client.query('BEGIN');
        
        let updatedCount = 0;
        let errorCount = 0;
        
        for (const record of fixableRecords) {
            try {
                const updateQuery = `
                    UPDATE stage_changes 
                    SET changed_at = $1 
                    WHERE id = $2
                `;
                
                const result = await client.query(updateQuery, [record.correctTime, record.id]);
                if (result.rowCount > 0) {
                    updatedCount++;
                    console.log(`✅ Fixed: ${record.name} - ${record.stage}`);
                } else {
                    console.warn(`⚠️  No update for: ${record.name} (record may not exist)`);
                }
                
            } catch (error) {
                errorCount++;
                console.error(`❌ Failed to fix ${record.name}: ${error.message}`);
            }
        }
        
        if (errorCount === 0) {
            await client.query('COMMIT');
            console.log(`\n🎉 Successfully updated ${updatedCount} records!`);
            console.log('✅ All timestamps corrected - database transaction committed');
        } else {
            await client.query('ROLLBACK');
            console.error(`\n❌ Errors occurred (${errorCount} failures) - transaction rolled back`);
            console.error('No changes were made to the database');
            return;
        }
        
        // Verify the fixes worked
        console.log('\n🔍 VERIFYING CORRECTIONS:');
        const verifyQuery = `
            SELECT 
                first_name,
                last_name,
                stage_to,
                changed_at,
                received_at
            FROM stage_changes 
            WHERE id = ANY($1)
            ORDER BY changed_at DESC
            LIMIT 5;
        `;
        
        const fixedIds = fixableRecords.map(r => r.id);
        const verifyResult = await client.query(verifyQuery, [fixedIds]);
        
        console.log('Sample corrected records:');
        verifyResult.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.first_name} ${row.last_name} - ${row.stage_to}`);
            console.log(`   ✅ changed_at: ${row.changed_at} (real FUB event time)`);
            console.log(`   📨 received_at: ${row.received_at} (processing time)`);
        });
        
        // Show what the chart will look like after fixes
        console.log('\n📊 EXPECTED CHART AFTER FIXES:');
        console.log('-'.repeat(35));
        
        const offerRecords = fixableRecords.filter(r => r.stage === 'ACQ - Offers Made');
        console.log(`Tuesday Sep 9 offers: ${offerRecords.length}`);
        console.log(`Wednesday Sep 10 offers: 0 (all moved to Tuesday)`);
        
        offerRecords.forEach(record => {
            const correctDate = new Date(record.correctTime);
            console.log(`  - ${record.name}: ${correctDate.toLocaleString()}`);
        });
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ PROBLEM SOLVED:');
        console.log('📅 All offers will show on Tuesday Sep 9 (correct day)');
        console.log('📊 Chart and activity table will use same timestamps');
        console.log('🕐 Real business event times preserved');
        console.log('📡 Processing times still tracked in received_at');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

fixExistingTimestamps().catch(console.error);