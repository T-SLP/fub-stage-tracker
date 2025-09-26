// Fix missing event_id unique constraint for ON CONFLICT clause
const { Client } = require('pg');
require('dotenv').config();

async function fixEventIdConstraint() {
    console.log('🔧 FIXING: Missing event_id unique constraint');
    console.log('=' .repeat(45));
    console.log('Adding unique constraint to support ON CONFLICT clause\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Step 1: Check current constraints
        console.log('🔍 CHECKING CURRENT CONSTRAINTS:');
        console.log('-'.repeat(35));
        
        const constraintQuery = `
            SELECT 
                conname as constraint_name,
                contype as constraint_type,
                ARRAY(
                    SELECT attname 
                    FROM pg_attribute 
                    WHERE attrelid = conrelid 
                    AND attnum = ANY(conkey)
                    ORDER BY attnum
                ) as columns
            FROM pg_constraint 
            WHERE conrelid = (
                SELECT oid FROM pg_class WHERE relname = 'stage_changes'
            )
            AND contype IN ('u', 'p')  -- unique and primary key constraints
            ORDER BY conname;
        `;
        
        const constraintResult = await client.query(constraintQuery);
        
        console.log('Current unique/primary constraints:');
        if (constraintResult.rows.length === 0) {
            console.log('  (none found)');
        } else {
            constraintResult.rows.forEach(row => {
                const type = row.constraint_type === 'p' ? 'PRIMARY KEY' : 'UNIQUE';
                console.log(`  ${row.constraint_name}: ${type} (${row.columns.join(', ')})`);
            });
        }
        
        // Check if event_id constraint exists
        const hasEventIdConstraint = constraintResult.rows.some(row => 
            row.columns.includes('event_id')
        );
        
        console.log(`\n🎯 event_id constraint: ${hasEventIdConstraint ? 'EXISTS ✅' : 'MISSING ❌'}`);
        console.log('');
        
        // Step 2: Check for duplicate event_ids before adding constraint
        console.log('🔍 CHECKING FOR DUPLICATE EVENT_IDS:');
        console.log('-'.repeat(37));
        
        const duplicateQuery = `
            SELECT 
                event_id,
                COUNT(*) as count
            FROM stage_changes 
            WHERE event_id IS NOT NULL
            GROUP BY event_id
            HAVING COUNT(*) > 1
            ORDER BY count DESC
            LIMIT 10;
        `;
        
        const duplicateResult = await client.query(duplicateQuery);
        
        if (duplicateResult.rows.length > 0) {
            console.log(`⚠️  Found ${duplicateResult.rows.length} duplicate event_ids:`);
            duplicateResult.rows.forEach(row => {
                console.log(`  "${row.event_id}": ${row.count} records`);
            });
            console.log('\n🧹 Cleaning up duplicates before adding constraint...');
            
            // Clean up duplicates by keeping only the first occurrence
            for (const row of duplicateResult.rows) {
                const cleanupQuery = `
                    DELETE FROM stage_changes 
                    WHERE id NOT IN (
                        SELECT MIN(id) 
                        FROM stage_changes 
                        WHERE event_id = $1
                        GROUP BY event_id
                    ) 
                    AND event_id = $1;
                `;
                
                const deleteResult = await client.query(cleanupQuery, [row.event_id]);
                console.log(`  Cleaned "${row.event_id}": removed ${deleteResult.rowCount} duplicates`);
            }
        } else {
            console.log('✅ No duplicate event_ids found');
        }
        console.log('');
        
        // Step 3: Add unique constraint if missing
        if (!hasEventIdConstraint) {
            console.log('⚡ ADDING UNIQUE CONSTRAINT:');
            console.log('-'.repeat(30));
            
            try {
                const addConstraintQuery = `
                    ALTER TABLE stage_changes 
                    ADD CONSTRAINT stage_changes_event_id_unique 
                    UNIQUE (event_id);
                `;
                
                await client.query(addConstraintQuery);
                console.log('✅ event_id unique constraint added successfully');
                
            } catch (error) {
                console.log('❌ Failed to add unique constraint');
                console.log(`   Error: ${error.message}`);
                
                if (error.message.includes('could not create unique index')) {
                    console.log('\n💡 This usually means there are still duplicate event_ids');
                    console.log('   Manual cleanup may be required');
                }
            }
        } else {
            console.log('✅ event_id constraint already exists');
        }
        
        console.log('');
        
        // Step 4: Verify fix
        console.log('✅ VERIFICATION:');
        console.log('-'.repeat(15));
        
        const verifyResult = await client.query(constraintQuery);
        const nowHasConstraint = verifyResult.rows.some(row => 
            row.columns.includes('event_id')
        );
        
        console.log(`event_id unique constraint: ${nowHasConstraint ? 'EXISTS ✅' : 'STILL MISSING ❌'}`);
        
        if (nowHasConstraint) {
            console.log('\n🎉 CONSTRAINT FIX COMPLETE!');
            console.log('Railway webhook server ON CONFLICT clause will now work');
            console.log('\n💡 TEST: Try making another stage change with Todd Brumm');
        } else {
            console.log('\n⚠️  Constraint still missing - manual intervention may be needed');
        }
        
        await client.end();
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        await client.end();
    }
}

fixEventIdConstraint().catch(console.error);