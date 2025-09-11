// utils/dataProcessing.js - Complete data processing functions

// Helper function to get week start (Sunday)
export const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

// Helper function to get date range
export const getDateRange = (timeRangeType = 'main', timeRange, customStart = '', customEnd = '', campaignTimeRange, campaignCustomStartDate, campaignCustomEndDate, leadSourceTimeRange, leadSourceCustomStartDate, leadSourceCustomEndDate) => {
  let selectedTimeRange, selectedCustomStart, selectedCustomEnd;
  
  if (timeRangeType === 'campaign') {
    selectedTimeRange = campaignTimeRange;
    selectedCustomStart = campaignCustomStartDate;
    selectedCustomEnd = campaignCustomEndDate;
  } else if (timeRangeType === 'leadSource') {
    selectedTimeRange = leadSourceTimeRange;
    selectedCustomStart = leadSourceCustomStartDate;
    selectedCustomEnd = leadSourceCustomEndDate;
  } else {
    selectedTimeRange = timeRange;
    selectedCustomStart = customStart;
    selectedCustomEnd = customEnd;
  }

  if (selectedCustomStart && selectedCustomEnd) {
    return {
      start: new Date(selectedCustomStart),
      end: new Date(selectedCustomEnd + 'T23:59:59.999Z')
    };
  }

  const end = new Date();
  const start = new Date();

  switch (selectedTimeRange) {
    case 'current_week':
      const currentWeekStart = getWeekStart(end);
      return { start: currentWeekStart, end };
    case 'last_week':
      const lastWeekEnd = new Date(getWeekStart(end));
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      const lastWeekStart = getWeekStart(lastWeekEnd);
      return { start: lastWeekStart, end: lastWeekEnd };
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }
  return { start, end };
};

// Calculate business days (excluding weekends)
export const getBusinessDays = (startDate, endDate) => {
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  let businessDays = 0;
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays++;
    }
  }
  return businessDays;
};

// Calculate average time from ACQ - Qualified to ACQ - Offers Made
// Enhanced approach: Include ALL offers made in the period, regardless of when they were qualified
const calculateAvgTimeToOffer = (stageChanges) => {
  console.log('🔍 CALCULATING AVG TIME TO OFFER (enhanced method)');
  
  // Find all offers made in the current period
  const offersInPeriod = stageChanges.filter(change => 
    change.stage_to === 'ACQ - Offers Made'
  );
  
  console.log(`Found ${offersInPeriod.length} offers made in selected period`);
  
  if (offersInPeriod.length === 0) {
    return 0;
  }
  
  // Group all stage changes by person_id to track individual lead journeys
  const leadJourneys = {};
  
  stageChanges.forEach(change => {
    const personId = change.person_id;
    if (!leadJourneys[personId]) {
      leadJourneys[personId] = [];
    }
    leadJourneys[personId].push({
      stage: change.stage_to,
      timestamp: new Date(change.changed_at),
      first_name: change.first_name,
      last_name: change.last_name
    });
  });

  const timesToOffer = [];
  
  // For each offer made in the period, find their qualification time
  offersInPeriod.forEach(offer => {
    const personId = offer.person_id;
    const journey = leadJourneys[personId] || [];
    
    // Sort by timestamp to ensure chronological order
    journey.sort((a, b) => a.timestamp - b.timestamp);
    
    // Find the first time they entered Qualified stage (anywhere in their journey)
    let qualifiedTime = null;
    for (const stage of journey) {
      if (stage.stage === 'ACQ - Qualified' && !qualifiedTime) {
        qualifiedTime = stage.timestamp;
        break;
      }
    }
    
    if (qualifiedTime) {
      const offerTime = new Date(offer.changed_at);
      const timeDiff = (offerTime - qualifiedTime) / (1000 * 60 * 60 * 24);
      
      if (timeDiff >= 0) { // Only count positive time differences
        timesToOffer.push(timeDiff);
        console.log(`✅ ${offer.first_name} ${offer.last_name}: ${Math.round(timeDiff * 10) / 10} days`);
      }
    } else {
      // NOTE: This means they were qualified outside the current data range
      // For now, we'll exclude these, but ideally we'd query a longer period
      console.log(`❌ ${offer.first_name} ${offer.last_name}: No qualification found in current data (likely qualified outside period)`);
    }
  });

  console.log(`📊 Calculated times for ${timesToOffer.length} of ${offersInPeriod.length} offers`);
  
  // Calculate average
  if (timesToOffer.length === 0) {
    console.log('⚠️ No complete journeys found - consider extending date range for this metric');
    return 0;
  }
  
  const avgDays = timesToOffer.reduce((sum, days) => sum + days, 0) / timesToOffer.length;
  const result = Math.round(avgDays * 10) / 10;
  
  console.log(`📈 Average time to offer: ${result} days (from ${timesToOffer.length} completed journeys)`);
  return result;
};

