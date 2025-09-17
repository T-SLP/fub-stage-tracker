// Investigate why 14 offers but only 2 complete journeys
async function investigateOfferJourneys() {
    console.log('🔍 INVESTIGATING OFFER JOURNEYS');
    console.log('=' .repeat(35));
    console.log('Why 14 offers but only 2 complete Qualified → Offers journeys?\\n');
    
    // Use current week
    const today = new Date();
    const getWeekStart = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        return new Date(d.setDate(diff));
    };
    
    const startDate = getWeekStart(today);
    const endDate = today;
    
    console.log(`📅 Current Week: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}\\n`);
    
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
        
        // Find all offers made this week
        const offersThisWeek = stageChanges.filter(change => change.stage_to === 'ACQ - Offers Made');
        
        console.log(`🎯 ALL OFFERS MADE THIS WEEK: ${offersThisWeek.length}`);
        console.log('-'.repeat(30));
        
        offersThisWeek.forEach((offer, index) => {
            const offerTime = new Date(offer.changed_at);
            console.log(`${index + 1}. ${offer.first_name} ${offer.last_name}`);
            console.log(`   Offered: ${offerTime.toLocaleString()}`);
            console.log(`   Person ID: ${offer.person_id}`);
            console.log('');
        });
        
        // For each offer, check if they had a qualifying stage in the SAME week
        console.log('\\n🔍 CHECKING QUALIFICATION HISTORY FOR EACH OFFER:');
        console.log('-'.repeat(50));
        
        let completeJourneys = 0;
        let qualifiedOutsideWeek = 0;
        let noQualificationFound = 0;
        
        for (const offer of offersThisWeek) {
            console.log(`\\n👤 ${offer.first_name} ${offer.last_name} (ID: ${offer.person_id})`);
            
            // Find all stage changes for this person
            const personChanges = stageChanges.filter(change => change.person_id === offer.person_id);
            const qualifiedChanges = personChanges.filter(change => change.stage_to === 'ACQ - Qualified');
            
            if (qualifiedChanges.length > 0) {
                const latestQualified = qualifiedChanges
                    .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at))[0];
                
                const qualifiedTime = new Date(latestQualified.changed_at);
                const offerTime = new Date(offer.changed_at);
                
                console.log(`   Latest Qualified: ${qualifiedTime.toLocaleString()}`);
                console.log(`   Offered: ${offerTime.toLocaleString()}`);
                
                if (qualifiedTime >= startDate && qualifiedTime <= endDate) {
                    const timeDiff = (offerTime - qualifiedTime) / (1000 * 60 * 60 * 24);
                    console.log(`   ✅ COMPLETE JOURNEY: ${Math.round(timeDiff * 10) / 10} days`);
                    completeJourneys++;
                } else {
                    console.log(`   ❌ Qualified OUTSIDE current week`);
                    qualifiedOutsideWeek++;
                }
            } else {
                console.log(`   ❌ NO qualification found in this week's data`);
                noQualificationFound++;
            }
        }
        
        console.log('\\n📊 SUMMARY:');
        console.log('-'.repeat(12));
        console.log(`Total Offers Made: ${offersThisWeek.length}`);
        console.log(`Complete Journeys (Qualified → Offered this week): ${completeJourneys}`);
        console.log(`Qualified Outside Week: ${qualifiedOutsideWeek}`);
        console.log(`No Qualification Found: ${noQualificationFound}`);
        
        console.log('\\n💡 EXPLANATION:');
        console.log('-'.repeat(15));
        console.log('Most offers this week came from leads qualified in previous weeks/months.');
        console.log('Time to Offer only counts journeys where BOTH stages happen in the selected period.');
        console.log('This is why you see 14 offers but only 2 complete journeys for calculation.');
        
    } catch (error) {
        console.error('❌ Error investigating offer journeys:', error.message);
    }
}

investigateOfferJourneys().catch(console.error);