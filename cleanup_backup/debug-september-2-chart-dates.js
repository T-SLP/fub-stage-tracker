// Debug September 2nd chart date issue
async function debugSeptember2ChartDates() {
    console.log('🐛 DEBUGGING SEPTEMBER 2ND CHART DATE ISSUE');
    console.log('=' .repeat(50));
    console.log('Checking why events appear on Sunday Sept 2nd when there shouldnt be any\n');
    
    // Test current week period (which should include Sept 2nd)
    const today = new Date();
    const startOfWeek = new Date();
    startOfWeek.setDate(today.getDate() - today.getDay()); // Start of current week (Sunday)
    
    console.log(`📅 Current Week Range:`);
    console.log(`Start: ${startOfWeek.toISOString().split('T')[0]} (${startOfWeek.toLocaleDateString('en-US', { weekday: 'long' })})`);
    console.log(`End: ${today.toISOString().split('T')[0]} (${today.toLocaleDateString('en-US', { weekday: 'long' })})`);
    console.log('');
    
    try {
        const response = await fetch('https://fub-stage-tracker.vercel.app/api/pipeline-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startDate: startOfWeek.toISOString().split('T')[0],
                endDate: today.toISOString().split('T')[0]
            })
        });
        
        if (!response.ok) {
            console.log(`❌ API Error: ${response.status} ${response.statusText}`);
            return;
        }
        
        const data = await response.json();
        const stageChanges = data.stageChanges || [];
        
        // Filter for September 2nd specifically
        const sept2Events = stageChanges.filter(change => {
            const changeDate = new Date(change.changed_at);
            const easternDate = new Date(changeDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
            const dateStr = easternDate.toISOString().split('T')[0];
            return dateStr === '2025-09-02' || dateStr === '2024-09-02';
        });
        
        console.log(`🔍 EVENTS ON SEPTEMBER 2ND:`);
        console.log(`Found ${sept2Events.length} events on September 2nd`);
        console.log('');
        
        if (sept2Events.length === 0) {
            console.log('✅ No events found on September 2nd - checking date parsing...');
            
            // Let's check all events from Sept 1-3 to see date parsing
            const surroundingEvents = stageChanges.filter(change => {
                const changeDate = new Date(change.changed_at);
                const easternDate = new Date(changeDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
                const dateStr = easternDate.toISOString().split('T')[0];
                return ['2025-09-01', '2025-09-02', '2025-09-03'].includes(dateStr);
            });
            
            console.log(`Events around September 2nd (Sept 1-3): ${surroundingEvents.length}`);
            surroundingEvents.slice(0, 10).forEach(event => {
                const originalDate = new Date(event.changed_at);
                const easternDate = new Date(originalDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
                
                console.log(`  ${event.first_name} ${event.last_name}: ${event.stage_to}`);
                console.log(`    Original: ${event.changed_at}`);
                console.log(`    Eastern:  ${easternDate.toISOString().split('T')[0]} ${easternDate.toTimeString().split(' ')[0]}`);
                console.log(`    Chart plotting would use: ${easternDate.toISOString().split('T')[0]}`);
            });
            
        } else {
            console.log('📊 Events found on September 2nd:');
            sept2Events.slice(0, 10).forEach(event => {
                const originalDate = new Date(event.changed_at);
                const easternDate = new Date(originalDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
                
                console.log(`  ${event.first_name} ${event.last_name}: ${event.stage_to}`);
                console.log(`    Raw timestamp: ${event.changed_at}`);
                console.log(`    Parsed date: ${originalDate.toISOString()}`);
                console.log(`    Eastern date: ${easternDate.toLocaleDateString()} ${easternDate.toTimeString().split(' ')[0]}`);
                console.log(`    Chart would plot on: ${easternDate.toISOString().split('T')[0]}`);
                console.log('');
            });
            
            if (sept2Events.length > 10) {
                console.log(`    ... and ${sept2Events.length - 10} more`);
            }
        }
        
        console.log('\\n🧪 TESTING CHART DATE LOGIC:');
        console.log('-'.repeat(32));
        
        // Simulate how the chart processes dates
        const chartEvents = stageChanges.filter(change => {
            const changeDate = new Date(change.changed_at);
            return changeDate >= startOfWeek && changeDate <= today;
        }).slice(0, 5);
        
        console.log('Sample events and how they would be plotted:');
        chartEvents.forEach(event => {
            const originalDate = new Date(event.changed_at);
            
            // This is likely how the chart is processing dates
            const easternDate = new Date(originalDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
            const plotDate = easternDate.toISOString().split('T')[0];
            
            console.log(`  ${event.first_name} ${event.last_name}:`);
            console.log(`    Raw: ${event.changed_at}`);
            console.log(`    Charts plots on: ${plotDate} (${new Date(plotDate).toLocaleDateString('en-US', { weekday: 'long' })})`);
        });
        
        console.log('\\n💡 LIKELY ISSUE:');
        console.log('-'.repeat(15));
        console.log('The chart may be:');
        console.log('1. Not properly handling timezone conversion');
        console.log('2. Using UTC dates instead of Eastern Time');
        console.log('3. Have a off-by-one error in date grouping');
        console.log('4. Plotting events from late Monday on Sunday due to timezone shift');
        
    } catch (error) {
        console.error('❌ Error debugging September 2nd dates:', error.message);
    }
}

debugSeptember2ChartDates().catch(console.error);