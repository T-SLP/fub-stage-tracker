// Debug Pipeline Activity Bar Chart date plotting
async function debugChartDatePlotting() {
    console.log('📊 DEBUGGING PIPELINE ACTIVITY BAR CHART DATE PLOTTING');
    console.log('=' .repeat(55));
    console.log('Investigating why Monday data shows on Sunday\n');
    
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay()); // Start of current week (Sunday)
    
    console.log(`Current week range:`);
    console.log(`Start: ${currentWeekStart.toISOString().split('T')[0]} (${currentWeekStart.toLocaleDateString('en-US', { weekday: 'long' })})`);
    console.log(`End: ${today.toISOString().split('T')[0]} (${today.toLocaleDateString('en-US', { weekday: 'long' })})`);
    console.log('');
    
    try {
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
        
        console.log(`📈 Total stage changes: ${stageChanges.length}`);
        
        // Focus on Monday events that might be showing on Sunday
        console.log('\\n🔍 ANALYZING MONDAY EVENTS (Sept 9th):');
        console.log('-'.repeat(42));
        
        const mondayEvents = stageChanges.filter(change => {
            const changeDate = new Date(change.changed_at);
            const utcDate = changeDate.toISOString().split('T')[0];
            return utcDate === '2025-09-09';
        }).slice(0, 10);
        
        console.log(`Monday events found: ${mondayEvents.length}`);
        
        mondayEvents.forEach(event => {
            const changeDate = new Date(event.changed_at);
            const utcDate = changeDate.toISOString().split('T')[0];
            const easternDate = new Date(changeDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
            const easternDateStr = easternDate.toISOString().split('T')[0];
            
            console.log(`\\n${event.first_name} ${event.last_name}: ${event.stage_to}`);
            console.log(`  Raw: ${event.changed_at}`);
            console.log(`  UTC date: ${utcDate} (${new Date(utcDate).toLocaleDateString('en-US', { weekday: 'long' })})`);
            console.log(`  Eastern date: ${easternDateStr} (${new Date(easternDateStr).toLocaleDateString('en-US', { weekday: 'long' })})`);
            console.log(`  Time: ${changeDate.toTimeString().split(' ')[0]} UTC`);
            console.log(`  Eastern time: ${easternDate.toTimeString().split(' ')[0]}`);
            
            // Check if this would cause date shifting
            if (utcDate !== easternDateStr) {
                console.log(`  ⚠️  DATE MISMATCH! UTC=${utcDate}, Eastern=${easternDateStr}`);
            }
        });
        
        // Check what the chart would actually do with these dates
        console.log('\\n📊 CHART DATE PROCESSING SIMULATION:');
        console.log('-'.repeat(38));
        
        const chartEvents = mondayEvents.slice(0, 5);
        chartEvents.forEach(event => {
            const changeDate = new Date(event.changed_at);
            
            // This is what the chart code does: new Date(change.changed_at).toISOString().split('T')[0]
            const chartPlotDate = changeDate.toISOString().split('T')[0];
            const chartPlotDay = new Date(chartPlotDate).toLocaleDateString('en-US', { weekday: 'long' });
            
            console.log(`${event.first_name}: ${event.changed_at}`);
            console.log(`  → Chart plots on: ${chartPlotDate} (${chartPlotDay})`);
            
            // Check if early morning events are being shifted
            const hour = changeDate.getUTCHours();
            if (hour < 4) { // Before 4 AM UTC might be previous day in Eastern
                console.log(`  ⚠️  Early morning UTC (${hour}:00) - likely shows on wrong day`);
            }
        });
        
        // Check for events that occur very late/early that might cause shifting
        console.log('\\n🕐 TIMEZONE ANALYSIS:');
        console.log('-'.repeat(20));
        
        const earlyMorningEvents = stageChanges.filter(change => {
            const changeDate = new Date(change.changed_at);
            const hour = changeDate.getUTCHours();
            return hour >= 0 && hour <= 6; // Early morning UTC hours
        }).slice(0, 5);
        
        console.log(`Early morning UTC events (0-6 AM): ${earlyMorningEvents.length}`);
        earlyMorningEvents.forEach(event => {
            const changeDate = new Date(event.changed_at);
            const utcDate = changeDate.toISOString().split('T')[0];
            const easternTime = changeDate.toLocaleString('en-US', { 
                timeZone: 'America/New_York',
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            console.log(`  ${event.first_name}: UTC ${changeDate.toISOString()}`);
            console.log(`    Eastern: ${easternTime}`);
            console.log(`    Chart plots: ${utcDate}`);
        });
        
    } catch (error) {
        console.error('❌ Error debugging chart dates:', error.message);
    }
}

debugChartDatePlotting().catch(console.error);