// Calculate average time to offer using FIXED 30-day period for stable metric
const calculateAvgTimeToOffer30Day = (stageChanges) => {
  console.log('🔍 CALCULATING 30-DAY AVG TIME TO OFFER');
  
  // Always use last 30 days for offers, regardless of selected dashboard period
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  // Find all offers made in the last 30 days
  const offersIn30Days = stageChanges.filter(change => {
    const changeDate = new Date(change.changed_at);
    return change.stage_to === 'ACQ - Offers Made' && 
           changeDate >= thirtyDaysAgo && 
           changeDate <= today;
  });
  
  console.log(`Found ${offersIn30Days.length} offers made in last 30 days`);
  
  if (offersIn30Days.length === 0) {
    return 0;
  }
  
  // Group all stage changes by person_id to track individual lead journeys
  const leadJourneys = {};
  stageChanges.forEach(change => {
    const personId = change.person_id;
    if (!leadJourneys[personId]) {
      leadJourneys[personId] = [];
    }
    leadJourneys[personId].push({
      stage: change.stage_to,
      timestamp: new Date(change.changed_at),
      first_name: change.first_name,
      last_name: change.last_name
    });
  });

  const timesToOffer = [];
  
  // For each offer made in last 30 days, find their qualification time
  offersIn30Days.forEach(offer => {
    const personId = offer.person_id;
    const journey = leadJourneys[personId] || [];
    
    // Sort by timestamp to ensure chronological order
    journey.sort((a, b) => a.timestamp - b.timestamp);
    
    // Find the first time they entered Qualified stage
    let qualifiedTime = null;
    for (const stage of journey) {
      if (stage.stage === 'ACQ - Qualified' && !qualifiedTime) {
        qualifiedTime = stage.timestamp;
        break;
      }
    }
    
    if (qualifiedTime) {
      const offerTime = new Date(offer.changed_at);
      const timeDiff = (offerTime - qualifiedTime) / (1000 * 60 * 60 * 24);
      
      if (timeDiff >= 0) { // Only count positive time differences
        timesToOffer.push(timeDiff);
        console.log(`✅ ${offer.first_name} ${offer.last_name}: ${Math.round(timeDiff * 10) / 10} days`);
      }
    } else {
      console.log(`❌ ${offer.first_name} ${offer.last_name}: No qualification found (qualified before data range)`);
    }
  });

  console.log(`📊 30-day avg calculated from ${timesToOffer.length} of ${offersIn30Days.length} offers`);
  
  // Calculate average
  if (timesToOffer.length === 0) {
    console.log('⚠️ No complete journeys found in 30-day period');
    return 0;
  }
  
  const avgDays = timesToOffer.reduce((sum, days) => sum + days, 0) / timesToOffer.length;
  const result = Math.round(avgDays * 10) / 10;
  
  console.log(`📈 30-day Average Time to Offer: ${result} days (from ${timesToOffer.length} completed journeys)`);
  return result;
};

