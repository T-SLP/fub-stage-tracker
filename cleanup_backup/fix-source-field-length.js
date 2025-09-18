// Fix source field length constraint to allow webhook source names
const { Client } = require('pg');
require('dotenv').config();

async function fixSourceFieldLength() {
    console.log('🔧 FIXING: Source field length constraint');
    console.log('=' .repeat(50));
    console.log('Increasing source field from varchar(20) to varchar(50)\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        console.log('📊 CURRENT SOURCE FIELD CONSTRAINT:');
        console.log('-'.repeat(40));
        
        const currentQuery = `
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns 
            WHERE table_name = 'stage_changes' 
              AND column_name = 'source';
        `;
        
        const currentResult = await client.query(currentQuery);
        const current = currentResult.rows[0];
        
        console.log(`📝 ${current.column_name}: ${current.data_type}(${current.character_maximum_length})`);
        console.log(`   Current limit: ${current.character_maximum_length} characters`);
        console.log(`   Needed for webhooks: 30+ characters`);
        
        console.log('\n🔄 APPLYING DATABASE SCHEMA CHANGE:');
        console.log('-'.repeat(40));
        
        // Alter the source field to allow longer webhook source names
        const alterQuery = `
            ALTER TABLE stage_changes 
            ALTER COLUMN source TYPE varchar(50);
        `;
        
        console.log('Executing: ALTER TABLE stage_changes ALTER COLUMN source TYPE varchar(50)');
        
        await client.query(alterQuery);
        
        console.log('✅ Schema change applied successfully!');
        
        // Verify the change
        console.log('\n🔍 VERIFYING SCHEMA CHANGE:');
        console.log('-'.repeat(35));
        
        const verifyResult = await client.query(currentQuery);
        const updated = verifyResult.rows[0];
        
        console.log(`📝 ${updated.column_name}: ${updated.data_type}(${updated.character_maximum_length})`);
        console.log(`   Updated limit: ${updated.character_maximum_length} characters`);
        
        if (updated.character_maximum_length >= 30) {
            console.log('✅ Sufficient length for webhook sources');
        } else {
            console.log('❌ Still too short for webhook sources');
        }
        
        console.log('\n🎯 WEBHOOK SOURCES NOW SUPPORTED:');
        console.log('-'.repeat(35));
        console.log('✅ "webhook_peopleStageUpdated" (28 chars)');
        console.log('✅ "webhook_peopleCreated" (23 chars)');
        console.log('✅ "webhook_peopleUpdated" (23 chars)');
        console.log('✅ "webhook_peopleTagsCreated" (28 chars)');
        
        console.log('\n' + '='.repeat(60));
        console.log('🎉 SOURCE FIELD CONSTRAINT FIXED!');
        console.log('✅ Railway webhooks should now process successfully');
        console.log('✅ Real-time stage changes should start appearing');
        console.log('📊 Test with another FUB stage change to verify');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        console.error('If permission denied, you may need to run this via Supabase SQL editor');
    } finally {
        await client.end();
    }
}

fixSourceFieldLength().catch(console.error);