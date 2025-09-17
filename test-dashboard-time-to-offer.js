// Test Dashboard's Exact Time to Offer calculation
async function testDashboardTimeToOffer() {
    console.log('🧪 TESTING DASHBOARD TIME TO OFFER');
    console.log('=' .repeat(35));
    console.log('Testing with dashboard\'s exact date range and logic\\n');
    
    // Use current week like the dashboard does by default
    const today = new Date();
    const getWeekStart = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        return new Date(d.setDate(diff));
    };
    
    const startDate = getWeekStart(today);
    const endDate = today;
    
    console.log(`📅 Date Range (Current Week):`);
    console.log(`Start: ${startDate.toISOString().split('T')[0]}`);
    console.log(`End: ${endDate.toISOString().split('T')[0]}`);
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
        const stageChanges = data.stageChanges || [];
        
        console.log(`📊 Data loaded: ${stageChanges.length} stage changes in current week`);
        
        // Replicate the EXACT calculateAvgTimeToOffer function from dataProcessing.js
        const leadJourneys = {};
        
        stageChanges.forEach(change => {
            const personId = change.person_id;
            if (!leadJourneys[personId]) {
                leadJourneys[personId] = [];
            }
            leadJourneys[personId].push({
                stage: change.stage_to,
                timestamp: new Date(change.changed_at)
            });
        });
        
        console.log(`📋 Unique leads this week: ${Object.keys(leadJourneys).length}`);
        
        // Calculate time to offer for each lead that progressed from Qualified to Offers Made
        const timesToOffer = [];
        
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
                    console.log(`⏱️  Journey: Qualified ${qualifiedTime.toLocaleString()} → Offered ${stage.timestamp.toLocaleString()} = ${Math.round(timeDiff * 10) / 10} days`);
                    break; // Only count the first transition to Offers Made
                }
            }
        });
        
        console.log('\\n📈 CALCULATION RESULT:');
        console.log('-'.repeat(21));
        
        if (timesToOffer.length === 0) {
            console.log('❌ No complete journeys found in current week');
            console.log('Dashboard will show: 0 days');
            
            // Check what stage changes we do have
            const qualifiedCount = stageChanges.filter(c => c.stage_to === 'ACQ - Qualified').length;
            const offersCount = stageChanges.filter(c => c.stage_to === 'ACQ - Offers Made').length;
            
            console.log('\\n🔍 Current week activity:');
            console.log(`- Qualified transitions: ${qualifiedCount}`);
            console.log(`- Offers Made transitions: ${offersCount}`);
            
            if (offersCount > 0) {
                console.log('\\n📋 Offers Made this week (may not have qualifying stage in same week):');
                stageChanges
                    .filter(c => c.stage_to === 'ACQ - Offers Made')
                    .forEach(offer => {
                        console.log(`  ${offer.first_name} ${offer.last_name} - ${new Date(offer.changed_at).toLocaleString()}`);
                    });
            }
        } else {
            const avgDays = timesToOffer.reduce((sum, days) => sum + days, 0) / timesToOffer.length;
            const finalAvg = Math.round(avgDays * 10) / 10;
            
            console.log(`Total journeys this week: ${timesToOffer.length}`);
            console.log(`Average Time to Offer: ${finalAvg} days`);
            console.log(`Dashboard should show: ${finalAvg} days`);
        }
        
        console.log('\\n💡 LIKELY EXPLANATION:');
        console.log('-'.repeat(21));
        console.log('If dashboard shows 0.6 days, it suggests:');
        console.log('1. Very recent qualified leads got offers quickly');
        console.log('2. Different date range than current week');
        console.log('3. Possible timezone or date calculation issue');
        
    } catch (error) {
        console.error('❌ Error testing dashboard Time to Offer:', error.message);
    }
}

testDashboardTimeToOffer().catch(console.error);