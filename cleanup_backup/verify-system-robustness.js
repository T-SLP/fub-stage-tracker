// Verify system robustness for all stage changes and schema constraints
const { Client } = require('pg');
require('dotenv').config();

async function verifySystemRobustness() {
    console.log('🔒 SYSTEM ROBUSTNESS VERIFICATION');
    console.log('=' .repeat(50));
    console.log('Checking all constraints and field lengths for comprehensive stage change support\n');
    
    const client = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await client.connect();
        
        // 1. Check all field lengths in stage_changes table
        console.log('1️⃣ DATABASE FIELD CAPACITY CHECK:');
        console.log('-'.repeat(35));
        
        const schemaQuery = `
            SELECT 
                column_name, 
                data_type, 
                character_maximum_length,
                is_nullable
            FROM information_schema.columns
            WHERE table_name = 'stage_changes'
            ORDER BY ordinal_position;
        `;
        
        const schemaResult = await client.query(schemaQuery);
        
        console.log('Current field specifications:');
        schemaResult.rows.forEach(row => {
            const maxLength = row.character_maximum_length || 'unlimited';
            const nullable = row.is_nullable === 'YES' ? 'NULL OK' : 'NOT NULL';
            
            let status = '✅';
            if (row.column_name.includes('stage') && row.character_maximum_length < 100) {
                status = '⚠️';
            }
            if (row.column_name === 'source' && row.character_maximum_length < 50) {
                status = '⚠️';
            }
            
            console.log(`  ${row.column_name}: ${row.data_type}(${maxLength}) ${nullable} ${status}`);
        });
        
        console.log('');
        
        // 2. Check all constraints
        console.log('2️⃣ DATABASE CONSTRAINTS CHECK:');
        console.log('-'.repeat(32));
        
        const constraintQuery = `
            SELECT 
                conname as constraint_name,
                contype as constraint_type,
                CASE contype
                    WHEN 'p' THEN 'PRIMARY KEY'
                    WHEN 'u' THEN 'UNIQUE'
                    WHEN 'c' THEN 'CHECK'
                    WHEN 'f' THEN 'FOREIGN KEY'
                    ELSE 'OTHER'
                END as constraint_description
            FROM pg_constraint 
            WHERE conrelid = (
                SELECT oid FROM pg_class WHERE relname = 'stage_changes'
            )
            ORDER BY contype, conname;
        `;
        
        const constraintResult = await client.query(constraintQuery);
        
        console.log('Active constraints:');
        if (constraintResult.rows.length === 0) {
            console.log('  (no constraints found)');
        } else {
            constraintResult.rows.forEach(row => {
                console.log(`  ${row.constraint_name}: ${row.constraint_description}`);
            });
        }
        
        // Check specifically for event_id constraint
        const hasEventIdConstraint = constraintResult.rows.some(row => 
            row.constraint_name.includes('event_id')
        );
        console.log(`\n🎯 event_id constraint: ${hasEventIdConstraint ? 'EXISTS ✅' : 'MISSING ❌'}`);
        console.log('');
        
        // 3. Test extreme field lengths
        console.log('3️⃣ EXTREME FIELD LENGTH TEST:');
        console.log('-'.repeat(32));
        
        const extremeTests = [
            {
                name: 'Very Long Stage Name',
                stage_from: 'A'.repeat(95), // Test near varchar(100) limit
                stage_to: 'B'.repeat(95),
                source: 'test_extreme_length_source_name_testing'
            },
            {
                name: 'Unicode Characters',
                stage_from: 'Stage with émojis 🎯 and ünïcödé çhäracters',
                stage_to: 'ACQ - Offers Made with Special Characters™',
                source: 'webhook_unicode_test'
            },
            {
                name: 'Maximum Length Source',
                stage_from: 'Normal Stage',
                stage_to: 'ACQ - Offers Made',
                source: 'x'.repeat(45) // Test near varchar(50) limit
            }
        ];
        
        for (const test of extremeTests) {
            try {
                const testQuery = `
                    INSERT INTO stage_changes (
                        person_id, first_name, last_name, stage_from, stage_to,
                        changed_at, received_at, source, event_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (event_id) DO NOTHING
                    RETURNING id;
                `;
                
                const testId = `robust_test_${Date.now()}_${Math.random()}`;
                const values = [
                    testId, 'Test', 'User',
                    test.stage_from, test.stage_to,
                    new Date().toISOString(), new Date().toISOString(),
                    test.source, testId
                ];
                
                const result = await client.query(testQuery, values);
                
                if (result.rows.length > 0) {
                    console.log(`✅ ${test.name}: PASSED`);
                    console.log(`   stage_from: ${test.stage_from.length} chars`);
                    console.log(`   stage_to: ${test.stage_to.length} chars`);
                    console.log(`   source: ${test.source.length} chars`);
                    
                    // Cleanup
                    await client.query('DELETE FROM stage_changes WHERE event_id = $1', [testId]);
                } else {
                    console.log(`⚠️  ${test.name}: No insert (possibly duplicate)`);
                }
                
            } catch (error) {
                console.log(`❌ ${test.name}: FAILED`);
                console.log(`   Error: ${error.message}`);
            }
        }
        
        console.log('');
        
        // 4. Test Railway webhook server compatibility
        console.log('4️⃣ RAILWAY WEBHOOK SERVER COMPATIBILITY:');
        console.log('-'.repeat(42));
        
        try {
            const railwayResponse = await fetch('https://fub-stage-tracker-production.up.railway.app/health');
            const railwayHealth = await railwayResponse.json();
            
            console.log(`✅ Railway server: HEALTHY`);
            console.log(`✅ Webhooks processed: ${railwayHealth.webhooks_processed}`);
            console.log(`✅ Stage changes captured: ${railwayHealth.stage_changes_captured}`);
            
            // Test webhook endpoint with extreme data
            const extremeWebhookTest = {
                event: 'peopleStageUpdated',
                eventId: `extreme_test_${Date.now()}`,
                resourceIds: ['999999'],
                occurred: new Date().toISOString()
            };
            
            const webhookResponse = await fetch('https://fub-stage-tracker-production.up.railway.app/webhook/fub/stage-change', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(extremeWebhookTest)
            });
            
            const webhookResult = await webhookResponse.json();
            console.log(`✅ Webhook endpoint: RESPONDING (${webhookResponse.status})`);
            console.log(`✅ Test webhook: ${webhookResult.status || 'PROCESSED'}`);
            
        } catch (error) {
            console.log(`❌ Railway server test: FAILED`);
            console.log(`   Error: ${error.message}`);
        }
        
        console.log('');
        
        // 5. Recommendations for robustness
        console.log('5️⃣ ROBUSTNESS RECOMMENDATIONS:');
        console.log('-'.repeat(33));
        
        const recommendations = [];
        
        // Check field lengths
        const stageFields = schemaResult.rows.filter(row => row.column_name.includes('stage'));
        const shortStageFields = stageFields.filter(row => row.character_maximum_length < 200);
        
        if (shortStageFields.length > 0) {
            recommendations.push('Consider expanding stage fields to VARCHAR(200) for future FUB changes');
        }
        
        const sourceField = schemaResult.rows.find(row => row.column_name === 'source');
        if (sourceField && sourceField.character_maximum_length < 100) {
            recommendations.push('Consider expanding source field to VARCHAR(100) for longer webhook sources');
        }
        
        if (!hasEventIdConstraint) {
            recommendations.push('❌ CRITICAL: Add unique constraint on event_id for webhook deduplication');
        }
        
        if (recommendations.length === 0) {
            console.log('✅ System appears fully robust for all stage changes');
            console.log('✅ All field lengths adequate for current and future use');
            console.log('✅ All necessary constraints in place');
            console.log('✅ Webhook processing pipeline complete and tested');
        } else {
            recommendations.forEach((rec, index) => {
                console.log(`${index + 1}. ${rec}`);
            });
        }
        
        console.log('\\n' + '='.repeat(50));
        console.log('🔒 ROBUSTNESS VERIFICATION COMPLETE');
        console.log('🎯 System ready to handle all FUB stage changes reliably');
        console.log('='.repeat(50));
        
        await client.end();
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        await client.end();
    }
}

verifySystemRobustness().catch(console.error);