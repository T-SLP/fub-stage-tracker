// Test Avg Time to Offer calculation
async function testAvgTimeToOffer() {
    console.log('🧪 TESTING AVG TIME TO OFFER CALCULATION');
    console.log('=' .repeat(42));
    console.log('Verifying the calculation from ACQ - Qualified to ACQ - Offers Made\\n');
    
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 30); // Last 30 days for more data
    
    try {
        const response = await fetch('https://fub-stage-tracker.vercel.app/api/pipeline-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startDate: startDate.toISOString().split('T')[0],
                endDate: today.toISOString().split('T')[0]
            })
        });
        
        if (!response.ok) {
            console.log(`❌ API Error: ${response.status} ${response.statusText}`);
            return;
        }
        
        const data = await response.json();
        const stageChanges = data.stageChanges || [];
        
        console.log(`📊 Data loaded: ${stageChanges.length} stage changes`);
        
        // Replicate the calculateAvgTimeToOffer function
        const leadJourneys = {};
        
        stageChanges.forEach(change => {
            const personId = change.person_id;
            if (!leadJourneys[personId]) {
                leadJourneys[personId] = [];
            }
            leadJourneys[personId].push({
                stage: change.stage_to,
                timestamp: new Date(change.changed_at),
                first_name: change.first_name,
                last_name: change.last_name
            });
        });
        
        console.log(`📋 Unique leads: ${Object.keys(leadJourneys).length}`);
        
        // Calculate time to offer for each lead
        const timesToOffer = [];
        const journeyDetails = [];
        
        Object.values(leadJourneys).forEach(journey => {
            // Sort by timestamp to ensure chronological order
            journey.sort((a, b) => a.timestamp - b.timestamp);
            
            let qualifiedTime = null;
            
            for (const stage of journey) {
                if (stage.stage === 'ACQ - Qualified' && !qualifiedTime) {
                    // Record the first time they entered Qualified stage
                    qualifiedTime = stage.timestamp;
                } else if (stage.stage === 'ACQ - Offers Made' && qualifiedTime) {
                    // Calculate time difference in days
                    const timeDiff = (stage.timestamp - qualifiedTime) / (1000 * 60 * 60 * 24);
                    timesToOffer.push(timeDiff);
                    
                    journeyDetails.push({
                        name: `${stage.first_name} ${stage.last_name}`,
                        qualifiedDate: qualifiedTime.toLocaleDateString(),
                        offerDate: stage.timestamp.toLocaleDateString(),
                        timeDiff: Math.round(timeDiff * 10) / 10
                    });
                    
                    break; // Only count the first transition to Offers Made
                }
            }
        });
        
        console.log('\\n🎯 QUALIFIED → OFFERS MADE JOURNEYS:');
        console.log('-'.repeat(38));
        
        if (journeyDetails.length === 0) {
            console.log('❌ No complete journeys found (Qualified → Offers Made)');
            console.log('\\nDebugging - looking for individual stages:');
            
            const qualifiedCount = stageChanges.filter(c => c.stage_to === 'ACQ - Qualified').length;
            const offersCount = stageChanges.filter(c => c.stage_to === 'ACQ - Offers Made').length;
            
            console.log(`- ACQ - Qualified transitions: ${qualifiedCount}`);
            console.log(`- ACQ - Offers Made transitions: ${offersCount}`);
            
            if (offersCount > 0) {
                console.log('\\nRecent Offers Made (may not have qualifying stage in this period):');
                stageChanges
                    .filter(c => c.stage_to === 'ACQ - Offers Made')
                    .slice(0, 5)
                    .forEach(offer => {
                        console.log(`  ${offer.first_name} ${offer.last_name} - ${new Date(offer.changed_at).toLocaleString()}`);
                    });
            }
        } else {
            console.log(`Found ${journeyDetails.length} complete journeys:\\n`);
            
            journeyDetails.slice(0, 10).forEach((detail, index) => {
                console.log(`${index + 1}. ${detail.name}`);
                console.log(`   Qualified: ${detail.qualifiedDate}`);
                console.log(`   Offered:   ${detail.offerDate}`);
                console.log(`   Time Diff: ${detail.timeDiff} days`);
                console.log('');
            });
            
            // Calculate average
            const avgDays = timesToOffer.reduce((sum, days) => sum + days, 0) / timesToOffer.length;
            const finalAvg = Math.round(avgDays * 10) / 10;
            
            console.log(`📈 CALCULATION RESULT:`);
            console.log('-'.repeat(21));
            console.log(`Total journeys: ${timesToOffer.length}`);
            console.log(`Sum of days: ${Math.round(timesToOffer.reduce((sum, days) => sum + days, 0) * 10) / 10}`);
            console.log(`Average Time to Offer: ${finalAvg} days`);
            
            // Show distribution
            const sorted = [...timesToOffer].sort((a, b) => a - b);
            console.log(`\\nDistribution:`);
            console.log(`  Fastest: ${Math.round(sorted[0] * 10) / 10} days`);
            console.log(`  Median: ${Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10} days`);
            console.log(`  Slowest: ${Math.round(sorted[sorted.length - 1] * 10) / 10} days`);
        }
        
    } catch (error) {
        console.error('❌ Error testing Avg Time to Offer:', error.message);
    }
}

testAvgTimeToOffer().catch(console.error);