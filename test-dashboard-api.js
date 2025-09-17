// Test dashboard API to see if it's returning latest Todd changes
async function testDashboardAPI() {
    console.log('🔍 TESTING DASHBOARD API');
    console.log('=' .repeat(30));
    console.log('Checking if latest Todd changes appear in dashboard API\n');
    
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 7); // Last 7 days
    
    const requestBody = {
        startDate: startDate.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
    };
    
    console.log(`Date range: ${requestBody.startDate} to ${requestBody.endDate}`);
    console.log('');
    
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
        
        console.log('📊 API RESPONSE ANALYSIS:');
        console.log('-'.repeat(25));
        
        console.log(`Total records returned: ${data.stageChanges?.length || 0}`);
        
        // Show debug info if available
        if (data.debug) {
            console.log(`Debug info: ${data.debug.totalChanges} changes, ${data.debug.offersInPeriod} offers`);
        }
        
        if (data.stageChanges && data.stageChanges.length > 0) {
            // Look for Todd's records
            const toddRecords = data.stageChanges.filter(record => 
                record.first_name?.toLowerCase().includes('todd') && 
                record.last_name?.toLowerCase().includes('brumm')
            );
            
            console.log(`Todd Brumm records: ${toddRecords.length}`);
            
            if (toddRecords.length > 0) {
                console.log('\nTodd\'s records in API:');
                toddRecords.forEach((record, index) => {
                    const changeDate = new Date(record.changed_at);
                    const ago = Math.round((Date.now() - changeDate.getTime()) / (1000 * 60));
                    
                    console.log(`  ${index + 1}. ${record.stage_from || 'NEW'} → ${record.stage_to}`);
                    console.log(`     ${changeDate.toLocaleString()} (${ago} min ago)`);
                });
            } else {
                console.log('❌ No Todd records found in API response');
            }
            
            // Check today's records
            const todaysRecords = data.stageChanges.filter(record => {
                const recordDate = new Date(record.changed_at).toDateString();
                const todayDate = new Date().toDateString();
                return recordDate === todayDate;
            });
            
            console.log(`\nToday's records: ${todaysRecords.length}`);
            
            if (todaysRecords.length > 0) {
                console.log('Recent stage changes:');
                todaysRecords.slice(0, 5).forEach((record, index) => {
                    const changeTime = new Date(record.changed_at).toLocaleTimeString();
                    console.log(`  ${index + 1}. ${record.first_name} ${record.last_name} → ${record.stage_to} (${changeTime})`);
                });
            }
            
        } else {
            console.log('❌ No stage changes returned by API');
        }
        
        // Check stage analysis
        if (data.stageAnalysis && data.stageAnalysis.length > 0) {
            console.log('\n📈 STAGE ANALYSIS:');
            console.log('-'.repeat(18));
            
            const relevantStages = data.stageAnalysis.filter(stage => 
                stage.stage_to.includes('Offers Made') || 
                stage.stage_to.includes('Qualified Phase')
            );
            
            console.log('Relevant stages found:');
            relevantStages.forEach(stage => {
                console.log(`  ${stage.stage_to}: ${stage.count} records`);
            });
        }
        
        console.log('\n💡 DASHBOARD TROUBLESHOOTING:');
        console.log('-'.repeat(30));
        
        if (data.stageChanges && data.stageChanges.length > 0) {
            const hasRecentRecords = data.stageChanges.some(record => {
                const recordTime = new Date(record.changed_at).getTime();
                const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                return recordTime > fiveMinutesAgo;
            });
            
            if (hasRecentRecords) {
                console.log('✅ API has recent records - likely dashboard caching issue');
                console.log('   Try: Hard refresh (Ctrl+Shift+R) or clear browser cache');
            } else {
                console.log('⚠️  No very recent records in API');
                console.log('   Dashboard may need time to update or has filtering');
            }
        } else {
            console.log('❌ API returning no data - check date range or database connection');
        }
        
    } catch (error) {
        console.error('❌ Error testing dashboard API:', error.message);
    }
}

testDashboardAPI().catch(console.error);