// Examine database schema to understand current timestamp fields
const { Client } = require('pg');
require('dotenv').config();

async function examineSchema() {
    console.log('🔍 EXAMINING stage_changes TABLE SCHEMA:');
    console.log('=' .repeat(50));
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // Get table schema
        const schemaQuery = `
            SELECT 
                column_name, 
                data_type, 
                is_nullable, 
                column_default,
                character_maximum_length
            FROM information_schema.columns 
            WHERE table_name = 'stage_changes'
            ORDER BY ordinal_position;
        `;
        
        const schemaResult = await client.query(schemaQuery);
        
        console.log('📝 TABLE COLUMNS:');
        schemaResult.rows.forEach(row => {
            console.log(`   ${row.column_name}: ${row.data_type}${row.character_maximum_length ? '(' + row.character_maximum_length + ')' : ''}`);
            console.log(`      Nullable: ${row.is_nullable}, Default: ${row.column_default || 'None'}`);
        });
        
        console.log('\n🕐 TIMESTAMP ANALYSIS - Sample Records:');
        console.log('-'.repeat(50));
        
        // Get sample records to see all timestamp-related fields
        const sampleQuery = `
            SELECT *
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
            ORDER BY changed_at DESC
            LIMIT 3;
        `;
        
        const sampleResult = await client.query(sampleQuery);
        
        if (sampleResult.rows.length > 0) {
            console.log('First record structure:');
            const firstRecord = sampleResult.rows[0];
            Object.keys(firstRecord).forEach(key => {
                const value = firstRecord[key];
                const type = typeof value;
                if (key.toLowerCase().includes('at') || key.toLowerCase().includes('time') || key.toLowerCase().includes('date') || value instanceof Date) {
                    console.log(`⏰ ${key}: ${type} = ${value}`);
                } else {
                    console.log(`   ${key}: ${type} = ${value}`);
                }
            });
        }
        
        console.log('\n🔍 CHECKING FOR WEBHOOK/POLLING UPDATE MECHANISM:');
        console.log('-'.repeat(55));
        
        // Check for any webhook or update tracking
        const updateQuery = `
            SELECT 
                source,
                COUNT(*) as count,
                MIN(changed_at) as earliest,
                MAX(changed_at) as latest
            FROM stage_changes 
            WHERE changed_at >= '2025-09-08'
            GROUP BY source
            ORDER BY count DESC;
        `;
        
        const updateResult = await client.query(updateQuery);
        
        console.log('📊 RECENT RECORDS BY SOURCE:');
        updateResult.rows.forEach(row => {
            console.log(`📡 ${row.source || 'NULL'}: ${row.count} records`);
            console.log(`   Earliest: ${row.earliest}`);
            console.log(`   Latest: ${row.latest}`);
        });
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await client.end();
    }
}

examineSchema().catch(console.error);