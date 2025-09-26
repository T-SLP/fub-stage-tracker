// Debug script to investigate throwaway lead timestamp discrepancy
// This will help identify why dashboard shows 3 but table shows 4 throwaway leads

// Use global fetch (available in Node.js 18+)

// Helper function to get week start (Sunday) - copied from dataProcessing.js
const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

// Get last week date range
const getLastWeekRange = () => {
  const today = new Date();
  const lastWeekEnd = new Date(getWeekStart(today));
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  const lastWeekStart = getWeekStart(lastWeekEnd);
  return { start: lastWeekStart, end: lastWeekEnd };
};

// Check if a stage change represents a throwaway lead - copied from dataProcessing.js
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

async function debugThrowawayTimestamps() {
  console.log('🔍 DEBUGGING THROWAWAY LEAD TIMESTAMP DISCREPANCY\n');

  try {
    // Get last week's date range
    const { start, end } = getLastWeekRange();
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    console.log(`📅 Last week range: ${startDateStr} to ${endDateStr}`);
    console.log(`📅 Start: ${start.toISOString()}`);
    console.log(`📅 End: ${end.toISOString()}\n`);

    // Fetch data from API
    const response = await fetch('http://localhost:3000/api/pipeline-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: startDateStr,
        endDate: endDateStr
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const responseData = await response.json();
    const stageChanges = responseData.stageChanges || responseData;

    console.log(`📊 Total stage changes received: ${stageChanges.length}\n`);

    // Find all throwaway lead transitions in the entire dataset
    const allThrowawayTransitions = stageChanges.filter(change => isThrowawayLead(change));
    console.log(`🗑️ ALL THROWAWAY TRANSITIONS FOUND: ${allThrowawayTransitions.length}`);

    allThrowawayTransitions.forEach((transition, index) => {
      const changeDateTime = new Date(transition.changed_at);

      // Convert to Eastern Time for comparison
      const easternDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(changeDateTime);

      const easternTimeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(changeDateTime);

      console.log(`  ${index + 1}. ${transition.first_name} ${transition.last_name}`);
      console.log(`     From: ${transition.stage_from} → To: ${transition.stage_to}`);
      console.log(`     UTC: ${transition.changed_at}`);
      console.log(`     Eastern Date: ${easternDateStr}`);
      console.log(`     Eastern Time: ${easternTimeStr}`);
      console.log(`     In last week range? ${changeDateTime >= start && changeDateTime <= end}`);
      console.log('');
    });

    // Filter to last week's range (how the dashboard API filters)
    const lastWeekThrowawayTransitions = stageChanges.filter(change => {
      const changeDate = new Date(change.changed_at);
      return changeDate >= start && changeDate <= end && isThrowawayLead(change);
    });

    console.log(`\n📊 THROWAWAY TRANSITIONS IN LAST WEEK DATE RANGE: ${lastWeekThrowawayTransitions.length}`);

    // Now simulate the daily bucket creation logic from dataProcessing.js
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const dailyData = [];

    for (let i = 0; i < totalDays; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);

      // Use Eastern Time for consistent date bucket creation
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

    console.log(`\n🗓️ DAILY BUCKETS CREATED: ${dailyData.map(d => d.date).join(', ')}`);

    // Count throwaway leads by day (simulating dashboard logic)
    let dashboardCount = 0;
    lastWeekThrowawayTransitions.forEach(change => {
      const changeDateTime = new Date(change.changed_at);

      // Convert to Eastern Time before extracting date
      const easternDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(changeDateTime);

      const dayData = dailyData.find(d => d.date === easternDateStr);

      console.log(`\n🔍 Processing: ${change.first_name} ${change.last_name}`);
      console.log(`   UTC: ${change.changed_at}`);
      console.log(`   Eastern Date: ${easternDateStr}`);
      console.log(`   Day bucket found: ${dayData ? 'YES' : 'NO'}`);

      if (dayData) {
        dayData.throwawayLeads++;
        dashboardCount++;
        console.log(`   ✅ Added to dashboard count (now ${dashboardCount})`);
      } else {
        console.log(`   ❌ NOT added to dashboard count - no matching day bucket`);
      }
    });

    // Calculate totals
    const totalFromDailyBuckets = dailyData.reduce((sum, day) => sum + day.throwawayLeads, 0);

    console.log(`\n📊 FINAL COMPARISON:`);
    console.log(`   Table count (all in date range): ${lastWeekThrowawayTransitions.length}`);
    console.log(`   Dashboard count (daily buckets): ${totalFromDailyBuckets}`);
    console.log(`   Difference: ${lastWeekThrowawayTransitions.length - totalFromDailyBuckets}`);

    if (lastWeekThrowawayTransitions.length !== totalFromDailyBuckets) {
      console.log(`\n❗ DISCREPANCY CONFIRMED!`);
      console.log(`   The difference is caused by timezone conversion during daily bucket creation.`);
    } else {
      console.log(`\n✅ No discrepancy found in this analysis.`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the debug
debugThrowawayTimestamps();