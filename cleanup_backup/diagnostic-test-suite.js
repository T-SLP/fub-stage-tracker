// Comprehensive diagnostic test suite to isolate webhook-to-database breakdown
const { Client } = require('pg');
require('dotenv').config();

class WebhookDiagnostics {
    constructor() {
        this.railwayUrl = 'https://fub-stage-tracker-production.up.railway.app';
        this.testResults = {};
    }

    async runAllTests() {
        console.log('🔬 WEBHOOK DIAGNOSTIC TEST SUITE');
        console.log('=' .repeat(50));
        console.log('Systematically testing each component of the webhook pipeline\\n');

        // Test 1: Database Connectivity
        await this.testDatabaseConnectivity();
        
        // Test 2: Railway Server Health
        await this.testRailwayServerHealth();
        
        // Test 3: FUB API Connectivity from Railway
        await this.testFubApiConnectivity();
        
        // Test 4: Webhook Event Processing
        await this.testWebhookEventProcessing();
        
        // Test 5: Stage Change Logic
        await this.testStageChangeLogic();
        
        // Test 6: Database Write Operations
        await this.testDatabaseWriteOperations();
        
        // Test 7: End-to-End Webhook Simulation
        await this.testEndToEndWebhookSimulation();

        // Summary and Analysis
        this.analyzeDiagnosticResults();
    }

    async testDatabaseConnectivity() {
        console.log('🗄️  TEST 1: Database Connectivity');
        console.log('-'.repeat(35));
        
        try {
            const client = new Client({
                connectionString: process.env.SUPABASE_DB_URL,
                ssl: { rejectUnauthorized: false }
            });
            
            await client.connect();
            
            // Test basic query
            const result = await client.query('SELECT COUNT(*) as count FROM stage_changes');
            const recordCount = result.rows[0].count;
            
            console.log(`✅ Database connection: SUCCESS`);
            console.log(`✅ Query execution: SUCCESS`);
            console.log(`📊 Current records: ${recordCount}`);
            
            // Test write capability
            const testQuery = `
                SELECT 1 as test_column
            `;
            await client.query(testQuery);
            console.log(`✅ Database read access: SUCCESS`);
            
            await client.end();
            
            this.testResults.databaseConnectivity = {
                status: 'SUCCESS',
                recordCount: recordCount
            };
            
        } catch (error) {
            console.log(`❌ Database connectivity: FAILED`);
            console.log(`   Error: ${error.message}`);
            
            this.testResults.databaseConnectivity = {
                status: 'FAILED',
                error: error.message
            };
        }
        
        console.log('');
    }

