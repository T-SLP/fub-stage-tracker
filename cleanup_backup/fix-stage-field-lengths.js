// Fix database field lengths for long stage names
const { Client } = require('pg');
require('dotenv').config();

async function fixStageFieldLengths() {
    console.log('🔧 FIXING: Database field lengths for stage names');
    console.log('=' .repeat(50));
    console.log('Expanding varchar(20) fields to accommodate long FUB stage names\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Step 1: Check current schema
        console.log('📋 CURRENT SCHEMA CHECK:');
        console.log('-'.repeat(25));
        
        const schemaQuery = `
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_name = 'stage_changes'
            AND column_name IN ('stage_from', 'stage_to', 'source')
            ORDER BY column_name;
        `;
        
        const schemaResult = await client.query(schemaQuery);
        
        console.log('Current field lengths:');
        schemaResult.rows.forEach(row => {
            console.log(`  ${row.column_name}: ${row.data_type}(${row.character_maximum_length || 'unlimited'})`);
        });
        console.log('');
        
        // Step 2: Check problematic data
        console.log('🔍 PROBLEMATIC DATA CHECK:');
        console.log('-'.repeat(30));
        
        const longStagesQuery = `
            SELECT DISTINCT 
                stage_from,
                LENGTH(stage_from) as from_length,
                stage_to,
                LENGTH(stage_to) as to_length
            FROM stage_changes 
            WHERE LENGTH(stage_from) > 20 
               OR LENGTH(stage_to) > 20
            ORDER BY from_length DESC, to_length DESC
            LIMIT 10;
        `;
        
        const longStagesResult = await client.query(longStagesQuery);
        
        if (longStagesResult.rows.length > 0) {
            console.log('Found long stage names that would cause errors:');
            longStagesResult.rows.forEach(row => {
                if (row.from_length > 20) {
                    console.log(`  FROM: "${row.stage_from}" (${row.from_length} chars) ❌`);
                }
                if (row.to_length > 20) {
                    console.log(`  TO: "${row.stage_to}" (${row.to_length} chars) ❌`);
                }
            });
        } else {
            console.log('No existing long stage names found');
        }
        console.log('');
        
        // Step 3: Apply fixes
        console.log('⚡ APPLYING FIXES:');
        console.log('-'.repeat(20));
        
        const fixes = [
            {
                field: 'stage_from',
                query: 'ALTER TABLE stage_changes ALTER COLUMN stage_from TYPE VARCHAR(100);'
            },
            {
                field: 'stage_to', 
                query: 'ALTER TABLE stage_changes ALTER COLUMN stage_to TYPE VARCHAR(100);'
            },
            {
                field: 'source',
                query: 'ALTER TABLE stage_changes ALTER COLUMN source TYPE VARCHAR(50);'
            }
        ];
        
        for (const fix of fixes) {
            try {
                await client.query(fix.query);
                console.log(`✅ ${fix.field}: Expanded to accommodate long names`);
            } catch (error) {
                console.log(`❌ ${fix.field}: ${error.message}`);
            }
        }
        console.log('');
        
        // Step 4: Verify fixes
        console.log('✅ VERIFICATION:');
        console.log('-'.repeat(15));
        
        const verifyResult = await client.query(schemaQuery);
        
        console.log('Updated field lengths:');
        verifyResult.rows.forEach(row => {
            const length = row.character_maximum_length || 'unlimited';
            const status = (row.column_name === 'source' && length >= 50) || 
                          (row.column_name.includes('stage') && length >= 100) ? '✅' : '❌';
            console.log(`  ${row.column_name}: ${row.data_type}(${length}) ${status}`);
        });
        
        console.log('\n🎉 FIELD LENGTH FIXES COMPLETE!');
        console.log('Todd Brumm\'s stage changes should now save successfully');
        console.log('\n💡 TEST: Try moving Todd Brumm to a different stage now');
        
        await client.end();
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        await client.end();
    }
}

fixStageFieldLengths().catch(console.error);