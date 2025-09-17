// Debug Campaign Chart Data Flow
async function debugCampaignChartData() {
    console.log('📊 DEBUGGING QUALIFIED LEADS BY CAMPAIGN CODE DATA');
    console.log('=' .repeat(55));
    console.log('Checking why campaign chart shows more data than current week\n');
    
    // Test what the current week should be
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay()); // Start of current week (Sunday)
    
    console.log(`🗓️  Current Week Range:`);
    console.log(`Start: ${currentWeekStart.toISOString().split('T')[0]} (${currentWeekStart.toLocaleDateString('en-US', { weekday: 'long' })})`);
    console.log(`End: ${today.toISOString().split('T')[0]} (${today.toLocaleDateString('en-US', { weekday: 'long' })})`);
    console.log('');
    
    try {
        // Test what the API returns for current week
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
        
        // Filter for qualified leads in current week (what campaign chart should show)
        const qualifiedThisWeek = stageChanges.filter(change => {
            if (change.stage_to !== 'ACQ - Qualified') return false;
            
            const changeDate = new Date(change.changed_at);
            return changeDate >= currentWeekStart && changeDate <= today;
        });
        
        console.log(`🎯 Qualified leads this week: ${qualifiedThisWeek.length}`);
        
        // Group by campaign (simulate what campaign chart does)
        const campaigns = {};
        qualifiedThisWeek.forEach(change => {
            const campaign = change.campaign_id || 'No Campaign';
            campaigns[campaign] = (campaigns[campaign] || 0) + 1;
        });
        
        const campaignCount = Object.keys(campaigns).length;
        console.log(`📊 Unique campaigns this week: ${campaignCount}`);
        
        if (campaignCount > 20) {
            console.log(`⚠️  WARNING: ${campaignCount} campaigns suggests chart is NOT using current week filter`);
        } else {
            console.log(`✅ Campaign count looks correct for current week`);
        }
        
        console.log('\\n📋 Top 10 campaigns this week:');
        const sortedCampaigns = Object.entries(campaigns)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
            
        sortedCampaigns.forEach(([campaign, count]) => {
            console.log(`  ${campaign}: ${count} qualified leads`);
        });
        
        // Check date distribution
        console.log('\\n📅 Daily distribution of qualified leads this week:');
        const dailyDistribution = {};
        qualifiedThisWeek.forEach(change => {
            const changeDate = new Date(change.changed_at);
            const easternDateStr = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(changeDate);
            
            dailyDistribution[easternDateStr] = (dailyDistribution[easternDateStr] || 0) + 1;
        });
        
        Object.entries(dailyDistribution).forEach(([date, count]) => {
            const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
            console.log(`  ${date} (${dayName}): ${count} qualified`);
        });
        
        // Check if there are old qualified leads being included
        const allQualified = stageChanges.filter(change => change.stage_to === 'ACQ - Qualified');
        const oldQualified = allQualified.filter(change => {
            const changeDate = new Date(change.changed_at);
            return changeDate < currentWeekStart;
        });
        
        if (oldQualified.length > 0) {
            console.log(`\\n⚠️  Found ${oldQualified.length} qualified leads from BEFORE current week`);
            console.log('This suggests the API is returning data from a longer period than requested');
            
            // Show a few examples
            console.log('Examples of old qualified leads:');
            oldQualified.slice(0, 3).forEach(change => {
                console.log(`  ${change.first_name} ${change.last_name}: ${change.changed_at} (${change.campaign_id})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error debugging campaign chart:', error.message);
    }
}

debugCampaignChartData().catch(console.error);