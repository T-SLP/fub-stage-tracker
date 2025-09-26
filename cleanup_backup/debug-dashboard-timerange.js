// Debug exactly what time range the dashboard is using
// and what the throwaway count should be

// Helper functions
const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

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

async function checkLastWeekSpecifically() {
  console.log('🔍 CHECKING LAST WEEK SPECIFICALLY (Sept 8-14, 2025)\n');

  // Last week range (Sept 8-14, 2025)
  const today = new Date();
  const lastWeekEnd = new Date(getWeekStart(today));
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  const lastWeekStart = getWeekStart(lastWeekEnd);

  const startDateStr = lastWeekStart.toISOString().split('T')[0];
  const endDateStr = lastWeekEnd.toISOString().split('T')[0];

  console.log(`📅 Last Week Range: ${startDateStr} to ${endDateStr}`);
  console.log(`📅 Start: ${lastWeekStart.toISOString()}`);
  console.log(`📅 End: ${lastWeekEnd.toISOString()}\n`);

  try {
    const postData = JSON.stringify({
      startDate: startDateStr,
      endDate: endDateStr
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/pipeline-data',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const response = await new Promise((resolve, reject) => {
      const req = require('http').request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    const stageChanges = response.stageChanges || response;

    // Filter to last week
    const lastWeekChanges = stageChanges.filter(change => {
      const changeDate = new Date(change.changed_at);
      return changeDate >= lastWeekStart && changeDate <= lastWeekEnd;
    });

    // Find throwaway transitions
    const throwawayTransitions = lastWeekChanges.filter(change => isThrowawayLead(change));

    console.log(`📊 Total stage changes in last week: ${lastWeekChanges.length}`);
    console.log(`🗑️ Throwaway transitions found: ${throwawayTransitions.length}\n`);

    throwawayTransitions.forEach((transition, index) => {
      const changeDateTime = new Date(transition.changed_at);
      const easternDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(changeDateTime);

      const easternTime = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(changeDateTime);

      console.log(`  ${index + 1}. ${transition.first_name} ${transition.last_name}`);
      console.log(`     From: ${transition.stage_from} → To: ${transition.stage_to}`);
      console.log(`     UTC: ${transition.changed_at}`);
      console.log(`     Eastern: ${easternDate} at ${easternTime}`);
    });

    // Now simulate the daily bucket logic
    console.log(`\n🗓️ SIMULATING DASHBOARD DAILY BUCKET LOGIC:`);

    const totalDays = Math.ceil((lastWeekEnd - lastWeekStart) / (1000 * 60 * 60 * 24)) + 1;
    const dailyData = [];

    for (let i = 0; i < totalDays; i++) {
      const date = new Date(lastWeekStart);
      date.setDate(date.getDate() + i);

      const easternDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date);

      dailyData.push({
        date: easternDateStr,
        throwawayLeads: 0
      });
    }

    console.log(`   Daily buckets created: ${dailyData.map(d => d.date).join(', ')}`);

    // Count throwaway leads by day
    let dashboardCount = 0;
    throwawayTransitions.forEach(change => {
      const changeDateTime = new Date(change.changed_at);
      const easternDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(changeDateTime);

      const dayData = dailyData.find(d => d.date === easternDateStr);

      console.log(`\n   Processing: ${change.first_name} ${change.last_name}`);
      console.log(`   Eastern Date: ${easternDateStr}`);
      console.log(`   Day bucket found: ${dayData ? 'YES' : 'NO'}`);

      if (dayData) {
        dayData.throwawayLeads++;
        dashboardCount++;
        console.log(`   ✅ Added to dashboard count (now ${dashboardCount})`);
      } else {
        console.log(`   ❌ NOT added - no matching day bucket`);
      }
    });

    const totalFromDailyBuckets = dailyData.reduce((sum, day) => sum + day.throwawayLeads, 0);

    console.log(`\n📊 FINAL LAST WEEK COMPARISON:`);
    console.log(`   Table count (all throwaway transitions): ${throwawayTransitions.length}`);
    console.log(`   Dashboard count (daily buckets): ${totalFromDailyBuckets}`);
    console.log(`   Difference: ${throwawayTransitions.length - totalFromDailyBuckets}`);

    if (throwawayTransitions.length !== totalFromDailyBuckets) {
      console.log(`\n❗ DISCREPANCY CONFIRMED FOR LAST WEEK!`);
    } else {
      console.log(`\n✅ No discrepancy found for last week`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkLastWeekSpecifically();