// Test Recent Activity fix - simulate what dashboard will show now
async function testRecentActivityFix() {
    console.log('🧪 TESTING RECENT ACTIVITY FIX');
    console.log('=' .repeat(35));
    console.log('Simulating what Recent Activity table will show after fix\\n');
    
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 7); // Last 7 days
    
    const requestBody = {
        startDate: startDate.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
    };
    
    try {
        const response = await fetch('https://fub-stage-tracker.vercel.app/api/pipeline-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            console.log(`❌ API Error: ${response.status} ${response.statusText}`);
            return;
        }
        
        const data = await response.json();
        
        // Simulate the new filtering logic
        const importantStages = [
            'ACQ - Qualified',
            'ACQ - Offers Made', 
            'ACQ - Price Motivated',
            'Qualified Phase 2 - Day 3 to 2 Weeks',
            'Qualified Phase 3 - 2 Weeks to 4 Weeks',
            'ACQ - Under Contract',
            'ACQ - Closed',
            'ACQ - Not Interested',
            'ACQ - Not Ready to Sell',
            'ACQ - Dead / DNC'
        ];
        
        // Helper function to check if a stage change represents a throwaway lead
        const isThrowawayLead = (change) => {
            const qualifiedStages = [
                'ACQ - Qualified',
                'Qualified Phase 2 - Day 3 to 2 Weeks',
                'Qualified Phase 3 - 2 Weeks to 4 Weeks'
            ];
            
            const throwawayStages = [
                'ACQ - Price Motivated',
                'ACQ - Not Interested',
                'ACQ - Not Ready to Sell',
                'ACQ - Dead / DNC'
            ];
            
            return qualifiedStages.includes(change.stage_from) && throwawayStages.includes(change.stage_to);
        };
        
        console.log('📋 FILTERING LOGIC TEST:');
        console.log('-'.repeat(25));
        console.log(`Total stage changes in period: ${data.stageChanges?.length || 0}`);
        
        if (data.stageChanges) {
            // Apply the new filtering logic
            const filteredActivity = data.stageChanges
                .filter(change => {
                    const isImportantStage = importantStages.includes(change.stage_to);
                    const isThrowaway = isThrowawayLead(change);
                    return isImportantStage || isThrowaway;
                })
                .slice(0, 20); // Show top 20 for this test
            
            console.log(`Records that will appear in Recent Activity: ${filteredActivity.length}`);
            console.log('');
            
            // Look for Todd's records specifically
            const toddRecords = filteredActivity.filter(change => 
                change.first_name?.toLowerCase().includes('todd') && 
                change.last_name?.toLowerCase().includes('brumm')
            );
            
            console.log('🎯 TODD BRUMM IN RECENT ACTIVITY:');
            console.log('-'.repeat(32));
            
            if (toddRecords.length > 0) {
                console.log(`✅ Todd will appear ${toddRecords.length} time(s) in Recent Activity:`);
                toddRecords.forEach((record, index) => {
                    const changeDate = new Date(record.changed_at);
                    const ago = Math.round((Date.now() - changeDate.getTime()) / (1000 * 60));
                    const timeStr = ago < 60 ? `${ago} min ago` : `${Math.round(ago/60)} hrs ago`;
                    
                    const displayStage = isThrowawayLead(record) ? 'Throwaway Lead' : record.stage_to;
                    
                    console.log(`  ${index + 1}. ${record.first_name} ${record.last_name}`);
                    console.log(`     Stage: ${displayStage}`);
                    console.log(`     Previous: ${record.stage_from || 'Unknown'}`);
                    console.log(`     Time: ${changeDate.toLocaleString()} (${timeStr})`);
                    console.log('');
                });
            } else {
                console.log('❌ Todd will NOT appear in Recent Activity (still filtered out)');
            }
            
            // Show sample of what will be in Recent Activity
            console.log('📋 SAMPLE OF RECENT ACTIVITY (top 10):');
            console.log('-'.repeat(40));
            filteredActivity.slice(0, 10).forEach((record, index) => {
                const changeDate = new Date(record.changed_at);
                const displayStage = isThrowawayLead(record) ? 'Throwaway Lead' : record.stage_to;
                
                console.log(`${index + 1}. ${record.first_name} ${record.last_name} → ${displayStage}`);
                console.log(`   ${changeDate.toLocaleString()}`);
            });
            
        } else {
            console.log('❌ No stage changes returned by API');
        }
        
    } catch (error) {
        console.error('❌ Error testing Recent Activity fix:', error.message);
    }
}

testRecentActivityFix().catch(console.error);