// Check if a stage change represents a throwaway lead
const isThrowawayLead = (change) => {
  const qualifiedStages = [
    'ACQ - Qualified',
    'Qualified Phase 2 - Day 3 to 2 Weeks',  // Fixed: capital W
    'Qualified Phase 3 - 2 Weeks to 4 Weeks'  // Fixed: capital W
  ];
  
  const throwawayStages = [
    'ACQ - Price Motivated',
    'ACQ - Not Interested',
    'ACQ - Not Ready to Sell',
    'ACQ - Dead / DNC'  // Fixed: space around slash
  ];
  
  const isThrowaway = qualifiedStages.includes(change.stage_from) && throwawayStages.includes(change.stage_to);
  
  // Debug logging for throwaway leads
  if (isThrowaway) {
    console.log('🗑️ Throwaway lead detected:', {
      from: change.stage_from,
      to: change.stage_to,
      person: `${change.first_name} ${change.last_name}`,
      date: change.changed_at
    });
  }
  
  return isThrowaway;
};

// Calculate pipeline velocity - average days from ACQ - Qualified to ACQ - Under Contract (60 day avg)
const calculatePipelineVelocity60Day = (stageChanges) => {
  // Use fixed 60-day period for stable metric
  const today = new Date();
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(today.getDate() - 60);
  
  // Filter for Under Contract transitions in the 60-day period
  const contractsIn60Days = stageChanges.filter(change => {
    const changeDate = new Date(change.changed_at);
    return change.stage_to === 'ACQ - Under Contract' && 
           changeDate >= sixtyDaysAgo && 
           changeDate <= today;
  });
  
  if (contractsIn60Days.length === 0) {
    return 0;
  }
  
  // Group all stage changes by person_id to track individual lead journeys
  const leadJourneys = {};
  stageChanges.forEach(change => {
    const personId = change.person_id;
    if (!leadJourneys[personId]) {
      leadJourneys[personId] = [];
    }
    leadJourneys[personId].push({
      stage: change.stage_to,
      timestamp: new Date(change.changed_at)
    });
  });
  
  const timesToContract = [];
  
  // For each Under Contract transition in 60-day period, find their qualification time
  contractsIn60Days.forEach(contract => {
    const personId = contract.person_id;
    const journey = leadJourneys[personId] || [];
    
    // Sort by timestamp
    journey.sort((a, b) => a.timestamp - b.timestamp);
    
    // Find first qualification
    let qualifiedTime = null;
    for (const stage of journey) {
      if (stage.stage === 'ACQ - Qualified' && !qualifiedTime) {
        qualifiedTime = stage.timestamp;
        break;
      }
    }
    
    if (qualifiedTime) {
      const contractTime = new Date(contract.changed_at);
      const timeDiff = (contractTime - qualifiedTime) / (1000 * 60 * 60 * 24);
      
      if (timeDiff >= 0) {
        timesToContract.push(timeDiff);
      }
    }
  });
  
  // Calculate average
  if (timesToContract.length === 0) {
    return 0;
  }
  
  const avgDays = timesToContract.reduce((sum, days) => sum + days, 0) / timesToContract.length;
  return Math.round(avgDays * 10) / 10; // Round to 1 decimal place
};

// Legacy function - keep for compatibility but not used
const calculatePipelineVelocity = (stageChanges) => {
  return calculatePipelineVelocity60Day(stageChanges);
};

