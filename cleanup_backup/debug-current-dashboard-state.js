// Debug script to examine the exact current dashboard state
// This will show what the dashboard is currently displaying

const fetch = require('http').request;

// Helper functions from dataProcessing.js
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

// Test all possible time ranges
async function testAllTimeRanges() {
  console.log('🔍 TESTING ALL TIME RANGES TO FIND THE DISCREPANCY\n');

  const timeRanges = [
    { name: 'Current Week', start: getWeekStart(new Date()), end: new Date() },
    {
      name: 'Last Week',
      start: (() => {
        const lastWeekEnd = new Date(getWeekStart(new Date()));
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
        return getWeekStart(lastWeekEnd);
      })(),
      end: (() => {
        const lastWeekEnd = new Date(getWeekStart(new Date()));
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
        return lastWeekEnd;
      })()
    },
    {
      name: 'Last 30 Days',
      start: (() => {
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return start;
      })(),
      end: new Date()
    }
  ];

  for (const range of timeRanges) {
    console.log(`\n📅 TESTING: ${range.name}`);
    console.log(`   Range: ${range.start.toISOString().split('T')[0]} to ${range.end.toISOString().split('T')[0]}`);

    await testTimeRange(range.start, range.end, range.name);
  }
}

async function testTimeRange(start, end, rangeName) {
  try {
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    // Make the API call using built-in http module
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
      const req = fetch(options, (res) => {
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

    // Filter to the requested period
    const requestedPeriodChanges = stageChanges.filter(change => {
      const changeDate = new Date(change.changed_at);
      return changeDate >= start && changeDate <= end;
    });

    // Find throwaway transitions (table logic)
    const throwawayTransitions = requestedPeriodChanges.filter(change => isThrowawayLead(change));

    console.log(`   Table count (all in range): ${throwawayTransitions.length}`);

    // Simulate dashboard daily bucket logic
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const dailyData = [];

    for (let i = 0; i < totalDays; i++) {
      const date = new Date(start);
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

    // Count throwaway leads by day (dashboard logic)
    let dashboardCount = 0;
    requestedPeriodChanges.forEach(change => {
      if (isThrowawayLead(change)) {
        const changeDateTime = new Date(change.changed_at);
        const easternDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(changeDateTime);

        const dayData = dailyData.find(d => d.date === easternDateStr);
        if (dayData) {
          dayData.throwawayLeads++;
          dashboardCount++;
        }
      }
    });

    const totalFromDailyBuckets = dailyData.reduce((sum, day) => sum + day.throwawayLeads, 0);

    console.log(`   Dashboard count (daily buckets): ${totalFromDailyBuckets}`);
    console.log(`   Difference: ${throwawayTransitions.length - totalFromDailyBuckets}`);

    if (throwawayTransitions.length !== totalFromDailyBuckets) {
      console.log(`   ❗ DISCREPANCY FOUND IN ${rangeName}!`);

      // Show details of excluded transitions
      throwawayTransitions.forEach(transition => {
        const changeDateTime = new Date(transition.changed_at);
        const easternDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(changeDateTime);

        const dayData = dailyData.find(d => d.date === easternDateStr);
        if (!dayData) {
          console.log(`     ❌ EXCLUDED: ${transition.first_name} ${transition.last_name}`);
          console.log(`        UTC: ${transition.changed_at}`);
          console.log(`        Eastern Date: ${easternDateStr} (no matching day bucket)`);
        }
      });
    } else {
      console.log(`   ✅ No discrepancy in ${rangeName}`);
    }

  } catch (error) {
    console.error(`   ❌ Error testing ${rangeName}:`, error.message);
  }
}

testAllTimeRanges();