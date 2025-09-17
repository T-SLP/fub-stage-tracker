// Test Pipeline Velocity calculation
async function testPipelineVelocity() {
    console.log('🧪 TESTING PIPELINE VELOCITY');
    console.log('=' .repeat(35));
    console.log('Why is Pipeline Velocity showing 0?\\n');
    
    // Test with current week first, then 30 days, then 90 days
    const periods = [
        { name: 'Current Week', days: 7 },
        { name: '30 Days', days: 30 },
        { name: '90 Days', days: 90 },
        { name: '6 Months', days: 180 }
    ];
    
    for (const period of periods) {
        console.log(`\\n📅 TESTING ${period.name.toUpperCase()} PERIOD:`);
        console.log('-'.repeat(35));
        
        const today = new Date();
        const startDate = new Date();
        startDate.setDate(today.getDate() - period.days);
        
        console.log(`Period: ${startDate.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`);
        
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
                continue;
            }
            
            const data = await response.json();
            const stageChanges = data.stageChanges || [];
            
            // Look for key stages
            const qualifiedChanges = stageChanges.filter(c => c.stage_to === 'ACQ - Qualified');
            const underContractChanges = stageChanges.filter(c => c.stage_to === 'ACQ - Under Contract');
            const closedChanges = stageChanges.filter(c => c.stage_to === 'ACQ - Closed');
            
            console.log(`Total stage changes: ${stageChanges.length}`);
            console.log(`ACQ - Qualified: ${qualifiedChanges.length}`);
            console.log(`ACQ - Under Contract: ${underContractChanges.length}`);
            console.log(`ACQ - Closed: ${closedChanges.length}`);
            
            if (underContractChanges.length === 0) {
                console.log('❌ No "ACQ - Under Contract" transitions found');
                console.log('   This is why Pipeline Velocity = 0');
                continue;
            }
            
            // Simulate the calculatePipelineVelocity function
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
            
            const timesToContract = [];
            
            Object.values(leadJourneys).forEach(journey => {
                journey.sort((a, b) => a.timestamp - b.timestamp);
                
                let qualifiedTime = null;
                
                for (const stage of journey) {
                    if (stage.stage === 'ACQ - Qualified' && !qualifiedTime) {
                        qualifiedTime = stage.timestamp;
                    } else if (stage.stage === 'ACQ - Under Contract' && qualifiedTime) {
                        const timeDiff = (stage.timestamp - qualifiedTime) / (1000 * 60 * 60 * 24);
                        timesToContract.push({
                            name: `${stage.first_name} ${stage.last_name}`,
                            days: timeDiff,
                            qualifiedDate: qualifiedTime.toLocaleDateString(),
                            contractDate: stage.timestamp.toLocaleDateString()
                        });
                        break;
                    }
                }
            });
            
            if (timesToContract.length === 0) {
                console.log('❌ No complete Qualified → Under Contract journeys found');
                console.log('   Leads either:');
                console.log('   - Were qualified outside this period');
                console.log('   - Haven\'t reached Under Contract yet');
                console.log('   - Went to other stages (Offers Made, Closed, etc.)');
            } else {
                console.log(`✅ Found ${timesToContract.length} complete Qualified → Under Contract journeys:`);
                
                timesToContract.slice(0, 5).forEach((journey, index) => {
                    console.log(`  ${index + 1}. ${journey.name}: ${Math.round(journey.days * 10) / 10} days`);
                    console.log(`     ${journey.qualifiedDate} → ${journey.contractDate}`);
                });
                
                if (timesToContract.length > 5) {
                    console.log(`     ... and ${timesToContract.length - 5} more`);
                }
                
                const avgDays = timesToContract.reduce((sum, j) => sum + j.days, 0) / timesToContract.length;
                console.log(`\\n📈 Pipeline Velocity: ${Math.round(avgDays * 10) / 10} days`);
            }
            
        } catch (error) {
            console.error(`❌ Error testing ${period.name}:`, error.message);
        }
    }
    
    console.log('\\n💡 LIKELY REASONS FOR 0:');
    console.log('-'.repeat(25));
    console.log('1. No leads reached "ACQ - Under Contract" in selected period');
    console.log('2. Leads went directly to "ACQ - Closed" instead of "Under Contract"');
    console.log('3. Most qualified leads are still in pipeline (haven\'t closed yet)');
    console.log('4. Different stage naming in your FUB setup');
    console.log('\\n🔧 POTENTIAL SOLUTIONS:');
    console.log('-'.repeat(23));
    console.log('• Check if you use "ACQ - Closed" instead of "Under Contract"');
    console.log('• Extend the calculation period (6+ months)');
    console.log('• Verify stage names in your FUB setup');
    console.log('• Consider tracking Qualified → Closed instead');
}

testPipelineVelocity().catch(console.error);