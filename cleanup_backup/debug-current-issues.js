// Debug current dashboard issues
async function debugCurrentIssues() {
    console.log('🔍 DEBUGGING CURRENT DASHBOARD ISSUES');
    console.log('=' .repeat(50));
    console.log('Testing both Pipeline Activity Bar Chart dates and Campaign Chart defaults\n');
    
    // Test 1: Check Pipeline Activity Bar Chart date plotting
    console.log('📊 TEST 1: PIPELINE ACTIVITY BAR CHART DATES');
    console.log('-'.repeat(45));
    
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay()); // Start of current week (Sunday)
    
    console.log(`Current week range:`);
    console.log(`Start: ${currentWeekStart.toISOString().split('T')[0]} (${currentWeekStart.toLocaleDateString('en-US', { weekday: 'long' })})`);
    console.log(`End: ${today.toISOString().split('T')[0]} (${today.toLocaleDateString('en-US', { weekday: 'long' })})`);
    console.log('');
    
    try {
        // Call main dashboard API
        const response = await fetch('https://fub-stage-tracker.vercel.app/api/pipeline-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startDate: currentWeekStart.toISOString().split('T')[0],
                endDate: today.toISOString().split('T')[0]
            })
        });
        
        if (!response.ok) {
            console.log(`❌ API Error: ${response.status} ${response.statusText}`);
            return;
        }
        
        const data = await response.json();
        const stageChanges = data.stageChanges || [];
        
        console.log(`📈 Total stage changes returned: ${stageChanges.length}`);
        
        // Check for recent offers made (should show correct dates)
        const recentOffers = stageChanges
            .filter(change => change.stage_to === 'ACQ - Offers Made')
            .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at))
            .slice(0, 5);
            
        console.log(`\\n🎯 Recent offers made (last 5):`);
        recentOffers.forEach(offer => {
            const originalDate = new Date(offer.changed_at);
            const chartDate = originalDate.toISOString().split('T')[0];
            const dayOfWeek = new Date(chartDate).toLocaleDateString('en-US', { weekday: 'long' });
            
            console.log(`  ${offer.first_name} ${offer.last_name}:`);
            console.log(`    Raw timestamp: ${offer.changed_at}`);
            console.log(`    Chart plots on: ${chartDate} (${dayOfWeek})`);
            console.log(`    Time: ${originalDate.toTimeString().split(' ')[0]}`);
            console.log('');
        });
        
        // Check for Sunday activity (should be minimal/none for real business)
        const sundayEvents = stageChanges.filter(change => {
            const changeDate = new Date(change.changed_at);
            const chartDate = changeDate.toISOString().split('T')[0];
            const dayOfWeek = new Date(chartDate).getDay(); // 0 = Sunday
            return dayOfWeek === 0;
        });
        
        console.log(`📅 Events plotted on Sundays: ${sundayEvents.length}`);
        if (sundayEvents.length > 0) {
            console.log('Sunday events (first 3):');
            sundayEvents.slice(0, 3).forEach(event => {
                const changeDate = new Date(event.changed_at);
                console.log(`  ${event.first_name} ${event.last_name}: ${event.stage_to}`);
                console.log(`    ${event.changed_at} → plots on ${changeDate.toISOString().split('T')[0]}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error testing Pipeline Activity:', error.message);
    }
    
    console.log('\\n📊 TEST 2: CAMPAIGN CHART DEFAULT BEHAVIOR');
    console.log('-'.repeat(43));
    
    // Test 2: Check Campaign Chart default behavior
    // This should test what the fetchCampaignData function does with 'current_week'
    console.log('Testing fetchCampaignData with TIME_RANGES.CURRENT_WEEK...');
    
    try {
        const campaignResponse = await fetch('https://fub-stage-tracker.vercel.app/api/pipeline-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startDate: currentWeekStart.toISOString().split('T')[0],
                endDate: today.toISOString().split('T')[0]
            })
        });
        
        if (!campaignResponse.ok) {
            console.log(`❌ Campaign API Error: ${campaignResponse.status}`);
            return;
        }
        
        const campaignData = await campaignResponse.json();
        const campaignStageChanges = campaignData.stageChanges || [];
        
        // Simulate what the dashboard does for campaign metrics
        const qualifiedThisWeek = campaignStageChanges.filter(change => 
            change.stage_to === 'ACQ - Qualified'
        ).length;
        
        const campaigns = {};
        campaignStageChanges.forEach(change => {
            if (change.stage_to === 'ACQ - Qualified') {
                const campaign = change.campaign_id || 'No Campaign';
                campaigns[campaign] = (campaigns[campaign] || 0) + 1;
            }
        });
        
        console.log(`📊 Current week campaign data:`);
        console.log(`  Total qualified this week: ${qualifiedThisWeek}`);
        console.log(`  Unique campaigns: ${Object.keys(campaigns).length}`);
        console.log(`  Campaign breakdown:`);
        
        const sortedCampaigns = Object.entries(campaigns)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);
            
        sortedCampaigns.forEach(([campaign, count]) => {
            console.log(`    ${campaign}: ${count} qualified leads`);
        });
        
        if (Object.keys(campaigns).length > 30) {
            console.log(`\\n⚠️  WARNING: Showing ${Object.keys(campaigns).length} campaigns - this suggests`);
            console.log(`    the chart is NOT defaulting to current week (should be much fewer)`);
        } else {
            console.log(`\\n✅ Campaign count looks reasonable for current week`);
        }
        
    } catch (error) {
        console.error('❌ Error testing Campaign Chart:', error.message);
    }
    
    console.log('\\n🔧 SUMMARY OF ISSUES TO INVESTIGATE:');
    console.log('-'.repeat(35));
    console.log('1. Are Pipeline Activity dates shifted by one day?');
    console.log('2. Is Campaign Chart showing too much historical data?');
    console.log('3. Are there bulk import records affecting the charts?');
}

debugCurrentIssues().catch(console.error);