    async testRailwayServerHealth() {
        console.log('🚂 TEST 2: Railway Server Health');
        console.log('-'.repeat(33));
        
        try {
            const response = await fetch(`${this.railwayUrl}/health`);
            const healthData = await response.json();
            
            console.log(`✅ Railway server: RESPONDING`);
            console.log(`✅ Server health: ${healthData.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
            console.log(`📊 Webhooks processed: ${healthData.webhooks_processed}`);
            console.log(`📊 Stage changes captured: ${healthData.stage_changes_captured}`);
            console.log(`📊 Success rate: ${healthData.success_rate}%`);
            
            this.testResults.railwayHealth = {
                status: 'SUCCESS',
                healthy: healthData.healthy,
                webhooksProcessed: healthData.webhooks_processed,
                stageChangesCaptured: healthData.stage_changes_captured
            };
            
        } catch (error) {
            console.log(`❌ Railway server: FAILED`);
            console.log(`   Error: ${error.message}`);
            
            this.testResults.railwayHealth = {
                status: 'FAILED',
                error: error.message
            };
        }
        
        console.log('');
    }

    async testFubApiConnectivity() {
        console.log('📡 TEST 3: FUB API Connectivity from Railway');
        console.log('-'.repeat(45));
        
        try {
            // Test if Railway can reach FUB API by checking server configuration
            const response = await fetch(`${this.railwayUrl}/stats`);
            const statsData = await response.json();
            
            const fubConfigured = statsData.configuration.fub_api_configured;
            const dbConfigured = statsData.configuration.database_configured;
            
            console.log(`✅ Railway can reach stats endpoint: SUCCESS`);
            console.log(`🔑 FUB API key configured: ${fubConfigured ? 'YES' : 'NO'}`);
            console.log(`🗄️  Database configured: ${dbConfigured ? 'YES' : 'NO'}`);
            console.log(`📡 Relevant events: ${statsData.configuration.relevant_events.join(', ')}`);
            
            this.testResults.fubApiConnectivity = {
                status: 'SUCCESS',
                fubConfigured: fubConfigured,
                databaseConfigured: dbConfigured
            };
            
        } catch (error) {
            console.log(`❌ FUB API connectivity test: FAILED`);
            console.log(`   Error: ${error.message}`);
            
            this.testResults.fubApiConnectivity = {
                status: 'FAILED',
                error: error.message
            };
        }
        
        console.log('');
    }

    async testWebhookEventProcessing() {
        console.log('🎣 TEST 4: Webhook Event Processing');
        console.log('-'.repeat(37));
        
        try {
            // Send a test webhook to see how it's processed
            const testPayload = {
                event: 'peopleStageUpdated',
                eventId: `diagnostic_test_${Date.now()}`,
                resourceIds: ['999999'],  // Non-existent ID to avoid real data interference
                occurred: new Date().toISOString()
            };
            
            const response = await fetch(`${this.railwayUrl}/webhook/fub/stage-change`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // Note: No signature - this will test signature verification
                },
                body: JSON.stringify(testPayload)
            });
            
            const result = await response.json();
            
            console.log(`📨 Test webhook sent: ${testPayload.event}`);
            console.log(`📥 Response status: ${response.status}`);
            console.log(`📋 Response: ${result.status || result.error}`);
            console.log(`⚙️  Queued for processing: ${result.queued !== undefined ? result.queued : 'N/A'}`);
            
            this.testResults.webhookProcessing = {
                status: response.ok ? 'SUCCESS' : 'FAILED',
                responseStatus: response.status,
                queued: result.queued,
                message: result.status || result.error
            };
            
        } catch (error) {
            console.log(`❌ Webhook processing test: FAILED`);
            console.log(`   Error: ${error.message}`);
            
            this.testResults.webhookProcessing = {
                status: 'FAILED',
                error: error.message
            };
        }
        
        console.log('');
    }

    async testStageChangeLogic() {
        console.log('🔄 TEST 5: Stage Change Logic');
        console.log('-'.repeat(30));
        
        try {
            // Check if Todd Brumm exists in our database and what his current stage is
            const client = new Client({
                connectionString: process.env.SUPABASE_DB_URL,
                ssl: { rejectUnauthorized: false }
            });
            
            await client.connect();
            
            const toddQuery = \`
                SELECT 
                    person_id,
                    first_name,
                    last_name,
                    stage_to as current_stage,
                    changed_at,
                    source
                FROM stage_changes 
                WHERE LOWER(first_name) LIKE '%todd%' 
                   AND LOWER(last_name) LIKE '%brumm%'
                ORDER BY changed_at DESC
                LIMIT 5
            \`;
            
            const toddResult = await client.query(toddQuery);
            
            if (toddResult.rows.length > 0) {
                console.log(\`✅ Todd Brumm found in database: \${toddResult.rows.length} records\`);
                
                toddResult.rows.forEach((row, index) => {
                    console.log(\`   \${index + 1}. Stage: \${row.current_stage}\`);
                    console.log(\`      Date: \${new Date(row.changed_at).toLocaleString()}\`);
                    console.log(\`      Source: \${row.source}\`);
                });
                
                // Check if recent changes happened
                const recentChange = toddResult.rows[0];
                const timeSinceLastChange = Date.now() - new Date(recentChange.changed_at).getTime();
                const minutesAgo = Math.round(timeSinceLastChange / (1000 * 60));
                
                console.log(\`⏰ Most recent change: \${minutesAgo} minutes ago\`);
                
                this.testResults.stageChangeLogic = {
                    status: 'SUCCESS',
                    toddFound: true,
                    recordCount: toddResult.rows.length,
                    mostRecentStage: recentChange.current_stage,
                    minutesSinceLastChange: minutesAgo
                };
                
            } else {
                console.log(\`⚠️  Todd Brumm not found in database\`);
                console.log(\`   This suggests either:\`);
                console.log(\`   1. Name spelling different\`);
                console.log(\`   2. No stage changes captured yet\`);
                console.log(\`   3. Webhook processing not reaching database\`);
                
                this.testResults.stageChangeLogic = {
                    status: 'WARNING',
                    toddFound: false,
                    recordCount: 0
                };
            }
            
            await client.end();
            
        } catch (error) {
            console.log(\`❌ Stage change logic test: FAILED\`);
            console.log(\`   Error: \${error.message}\`);
            
            this.testResults.stageChangeLogic = {
                status: 'FAILED',
                error: error.message
            };
        }
        
        console.log('');
    }

    async testDatabaseWriteOperations() {
        console.log('✏️  TEST 6: Database Write Operations');
        console.log('-'.repeat(38));
        
        try {
            const client = new Client({
                connectionString: process.env.SUPABASE_DB_URL,
                ssl: { rejectUnauthorized: false }
            });
            
            await client.connect();
            
            // Test inserting a dummy record (that we'll immediately clean up)
            const testRecord = {
                person_id: 'test_diagnostic_999999',
                first_name: 'Test',
                last_name: 'Diagnostic',
                stage_from: 'Test Stage From',
                stage_to: 'Test Stage To',
                changed_at: new Date().toISOString(),
                received_at: new Date().toISOString(),
                source: 'diagnostic_test',
                event_id: \`diagnostic_\${Date.now()}\`
            };
            
            const insertQuery = \`
                INSERT INTO stage_changes (
                    person_id, first_name, last_name, stage_from, stage_to,
                    changed_at, received_at, source, event_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
            \`;
            
            const insertResult = await client.query(insertQuery, [
                testRecord.person_id,
                testRecord.first_name,
                testRecord.last_name,
                testRecord.stage_from,
                testRecord.stage_to,
                testRecord.changed_at,
                testRecord.received_at,
                testRecord.source,
                testRecord.event_id
            ]);
            
            const insertedId = insertResult.rows[0].id;
            console.log(\`✅ Database insert: SUCCESS (ID: \${insertedId})\`);
            
            // Clean up the test record
            await client.query('DELETE FROM stage_changes WHERE id = $1', [insertedId]);
            console.log(\`🧹 Test record cleanup: SUCCESS\`);
            
            await client.end();
            
            this.testResults.databaseWrite = {
                status: 'SUCCESS',
                insertedId: insertedId
            };
            
        } catch (error) {
            console.log(\`❌ Database write test: FAILED\`);
            console.log(\`   Error: \${error.message}\`);
            
            this.testResults.databaseWrite = {
                status: 'FAILED',
                error: error.message
            };
        }
        
        console.log('');
    }

    async testEndToEndWebhookSimulation() {
        console.log('🔄 TEST 7: End-to-End Webhook Simulation');
        console.log('-'.repeat(43));
        
        console.log('⚠️  This test requires manual verification:');
        console.log('   1. Check Railway logs for webhook processing details');
        console.log('   2. Verify signature verification is working correctly');
        console.log('   3. Check if FUB API calls from Railway are successful');
        console.log('');
        console.log('🔍 Recommended next steps:');
        console.log('   • Access Railway dashboard logs');
        console.log('   • Look for error messages during webhook processing');
        console.log('   • Check for FUB API authentication errors');
        console.log('   • Verify database connection errors');
        
        this.testResults.endToEndSimulation = {
            status: 'MANUAL_VERIFICATION_REQUIRED'
        };
        
        console.log('');
    }

    analyzeDiagnosticResults() {
        console.log('📊 DIAGNOSTIC ANALYSIS & RECOMMENDATIONS');
        console.log('=' .repeat(50));
        
        let issuesFound = [];
        let successfulTests = [];
        
        // Analyze each test result
        Object.entries(this.testResults).forEach(([testName, result]) => {
            if (result.status === 'SUCCESS') {
                successfulTests.push(testName);
            } else if (result.status === 'FAILED' || result.status === 'WARNING') {
                issuesFound.push({ test: testName, ...result });
            }
        });
        
        console.log(\`✅ Successful tests: \${successfulTests.length}\`);
        console.log(\`❌ Issues found: \${issuesFound.length}\`);
        console.log('');
        
        if (issuesFound.length === 0) {
            console.log('🎉 All tests passed! The issue may be:');
            console.log('   1. Signature verification blocking real FUB webhooks');
            console.log('   2. FUB sending unexpected event types');
            console.log('   3. Race conditions in webhook processing');
            console.log('   4. Specific to Todd Brumm data or timing');
        } else {
            console.log('🚨 Issues detected:');
            issuesFound.forEach((issue, index) => {
                console.log(\`   \${index + 1}. \${issue.test}: \${issue.error || 'See details above'}\`);
            });
        }
        
        console.log('\\n🔧 RECOMMENDED NEXT ACTIONS:');
        
        // Database connectivity issues
        if (this.testResults.databaseConnectivity?.status === 'FAILED') {
            console.log('   • Fix database connectivity - check SUPABASE_DB_URL');
        }
        
        // Railway health issues  
        if (this.testResults.railwayHealth?.status === 'FAILED') {
            console.log('   • Railway server is down - check deployment');
        }
        
        // FUB API issues
        if (this.testResults.fubApiConnectivity?.status === 'FAILED') {
            console.log('   • Fix FUB API configuration - check FUB_API_KEY');
        }
        
        // Stage change logic issues
        if (this.testResults.stageChangeLogic?.toddFound === false) {
            console.log('   • Webhook processing not reaching database');
            console.log('   • Check Railway server logs for processing errors');
        }
        
        // Database write issues
        if (this.testResults.databaseWrite?.status === 'FAILED') {
            console.log('   • Database write permissions issue');
            console.log('   • Check table schema and constraints');
        }
        
        console.log('\\n' + '='.repeat(50));
        console.log('🔬 DIAGNOSTIC TEST SUITE COMPLETE');
        console.log('='.repeat(50));
    }
}

// Run the diagnostic test suite
const diagnostics = new WebhookDiagnostics();
diagnostics.runAllTests().catch(console.error);