// Fetch real data from API
export const fetchRealData = async (startDate, endDate, businessDays) => {
  console.log('🚀 fetchRealData called');
  try {
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    // Call our API endpoint
    console.log('📡 Making API call with dates:', { startDateStr, endDateStr });
    const response = await fetch('/api/pipeline-data', {
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
    
    // Handle new response format with stage analysis
    const stageChanges = responseData.stageChanges || responseData; // Fallback for backward compatibility
    const stageAnalysis = responseData.stageAnalysis || [];
    
    console.log(`Fetched ${stageChanges.length} stage changes from API`);
    console.log('🔍 STAGE ANALYSIS - All stage transitions in selected period:');
    stageAnalysis.forEach(analysis => {
      console.log(`  ${analysis.stage_from || 'NULL'} → ${analysis.stage_to}: ${analysis.count} times`);
    });
    
    // Debug: Find ALL transitions to "ACQ - Offers Made" with names
    console.log('\n🎯 ALL OFFERS MADE TRANSITIONS:');
    const offersTransitions = stageChanges.filter(change => change.stage_to === 'ACQ - Offers Made');
    console.log(`Found ${offersTransitions.length} total transitions to "ACQ - Offers Made"`);
    offersTransitions.forEach((offer, index) => {
      console.log(`  ${index + 1}. ${offer.first_name} ${offer.last_name} - ${offer.changed_at} (from: ${offer.stage_from})`);
    });
    
    // Debug: Search for specific known leads that moved to offers made today
    console.log('\n🔍 SEARCHING FOR SPECIFIC KNOWN OFFERS:');
    const knownOffers = ['Kathryn Bishop', 'Ricky Styles', 'Douglas Barbee'];
    knownOffers.forEach(fullName => {
      const [firstName, lastName] = fullName.split(' ');
      const foundTransition = stageChanges.find(change => 
        change.first_name === firstName && 
        change.last_name === lastName && 
        change.stage_to === 'ACQ - Offers Made'
      );
      if (foundTransition) {
        console.log(`  ✅ ${fullName}: FOUND - ${foundTransition.changed_at} (from: ${foundTransition.stage_from})`);
      } else {
        console.log(`  ❌ ${fullName}: NOT FOUND in current data`);
      }
    });
    
    return processSupabaseData(stageChanges, startDate, endDate, businessDays);
    
  } catch (error) {
    console.error('💥 ERROR in fetchRealData - This will trigger the error handler that resets offers to 0:', error);
    console.error('Error details:', error.message, error.stack);
    throw error;
  }
};

// Process Supabase data into dashboard format
export const processSupabaseData = (stageChanges, startDate, endDate, businessDays) => {
  // Filter out obvious bulk import data that causes chart issues
  const cleanedStageChanges = stageChanges.filter(change => {
    // Filter out the specific problematic bulk import timestamps
    const timestamp = change.changed_at;
    
    // Remove bulk imports from 2025-09-08 that end in .732Z or .731Z (thousands of identical records)
    if (timestamp.includes('2025-09-08T23:56:19.732Z') || 
        timestamp.includes('2025-09-08T23:56:19.731Z')) {
      return false;
    }
    
    return true;
  });
  
  const filteredCount = stageChanges.length - cleanedStageChanges.length;
  if (filteredCount > 0) {
    console.log(`🧹 Filtered out ${filteredCount} bulk import records from 2025-09-08`);
  }
  
  // Filter stage changes to only include the requested period for charts/metrics
  // But keep all data for Time to Offer calculation
  const requestedPeriodChanges = cleanedStageChanges.filter(change => {
    const changeDate = new Date(change.changed_at);
    return changeDate >= startDate && changeDate <= endDate;
  });
  
  console.log(`📊 Total data: ${stageChanges.length} changes, Requested period: ${requestedPeriodChanges.length} changes`);
  // Calculate total days inclusive of both start and end dates
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  
  // Create daily buckets (including weekends for charts)
  const dailyData = [];
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    dailyData.push({
      date: date.toISOString().split('T')[0],
      qualified: 0,
      offers: 0,
      priceMotivated: 0,
      throwawayLeads: 0,
      dateFormatted: date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        weekday: 'short'
      })
    });
  }
  
  console.log(`🗓️  DAILY BUCKETS CREATED: ${dailyData.map(d => d.date).join(', ')}`);
  console.log(`📅 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} (${totalDays} days)`);

  // Debug: Log unique stage transitions to understand data structure
  const stageTransitions = new Set();
  requestedPeriodChanges.forEach(change => {
    if (change.stage_from && change.stage_to) {
      stageTransitions.add(`${change.stage_from} → ${change.stage_to}`);
    }
  });
  console.log('📊 Unique stage transitions in requested period:', Array.from(stageTransitions).slice(0, 10));

  // Count stage changes by day and stage (only for requested period)
  requestedPeriodChanges.forEach(change => {
    const changeDate = new Date(change.changed_at).toISOString().split('T')[0];
    const dayData = dailyData.find(d => d.date === changeDate);
    
    // Debug for Kathryn Bishop's offer specifically
    if (change.stage_to === 'ACQ - Offers Made' && change.first_name === 'Kathryn') {
      console.log(`🔍 DAILY BUCKET DEBUG - Kathryn Bishop:`);
      console.log(`  - changeDate: ${changeDate}`);
      console.log(`  - available dates in dailyData: [${dailyData.map(d => d.date).join(', ')}]`);
      console.log(`  - dayData found: ${dayData ? 'YES' : 'NO'}`);
    }
    
    if (dayData) {
      if (change.stage_to === 'ACQ - Qualified') {
        dayData.qualified++;
      } else if (change.stage_to === 'ACQ - Offers Made') {
        console.log(`📅 Adding offer to daily bucket: ${change.first_name} ${change.last_name} on ${changeDate}`);
        dayData.offers++;
      } else if (change.stage_to === 'ACQ - Price Motivated') {
        dayData.priceMotivated++;
      } else if (isThrowawayLead(change)) {
        dayData.throwawayLeads++;
      }
    }
  });

  // Generate weekly data
  const weeks = new Map();
  dailyData.forEach(day => {
    const date = new Date(day.date);
    const weekStart = getWeekStart(date);
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!weeks.has(weekKey)) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weeks.set(weekKey, {
        date: weekKey,
        qualified: 0,
        offers: 0,
        priceMotivated: 0,
        throwawayLeads: 0,
        dateFormatted: `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      });
    }

    const weekData = weeks.get(weekKey);
    weekData.qualified += day.qualified;
    weekData.offers += day.offers;
    weekData.priceMotivated += day.priceMotivated;
    weekData.throwawayLeads += day.throwawayLeads;
  });

  const weeklyData = Array.from(weeks.values()).sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculate totals
  const qualifiedTotal = dailyData.reduce((sum, day) => sum + day.qualified, 0);
  const offersTotal = dailyData.reduce((sum, day) => sum + day.offers, 0);
  const priceMotivatedTotal = dailyData.reduce((sum, day) => sum + day.priceMotivated, 0);
  const throwawayTotal = dailyData.reduce((sum, day) => sum + day.throwawayLeads, 0);
  
  console.log('📊 TOTALS CALCULATED:');
  console.log(`  - offersTotal (from daily buckets): ${offersTotal}`);
  
  // Week comparisons - always calculate based on actual current date for consistency
  const today = new Date();
  // Set today to end of day to include all changes that happened today
  today.setHours(23, 59, 59, 999);
  const currentWeekStart = getWeekStart(new Date());
  // Set week start to beginning of day
  currentWeekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(currentWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(currentWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

  let qualifiedThisWeek = 0, qualifiedLastWeek = 0;
  let offersThisWeek = 0, offersLastWeek = 0;
  let priceMotivatedThisWeek = 0, priceMotivatedLastWeek = 0;

  // Calculate week comparisons (use filtered data for period-specific metrics)
  const allStageChanges = requestedPeriodChanges;
  
  // Calculate current week totals
  qualifiedThisWeek = allStageChanges
    .filter(change => {
      const changeDate = new Date(change.changed_at);
      return changeDate >= currentWeekStart && changeDate <= today && change.stage_to === 'ACQ - Qualified';
    }).length;
  
  const offersThisWeekData = allStageChanges
    .filter(change => {
      const changeDate = new Date(change.changed_at);
      const isOfferStage = change.stage_to === 'ACQ - Offers Made';
      const isInDateRange = changeDate >= currentWeekStart && changeDate <= today;
      
      if (isOfferStage) {
        console.log(`🎯 OFFER FOUND: ${change.first_name} ${change.last_name} - In range: ${isInDateRange}`);
      }
      
      return isInDateRange && isOfferStage;
    });
  offersThisWeek = offersThisWeekData.length;
  
  // Debug logging
  console.log(`FRONTEND DEBUG - Current week: ${currentWeekStart.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`);
  console.log(`FRONTEND DEBUG - Total stage changes received: ${allStageChanges.length}`);
  console.log(`FRONTEND DEBUG - Offers this week calculated: ${offersThisWeek}`);
  offersThisWeekData.forEach(offer => {
    console.log(`  - ${offer.changed_at}: ${offer.first_name} ${offer.last_name}`);
  });
  
  // COMPARISON DEBUG - Why is daily total 0 while weekly calculation shows 1?
  console.log('🔍 COMPARISON DEBUG:');
  console.log(`  - offersTotal (from daily buckets): ${offersTotal}`);
  console.log(`  - offersThisWeek (from weekly calculation): ${offersThisWeek}`);
  
  priceMotivatedThisWeek = allStageChanges
    .filter(change => {
      const changeDate = new Date(change.changed_at);
      return changeDate >= currentWeekStart && changeDate <= today && change.stage_to === 'ACQ - Price Motivated';
    }).length;
  
  // Calculate last week totals
  qualifiedLastWeek = allStageChanges
    .filter(change => {
      const changeDate = new Date(change.changed_at);
      return changeDate >= lastWeekStart && changeDate <= lastWeekEnd && change.stage_to === 'ACQ - Qualified';
    }).length;
  
  offersLastWeek = allStageChanges
    .filter(change => {
      const changeDate = new Date(change.changed_at);
      return changeDate >= lastWeekStart && changeDate <= lastWeekEnd && change.stage_to === 'ACQ - Offers Made';
    }).length;
  
  priceMotivatedLastWeek = allStageChanges
    .filter(change => {
      const changeDate = new Date(change.changed_at);
      return changeDate >= lastWeekStart && changeDate <= lastWeekEnd && change.stage_to === 'ACQ - Price Motivated';
    }).length;

  // Process recent activity (last 100, newest first) - only show bar chart stages + throwaway leads
  const barChartStages = [
    'ACQ - Qualified',
    'ACQ - Offers Made', 
    'ACQ - Price Motivated'
  ];
  
  console.log('📋 Activity table will show these stages + throwaway leads:', barChartStages);
  
  const recentActivity = requestedPeriodChanges
    .filter(change => {
      // Show bar chart stages OR throwaway lead transitions
      const isBarChartStage = barChartStages.includes(change.stage_to);
      const isThrowaway = isThrowawayLead(change);
      
      // Debug: log what's being filtered
      if (!isBarChartStage && !isThrowaway) {
        console.log('🚫 Filtered out stage:', change.stage_to, 'from:', change.stage_from);
      }
      
      return isBarChartStage || isThrowaway;
    })
    .slice(0, 100)
    .map(change => ({
      name: `${change.first_name || 'Unknown'} ${change.last_name || ''}`.trim(),
      stage: isThrowawayLead(change) ? 'Throwaway Lead' : change.stage_to,
      actual_stage: change.stage_to,  // Keep original stage for reference
      campaign_code: change.campaign_id || 'No Campaign',
      lead_source: change.lead_source_tag || 'Unknown',
      created_at: change.changed_at,
      previous_stage: change.stage_from || 'Unknown'
    }));

  // Get unique campaigns for filter dropdown (from requested period)
  const availableCampaigns = [...new Set(requestedPeriodChanges
    .map(change => change.campaign_id)
    .filter(campaign => campaign && campaign !== null)
  )].sort();

  // Add "No Campaign" if some records don't have campaign_id
  if (requestedPeriodChanges.some(change => !change.campaign_id)) {
    availableCampaigns.push('No Campaign');
  }

  // Calculate campaign metrics (from requested period)
  const campaignCounts = {};
  requestedPeriodChanges.forEach(change => {
    if (change.stage_to === 'ACQ - Qualified') {
      const campaign = change.campaign_id || 'No Campaign';
      campaignCounts[campaign] = (campaignCounts[campaign] || 0) + 1;
    }
  });

  const campaignMetrics = Object.entries(campaignCounts).map(([campaign, qualified]) => ({
    campaign,
    qualified,
    offers: 0,
    priceMotivated: 0,
    leads: 0
  }));

  // Calculate lead source metrics for initial load (from requested period)
  const leadSourceCounts = {};
  requestedPeriodChanges.forEach(change => {
    if (change.stage_to === 'ACQ - Qualified') {
      const source = change.lead_source_tag || 'Unknown';
      leadSourceCounts[source] = (leadSourceCounts[source] || 0) + 1;
    }
  });

  const leadSourceMetrics = Object.entries(leadSourceCounts).map(([source, count]) => ({
    name: source,
    value: count,
    percentage: 0
  }));

  // Calculate percentages
  const leadSourceTotal = leadSourceMetrics.reduce((sum, item) => sum + item.value, 0);
  leadSourceMetrics.forEach(item => {
    item.percentage = leadSourceTotal > 0 ? Math.round((item.value / leadSourceTotal) * 100) : 0;
  });

  // Calculate advanced metrics
  const qualifiedToOfferRate = qualifiedTotal > 0 ? Math.round((offersTotal / qualifiedTotal) * 100) : 0;
  const qualifiedToPriceMotivatedRate = qualifiedTotal > 0 ? Math.round((priceMotivatedTotal / qualifiedTotal) * 100) : 0;
  
  // Calculate real average time to offer (always use 30-day period for stability)
  const avgTimeToOffer = calculateAvgTimeToOffer30Day(cleanedStageChanges);
  
  // Calculate pipeline velocity - average days from Qualified to Under Contract
  const pipelineVelocity = calculatePipelineVelocity(cleanedStageChanges);

  return {
    dailyMetrics: dailyData,
    weeklyMetrics: weeklyData,
    campaignMetrics,
    leadSourceMetrics,
    summary: {
      qualifiedTotal,
      qualifiedThisWeek,
      qualifiedLastWeek,
      offersTotal,
      offersThisWeek,
      offersLastWeek,
      priceMotivatedTotal,
      priceMotivatedThisWeek,
      priceMotivatedLastWeek,
      throwawayTotal,
      qualifiedAvgPerDay: businessDays > 0 ? Math.round((qualifiedTotal / businessDays) * 10) / 10 : 0,
      offersAvgPerDay: businessDays > 0 ? Math.round((offersTotal / businessDays) * 10) / 10 : 0,
      priceMotivatedAvgPerDay: businessDays > 0 ? Math.round((priceMotivatedTotal / businessDays) * 10) / 10 : 0,
      qualifiedToOfferRate,
      qualifiedToPriceMotivatedRate,
      avgTimeToOffer,
      pipelineVelocity
    },
    recentActivity,
    filteredActivity: recentActivity,
    availableCampaigns
  };
};

// Fetch campaign data separately
export const fetchCampaignData = async (campaignTimeRange, campaignCustomStartDate, campaignCustomEndDate) => {
  try {
    // Simplified date range calculation
    let start, end;
    
    if (campaignCustomStartDate && campaignCustomEndDate) {
      start = new Date(campaignCustomStartDate);
      end = new Date(campaignCustomEndDate + 'T23:59:59.999Z');
    } else {
      end = new Date();
      start = new Date();
      
      switch (campaignTimeRange) {
        case 'current_week':
          const currentWeekStart = getWeekStart(end);
          start = currentWeekStart;
          break;
        case 'last_week':
          const lastWeekEnd = new Date(getWeekStart(end));
          lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
          start = getWeekStart(lastWeekEnd);
          end = lastWeekEnd;
          break;
        case '30d':
          start.setDate(start.getDate() - 30);
          break;
        case '90d':
          start.setDate(start.getDate() - 90);
          break;
        default:
          // Default to current week, not 30 days
          const defaultWeekStart = getWeekStart(end);
          start = defaultWeekStart;
      }
    }

    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];
    
    const response = await fetch('/api/pipeline-data', {
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
    const stageChanges = responseData.stageChanges || responseData; // Handle new format
    
    // Calculate campaign metrics
    const campaignCounts = {};
    stageChanges.forEach(change => {
      if (change.stage_to === 'ACQ - Qualified') {
        const campaign = change.campaign_id || 'No Campaign';
        campaignCounts[campaign] = (campaignCounts[campaign] || 0) + 1;
      }
    });

    const campaignMetrics = Object.entries(campaignCounts).map(([campaign, qualified]) => ({
      campaign,
      qualified,
      offers: 0,
      priceMotivated: 0,
      leads: 0
    }));

    return campaignMetrics;
    
  } catch (error) {
    console.error('Error fetching campaign data:', error);
    throw error;
  }
};

// Fetch lead source data separately
export const fetchLeadSourceData = async (leadSourceTimeRange, leadSourceCustomStartDate, leadSourceCustomEndDate) => {
  try {
    // Simplified date range calculation
    let start, end;
    
    if (leadSourceCustomStartDate && leadSourceCustomEndDate) {
      start = new Date(leadSourceCustomStartDate);
      end = new Date(leadSourceCustomEndDate + 'T23:59:59.999Z');
    } else {
      end = new Date();
      start = new Date();
      
      switch (leadSourceTimeRange) {
        case 'current_week':
          const currentWeekStart = getWeekStart(end);
          start = currentWeekStart;
          break;
        case 'last_week':
          const lastWeekEnd = new Date(getWeekStart(end));
          lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
          start = getWeekStart(lastWeekEnd);
          end = lastWeekEnd;
          break;
        case '30d':
          start.setDate(start.getDate() - 30);
          break;
        case '90d':
          start.setDate(start.getDate() - 90);
          break;
        default:
          // Default to current week, not 30 days
          const defaultWeekStart = getWeekStart(end);
          start = defaultWeekStart;
      }
    }

    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];
    
    console.log('Fetching lead source data for:', startDateStr, 'to', endDateStr);
    
    const response = await fetch('/api/pipeline-data', {
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
    const stageChanges = responseData.stageChanges || responseData; // Handle new format
    console.log('Lead source stage changes received:', stageChanges.length);
    
    // Calculate lead source metrics for qualified leads only
    const leadSourceCounts = {};
    stageChanges.forEach(change => {
      if (change.stage_to === 'ACQ - Qualified') {
        const source = change.lead_source_tag || 'Unknown';
        leadSourceCounts[source] = (leadSourceCounts[source] || 0) + 1;
      }
    });

    console.log('Lead source counts:', leadSourceCounts);

    const leadSourceMetrics = Object.entries(leadSourceCounts).map(([source, count]) => ({
      name: source,
      value: count,
      percentage: 0
    }));

    // Calculate percentages
    const total = leadSourceMetrics.reduce((sum, item) => sum + item.value, 0);
    leadSourceMetrics.forEach(item => {
      item.percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
    });

    console.log('Final lead source metrics:', leadSourceMetrics);
    return leadSourceMetrics;
    
  } catch (error) {
    console.error('Error fetching lead source data:', error);
    throw error;
  }
};