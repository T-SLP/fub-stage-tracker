// Diagnose the varchar(20) constraint error from Railway logs
const { Client } = require('pg');
require('dotenv').config();

async function diagnoseVarcharError() {
    console.log('🔍 DIAGNOSING: varchar(20) constraint error from Railway');
    console.log('=' .repeat(60));
    console.log('Finding which field has 20-character limit causing webhook failures\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Get schema info for stage_changes table, focusing on varchar fields
        console.log('📊 STAGE_CHANGES TABLE SCHEMA - VARCHAR FIELDS:');
        console.log('-'.repeat(55));
        
        const schemaQuery = `
            SELECT 
                column_name, 
                data_type, 
                character_maximum_length,
                is_nullable,
                column_default
            FROM information_schema.columns 
            WHERE table_name = 'stage_changes'
              AND data_type IN ('character varying', 'varchar', 'text')
            ORDER BY character_maximum_length ASC NULLS LAST;
        `;
        
        const schemaResult = await client.query(schemaQuery);
        
        schemaResult.rows.forEach(row => {
            const length = row.character_maximum_length;
            const lengthStr = length ? `(${length})` : '(unlimited)';
            
            console.log(`📝 ${row.column_name}: ${row.data_type}${lengthStr}`);
            console.log(`   Nullable: ${row.is_nullable}, Default: ${row.column_default || 'None'}`);
            
            if (length === 20) {
                console.log(`   🚨 THIS IS THE 20-CHARACTER LIMIT FIELD!`);
            }
            console.log('');
        });
        
        // Check what values are being inserted that might be too long
        console.log('🔍 ANALYZING FAILED NAMES FROM LOGS:');
        console.log('-'.repeat(40));
        
        const failedNames = [
            'James Brown',
            'Shalandra Robertsonn', 
            'Barbara Trombatore',
            'Ruth Ford',
            'Matthew Nicholos',
            'Caroline Elie',
            'Deanna Muse'
        ];
        
        console.log('Failed webhook names from Railway logs:');
        failedNames.forEach((name, index) => {
            const [firstName, lastName] = name.split(' ');
            console.log(`${index + 1}. ${name}:`);
            console.log(`   First name: "${firstName}" (${firstName.length} chars)`);
            console.log(`   Last name: "${lastName}" (${lastName ? lastName.length : 0} chars)`);
            
            if (firstName && firstName.length > 20) {
                console.log(`   🚨 FIRST NAME TOO LONG: ${firstName.length} chars > 20 limit`);
            }
            if (lastName && lastName.length > 20) {
                console.log(`   🚨 LAST NAME TOO LONG: ${lastName.length} chars > 20 limit`);
            }
        });
        
        // Check if source field is the issue
        console.log('\n🔍 CHECKING SOURCE FIELD LENGTHS:');
        console.log('-'.repeat(35));
        
        const sourceQuery = `
            SELECT DISTINCT 
                source,
                LENGTH(source) as source_length
            FROM stage_changes 
            WHERE source IS NOT NULL
            ORDER BY source_length DESC;
        `;
        
        const sourceResult = await client.query(sourceQuery);
        
        console.log('Current source field values and lengths:');
        sourceResult.rows.forEach(row => {
            console.log(`📡 "${row.source}" (${row.source_length} chars)`);
            if (row.source_length > 20) {
                console.log(`   🚨 TOO LONG: ${row.source_length} chars > 20 limit`);
            }
        });
        
        // Check if Railway is trying to insert a source longer than 20 chars
        console.log('\n💡 LIKELY CAUSE ANALYSIS:');
        console.log('-'.repeat(30));
        
        console.log('Railway webhook server is likely trying to insert:');
        console.log('- Source field like "webhook_peopleStageUpdated" (28 chars)');
        console.log('- But database source field is limited to varchar(20)');
        console.log('- This causes ALL webhook processing to fail');
        console.log('');
        
        console.log('🔧 SOLUTION NEEDED:');
        console.log('1. Increase source field length to accommodate webhook sources');
        console.log('2. OR modify Railway code to truncate source field values');
        console.log('3. Current webhook sources would be like:');
        console.log('   - "webhook_peopleStageUpdated" (28 chars) ❌');
        console.log('   - "webhook_peopleCreated" (23 chars) ❌');
        console.log('   - "webhook_peopleUpdated" (23 chars) ❌');
        console.log('   - All need more than 20 characters');
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

diagnoseVarcharError().catch(console.error);