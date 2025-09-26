// Simple fix for missing event_id unique constraint
const { Client } = require('pg');
require('dotenv').config();

async function addEventIdConstraint() {
    console.log('🔧 Adding event_id unique constraint for ON CONFLICT support');
    console.log('=' .repeat(60));
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        console.log('1️⃣ Checking for duplicate event_ids...');
        
        // Check for duplicates
        const duplicateQuery = `
            SELECT event_id, COUNT(*) as count
            FROM stage_changes 
            WHERE event_id IS NOT NULL
            GROUP BY event_id
            HAVING COUNT(*) > 1
            LIMIT 5;
        `;
        
        const duplicates = await client.query(duplicateQuery);
        
        if (duplicates.rows.length > 0) {
            console.log(`⚠️  Found ${duplicates.rows.length} duplicate event_ids`);
            console.log('🧹 Cleaning up duplicates...');
            
            // Remove duplicates, keep only the earliest record
            const cleanupQuery = `
                DELETE FROM stage_changes 
                WHERE id NOT IN (
                    SELECT DISTINCT ON (event_id) id
                    FROM stage_changes 
                    WHERE event_id IS NOT NULL
                    ORDER BY event_id, received_at ASC
                );
            `;
            
            const cleanupResult = await client.query(cleanupQuery);
            console.log(`✅ Removed ${cleanupResult.rowCount} duplicate records`);
        } else {
            console.log('✅ No duplicates found');
        }
        
        console.log('\n2️⃣ Adding unique constraint...');
        
        // Add unique constraint
        const constraintQuery = `
            ALTER TABLE stage_changes 
            ADD CONSTRAINT IF NOT EXISTS stage_changes_event_id_unique 
            UNIQUE (event_id);
        `;
        
        await client.query(constraintQuery);
        console.log('✅ event_id unique constraint added');
        
        console.log('\n3️⃣ Testing constraint...');
        
        // Test the constraint works
        const testQuery = `
            INSERT INTO stage_changes (
                person_id, first_name, last_name, stage_from, stage_to,
                changed_at, received_at, source, event_id
            ) VALUES (
                'test_constraint', 'Test', 'User', 'From', 'To',
                NOW(), NOW(), 'test', 'test_constraint_123'
            )
            ON CONFLICT (event_id) DO NOTHING
            RETURNING id;
        `;
        
        const testResult = await client.query(testQuery);
        
        if (testResult.rows.length > 0) {
            console.log('✅ ON CONFLICT clause working - test record created');
            
            // Clean up test record
            await client.query('DELETE FROM stage_changes WHERE event_id = $1', ['test_constraint_123']);
            console.log('🧹 Test record cleaned up');
        } else {
            console.log('⚠️  ON CONFLICT clause may not be working as expected');
        }
        
        console.log('\n🎉 CONSTRAINT FIX COMPLETE!');
        console.log('Railway webhook server should now save stage changes successfully');
        console.log('\n💡 TEST: Make another stage change with Todd Brumm now');
        
        await client.end();
        
    } catch (error) {
        console.error(`❌ ERROR: ${error.message}`);
        await client.end();
    }
}

addEventIdConstraint().catch(console.error);