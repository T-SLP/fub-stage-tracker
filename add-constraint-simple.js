// Add event_id unique constraint
const { Client } = require('pg');
require('dotenv').config();

async function addConstraint() {
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        console.log('Adding unique constraint on event_id...');
        
        // Try to add the constraint
        try {
            await client.query(`
                ALTER TABLE stage_changes 
                ADD CONSTRAINT stage_changes_event_id_unique 
                UNIQUE (event_id);
            `);
            console.log('✅ Constraint added successfully');
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log('✅ Constraint already exists');
            } else {
                console.log(`❌ Error: ${error.message}`);
            }
        }
        
        // Test ON CONFLICT works
        console.log('\nTesting ON CONFLICT clause...');
        
        const testResult = await client.query(`
            INSERT INTO stage_changes (
                person_id, first_name, last_name, stage_from, stage_to,
                changed_at, received_at, source, event_id
            ) VALUES (
                'test_999', 'Test', 'User', 'From', 'To',
                NOW(), NOW(), 'test', 'test_unique_123'
            )
            ON CONFLICT (event_id) DO NOTHING
            RETURNING id;
        `);
        
        if (testResult.rows.length > 0) {
            console.log('✅ ON CONFLICT test successful');
            
            // Cleanup
            await client.query('DELETE FROM stage_changes WHERE event_id = $1', ['test_unique_123']);
        }
        
        console.log('\n🎉 Fix complete! Try Todd Brumm stage change now.');
        
        await client.end();
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        await client.end();
    }
}

addConstraint().catch(console.error);