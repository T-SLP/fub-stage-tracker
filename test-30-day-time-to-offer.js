// Test Time to Offer calculation with 30-day period
async function test30DayTimeToOffer() {
    console.log('🧪 TESTING 30-DAY TIME TO OFFER');
    console.log('=' .repeat(35));
    console.log('Testing enhanced calculation with 30-day period\\n');
    
    // Use 30-day period
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 30);
    const endDate = today;
    
    console.log(`📅 30-Day Period:`);
    console.log(`Start: ${startDate.toISOString().split('T')[0]}`);
    console.log(`End: ${endDate.toISOString().split('T')[0]}`);
    console.log('(API will extend back 60 more days to capture qualifications)');
    console.log('');
    
    try {
        const response = await fetch('https://fub-stage-tracker.vercel.app/api/pipeline-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
            })
        });
        
        if (!response.ok) {
            console.log(`❌ API Error: ${response.status} ${response.statusText}`);
            return;
        }
        
        const data = await response.json();
        const allStageChanges = data.stageChanges || [];
        
        // Filter to only show 30-day period offers (like the dashboard would)
        const thirtyDayStart = new Date(startDate);
        const thirtyDayEnd = new Date(endDate);
        
        const offersIn30Days = allStageChanges.filter(change => {
            const changeDate = new Date(change.changed_at);
            return change.stage_to === 'ACQ - Offers Made' && 
                   changeDate >= thirtyDayStart && 
                   changeDate <= thirtyDayEnd;
        });
        
        console.log(`📊 DATA SUMMARY:`);
        console.log(`Total stage changes returned: ${allStageChanges.length}`);
        console.log(`Offers made in 30-day period: ${offersIn30Days.length}`);
        console.log('');
        
        // Simulate the enhanced calculateAvgTimeToOffer function
        console.log('🔍 ENHANCED TIME TO OFFER CALCULATION:');
        console.log('-'.repeat(42));
        
        if (offersIn30Days.length === 0) {
            console.log('❌ No offers made in 30-day period');
            return;
        }
        
        // Group all stage changes by person_id
        const leadJourneys = {};
        allStageChanges.forEach(change => {
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
        
        const timesToOffer = [];
        let foundQualifications = 0;
        let missingQualifications = 0;
        
        console.log('Individual journey calculations:');
        
        // For each offer made in 30-day period, find their qualification time
        offersIn30Days.forEach((offer, index) => {
            const personId = offer.person_id;
            const journey = leadJourneys[personId] || [];
            
            // Sort by timestamp
            journey.sort((a, b) => a.timestamp - b.timestamp);
            
            // Find first qualification
            let qualifiedTime = null;
            for (const stage of journey) {
                if (stage.stage === 'ACQ - Qualified' && !qualifiedTime) {
                    qualifiedTime = stage.timestamp;
                    break;
                }
            }
            
            if (qualifiedTime) {
                const offerTime = new Date(offer.changed_at);
                const timeDiff = (offerTime - qualifiedTime) / (1000 * 60 * 60 * 24);
                
                if (timeDiff >= 0) {
                    timesToOffer.push(timeDiff);
                    foundQualifications++;
                    
                    if (index < 10) { // Show first 10 for brevity
                        console.log(`  ${foundQualifications}. ${offer.first_name} ${offer.last_name}: ${Math.round(timeDiff * 10) / 10} days`);
                        console.log(`     Qualified: ${qualifiedTime.toLocaleDateString()}`);
                        console.log(`     Offered:   ${offerTime.toLocaleDateString()}`);
                    }
                }
            } else {
                missingQualifications++;
                if (index < 5) { // Show first few missing
                    console.log(`  ❌ ${offer.first_name} ${offer.last_name}: No qualification found (qualified before data range)`);
                }
            }
        });
        
        if (offersIn30Days.length > 10) {
            console.log(`  ... and ${offersIn30Days.length - 10} more offers`);
        }
        
        console.log('');
        console.log('📈 RESULTS:');
        console.log('-'.repeat(12));
        console.log(`Total offers in 30-day period: ${offersIn30Days.length}`);
        console.log(`Found qualifications for: ${foundQualifications}`);
        console.log(`Missing qualifications: ${missingQualifications} (qualified before extended range)`);
        
        if (timesToOffer.length > 0) {
            const avgDays = timesToOffer.reduce((sum, days) => sum + days, 0) / timesToOffer.length;
            const result = Math.round(avgDays * 10) / 10;
            
            // Show distribution
            const sorted = [...timesToOffer].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            
            console.log(`\\n📊 Average Time to Offer: ${result} days`);
            console.log(`📊 Calculation coverage: ${Math.round((foundQualifications / offersIn30Days.length) * 100)}%`);
            console.log(`\\nDistribution:`);
            console.log(`  Fastest: ${Math.round(sorted[0] * 10) / 10} days`);
            console.log(`  Median:  ${Math.round(median * 10) / 10} days`);
            console.log(`  Slowest: ${Math.round(sorted[sorted.length - 1] * 10) / 10} days`);
        } else {
            console.log('\\n❌ No complete journeys found');
        }
        
        console.log('\\n💡 COMPARISON WITH CURRENT WEEK:');
        console.log('-'.repeat(33));
        console.log('30-day period provides:');
        console.log('• Much larger sample size for reliable averages');
        console.log('• Better coverage of complete qualification → offer journeys');
        console.log('• More stable metric that doesnt fluctuate with weekly variations');
        console.log('• Historical context for performance trends');
        
    } catch (error) {
        console.error('❌ Error testing 30-day Time to Offer:', error.message);
    }
}

test30DayTimeToOffer().catch(console.error);