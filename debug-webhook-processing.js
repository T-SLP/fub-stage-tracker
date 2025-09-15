// Debug webhook processing by testing the Railway server's event handling
require('dotenv').config();

async function debugWebhookProcessing() {
    console.log('🔍 DEBUGGING: Webhook Stage Change Detection');
    console.log('=' .repeat(55));
    console.log('Testing why webhooks aren\'t creating stage change records\\n');
    
    const railwayUrl = 'https://fub-stage-tracker-production.up.railway.app';
    
    // Test 1: Check current server stats in detail
    console.log('📊 CURRENT SERVER STATUS:');
    console.log('-'.repeat(30));
    
    try {
        const healthResponse = await fetch(`${railwayUrl}/health`);
        const healthData = await healthResponse.json();
        
        console.log(`✅ Server Health: ${healthData.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
        console.log(`📈 Webhooks Received: ${healthData.webhooks_received}`);
        console.log(`📈 Webhooks Processed: ${healthData.webhooks_processed}`);
        console.log(`📈 Webhooks Failed: ${healthData.webhooks_failed}`);
        console.log(`📈 Webhooks Ignored: ${healthData.webhooks_ignored}`);
        console.log(`📈 Stage Changes Captured: ${healthData.stage_changes_captured}`);
        console.log(`⏰ Last Webhook: ${healthData.last_webhook_time}`);
        console.log('');
        
        // Test 2: Check detailed configuration
        const statsResponse = await fetch(`${railwayUrl}/stats`);
        const statsData = await statsResponse.json();
        
        console.log('🔧 SERVER CONFIGURATION:');
        console.log('-'.repeat(25));
        console.log(`FUB API Configured: ${statsData.configuration.fub_api_configured}`);
        console.log(`Database Configured: ${statsData.configuration.database_configured}`);
        console.log(`Relevant Events: ${statsData.configuration.relevant_events.join(', ')}`);
        console.log(`Webhook URL: ${statsData.configuration.webhook_base_url}/webhook/fub/stage-change`);
        console.log('');
        
        // Test 3: Send test webhook with different event types
        console.log('🧪 TESTING EVENT TYPE PROCESSING:');
        console.log('-'.repeat(35));
        
        const testEvents = [
            'peopleStageUpdated',
            'peopleUpdated', 
            'peopleCreated',
            'peopleTagsCreated'
        ];
        
        for (const eventType of testEvents) {
            console.log(`Testing event type: ${eventType}`);
            
            const testPayload = {
                event: eventType,
                eventId: `test_${eventType}_${Date.now()}`,
                resourceIds: ['123456'],
                occurred: new Date().toISOString()
            };
            
            try {
                const response = await fetch(`${railwayUrl}/webhook/fub/stage-change`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'FUB-Signature': 'test_signature'  // This will fail verification but that's OK for testing
                    },
                    body: JSON.stringify(testPayload)
                });
                
                const result = await response.json();
                console.log(`  Status: ${response.status} - ${result.status || result.error}`);
                console.log(`  Queued: ${result.queued !== undefined ? result.queued : 'N/A'}`);
                
            } catch (error) {
                console.log(`  Error: ${error.message}`);
            }
            
            // Small delay between tests
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('');
        
        // Test 4: Check if signature verification is blocking events
        console.log('🔐 TESTING SIGNATURE VERIFICATION:');
        console.log('-'.repeat(35));
        
        const validPayload = {
            event: 'peopleStageUpdated',
            eventId: `signature_test_${Date.now()}`,
            resourceIds: ['123456'],
            occurred: new Date().toISOString()
        };
        
        // Test without signature (should fail)
        const noSigResponse = await fetch(`${railwayUrl}/webhook/fub/stage-change`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validPayload)
        });
        
        const noSigResult = await noSigResponse.json();
        console.log(`No Signature Test: ${noSigResponse.status} - ${noSigResult.error || noSigResult.status}`);
        
        // Test with invalid signature (should fail)
        const badSigResponse = await fetch(`${railwayUrl}/webhook/fub/stage-change`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'FUB-Signature': 'invalid_signature_test'
            },
            body: JSON.stringify(validPayload)
        });
        
        const badSigResult = await badSigResponse.json();
        console.log(`Bad Signature Test: ${badSigResponse.status} - ${badSigResult.error || badSigResult.status}`);
        
        console.log('');
        
        // Test 5: Analysis and recommendations
        console.log('💡 ANALYSIS & RECOMMENDATIONS:');
        console.log('-'.repeat(30));
        
        if (healthData.webhooks_received > 0 && healthData.stage_changes_captured === 0) {
            console.log('🔍 DIAGNOSIS: Webhooks received but no stage changes captured');
            console.log('');
            console.log('Possible causes:');
            console.log('1. 🔐 Signature verification failing - FUB webhooks rejected');
            console.log('2. 📡 Wrong event types - Receiving non-stage events');
            console.log('3. 🎯 Stage detection too strict - Not recognizing changes');
            console.log('4. 👤 Person already in target stage - No change detected');
            console.log('');
            console.log('Next steps:');
            console.log('• Check Railway server logs for signature verification errors');
            console.log('• Verify FUB is sending peopleStageUpdated events specifically');
            console.log('• Test with a person not currently in "ACQ - Offers Made" stage');
        }
        
        if (healthData.webhooks_ignored > 0) {
            console.log(`🚫 ${healthData.webhooks_ignored} webhooks were ignored`);
            console.log('This suggests non-relevant event types are being filtered out');
        }
        
        console.log('\\n' + '='.repeat(55));
        console.log('📊 WEBHOOK DEBUGGING COMPLETE');
        console.log('='.repeat(55));
        
    } catch (error) {
        console.error(`❌ Error debugging webhook processing: ${error.message}`);
    }
}

debugWebhookProcessing().catch(console.error);