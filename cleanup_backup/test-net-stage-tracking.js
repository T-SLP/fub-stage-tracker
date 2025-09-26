// Test Net Stage Tracking - demonstrate how corrections are handled
async function testNetStageTracking() {
    console.log('🧪 TESTING NET STAGE TRACKING');
    console.log('=' .repeat(35));
    console.log('Testing how corrections and final positions are handled\\n');
    
    // Example scenario data - simulating Todd's movements
    const mockStageChanges = [
        // Todd starts in qualified
        { person_id: '1', first_name: 'Todd', last_name: 'Brumm', stage_to: 'ACQ - Qualified', changed_at: '2025-09-10T15:30:00Z' },
        // Accidentally moved to offers made
        { person_id: '1', first_name: 'Todd', last_name: 'Brumm', stage_to: 'ACQ - Offers Made', changed_at: '2025-09-10T15:41:51Z' },
        // Corrected back to qualified phase 3
        { person_id: '1', first_name: 'Todd', last_name: 'Brumm', stage_to: 'Qualified Phase 3 - 2 Weeks to 4 Weeks', changed_at: '2025-09-10T15:43:22Z' },
        
        // Another lead for comparison - stays in offers made
        { person_id: '2', first_name: 'John', last_name: 'Doe', stage_to: 'ACQ - Qualified', changed_at: '2025-09-10T14:00:00Z' },
        { person_id: '2', first_name: 'John', last_name: 'Doe', stage_to: 'ACQ - Offers Made', changed_at: '2025-09-10T16:00:00Z' }
    ];
    
    console.log('📊 MOCK STAGE CHANGES:');
    console.log('-'.repeat(22));
    mockStageChanges.forEach((change, index) => {
        const time = new Date(change.changed_at).toLocaleTimeString();
        console.log(`${index + 1}. ${change.first_name} ${change.last_name} → ${change.stage_to} (${time})`);
    });
    
    // Simulate the new tracking logic
    console.log('\\n🔍 NET STAGE TRACKING ANALYSIS:');
    console.log('-'.repeat(32));
    
    // Build lead journeys
    const leadJourneys = {};
    mockStageChanges.forEach(change => {
        const personId = change.person_id;
        if (!leadJourneys[personId]) {
            leadJourneys[personId] = {
                person_id: personId,
                first_name: change.first_name,
                last_name: change.last_name,
                stages: []
            };
        }
        leadJourneys[personId].stages.push({
            stage: change.stage_to,
            timestamp: new Date(change.changed_at)
        });
    });
    
    // Analyze final positions
    Object.values(leadJourneys).forEach(journey => {
        journey.stages.sort((a, b) => a.timestamp - b.timestamp);
        const finalStage = journey.stages[journey.stages.length - 1].stage;
        
        console.log(`\\n👤 ${journey.first_name} ${journey.last_name}:`);
        console.log(`   Journey: ${journey.stages.map(s => s.stage).join(' → ')}`);
        console.log(`   Final Stage: ${finalStage}`);
        
        // Determine what gets counted
        if (finalStage === 'ACQ - Qualified') {
            console.log(`   ✅ Counts as: QUALIFIED (not an offer)`);
        } else if (finalStage === 'ACQ - Offers Made') {
            console.log(`   ✅ Counts as: OFFER MADE`);
        } else if (finalStage === 'Qualified Phase 3 - 2 Weeks to 4 Weeks') {
            console.log(`   ✅ Counts as: QUALIFIED PHASE 3 (not an offer)`);
        } else {
            console.log(`   ✅ Counts as: ${finalStage}`);
        }
    });
    
    // Summary
    console.log('\\n📋 DAILY COUNTS SUMMARY:');
    console.log('-'.repeat(24));
    
    const dailyCounts = { qualified: 0, offers: 0, other: 0 };
    
    Object.values(leadJourneys).forEach(journey => {
        journey.stages.sort((a, b) => a.timestamp - b.timestamp);
        const finalStage = journey.stages[journey.stages.length - 1].stage;
        
        if (finalStage === 'ACQ - Qualified') {
            dailyCounts.qualified++;
        } else if (finalStage === 'ACQ - Offers Made') {
            dailyCounts.offers++;
        } else {
            dailyCounts.other++;
        }
    });
    
    console.log(`Qualified: ${dailyCounts.qualified}`);
    console.log(`Offers Made: ${dailyCounts.offers}`);
    console.log(`Other Stages: ${dailyCounts.other}`);
    
    console.log('\\n💡 KEY INSIGHT:');
    console.log('-'.repeat(14));
    console.log('Todd\'s accidental move to "Offers Made" followed by correction');
    console.log('does NOT count as an offer - only his final position matters!');
    console.log('This prevents incorrect counting from human errors and corrections.');
    
    // Test with actual API data
    console.log('\\n🌐 TESTING WITH REAL API DATA:');
    console.log('-'.repeat(32));
    
    try {
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 1); // Just today
        
        const response = await fetch('https://fub-stage-tracker.vercel.app/api/pipeline-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startDate: startDate.toISOString().split('T')[0],
                endDate: today.toISOString().split('T')[0]
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Find Todd's actual data
            const toddChanges = data.stageChanges?.filter(change => 
                change.first_name?.toLowerCase().includes('todd') && 
                change.last_name?.toLowerCase().includes('brumm')
            ) || [];
            
            if (toddChanges.length > 0) {
                console.log('Found Todd\'s real data:');
                
                // Build Todd's journey
                toddChanges.sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at));
                const journey = toddChanges.map(c => c.stage_to);
                const finalStage = journey[journey.length - 1];
                
                console.log(`Real Journey: ${journey.join(' → ')}`);
                console.log(`Final Stage: ${finalStage}`);
                
                if (finalStage === 'ACQ - Offers Made') {
                    console.log('✅ Todd WOULD count as an offer (final position)');
                } else {
                    console.log('✅ Todd would NOT count as an offer (corrected)');
                }
            } else {
                console.log('No Todd data found in API response');
            }
        }
    } catch (error) {
        console.error('Error testing with API:', error.message);
    }
}

testNetStageTracking().catch(console.error);