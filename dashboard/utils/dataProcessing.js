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
const calculateAvgTimeToOffer = (stageChanges) => {
  // Group stage changes by person_id to track individual lead journeys
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

  // Calculate time to offer for each lead that progressed from Qualified to Offers Made
  const timesToOffer = [];
  
  Object.values(leadJourneys).forEach(journey => {
    // Sort by timestamp to ensure chronological order
    journey.sort((a, b) => a.timestamp - b.timestamp);
    
    let qualifiedTime = null;
    
    for (const stage of journey) {
      if (stage.stage === 'ACQ - Qualified' && !qualifiedTime) {
        // Record the first time they entered Qualified stage
        qualifiedTime = stage.timestamp;
      } else if (stage.stage === 'ACQ - Offers Made' && qualifiedTime) {
        // Calculate time difference in days
        const timeDiff = (stage.timestamp - qualifiedTime) / (1000 * 60 * 60 * 24);
        timesToOffer.push(timeDiff);
        break; // Only count the first transition to Offers Made
      }
    }
  });

  // Calculate average
  if (timesToOffer.length === 0) {
    return 0;
  }
  
  const avgDays = timesToOffer.reduce((sum, days) => sum + days, 0) / timesToOffer.length;
  return Math.round(avgDays * 10) / 10; // Round to 1 decimal place
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

// Calculate pipeline velocity - average days from ACQ - Qualified to ACQ - Under Contract
const calculatePipelineVelocity = (stageChanges) => {
  // Group stage changes by person_id to track individual lead journeys
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

  // Calculate time to under contract for each lead that progressed from Qualified to Under Contract
  const timesToContract = [];
  
  Object.values(leadJourneys).forEach(journey => {
    // Sort by timestamp to ensure chronological order
    journey.sort((a, b) => a.timestamp - b.timestamp);
    
    let qualifiedTime = null;
    
    for (const stage of journey) {
      if (stage.stage === 'ACQ - Qualified' && !qualifiedTime) {
        // Record the first time they entered Qualified stage
        qualifiedTime = stage.timestamp;
      } else if (stage.stage === 'ACQ - Under Contract' && qualifiedTime) {
        // Calculate time difference in days
        const timeDiff = (stage.timestamp - qualifiedTime) / (1000 * 60 * 60 * 24);
        timesToContract.push(timeDiff);
        break; // Only count the first transition to Under Contract
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

// Fetch real data from API
export const fetchRealData = async (startDate, endDate, businessDays) => {
  try {
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    // Call our API endpoint
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
    
    return processSupabaseData(stageChanges, startDate, endDate, businessDays);
    
  } catch (error) {
    console.error('Error fetching real data:', error);
    throw error;
  }
};

// Process Supabase data into dashboard format
export const processSupabaseData = (stageChanges, startDate, endDate, businessDays) => {
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  
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

  // Debug: Log unique stage transitions to understand data structure
  const stageTransitions = new Set();
  stageChanges.forEach(change => {
    if (change.stage_from && change.stage_to) {
      stageTransitions.add(`${change.stage_from} → ${change.stage_to}`);
    }
  });
  console.log('📊 Unique stage transitions in data:', Array.from(stageTransitions).slice(0, 10));

  // Count stage changes by day and stage
  stageChanges.forEach(change => {
    const changeDate = new Date(change.changed_at).toISOString().split('T')[0];
    const dayData = dailyData.find(d => d.date === changeDate);
    if (dayData) {
      if (change.stage_to === 'ACQ - Qualified') {
        dayData.qualified++;
      } else if (change.stage_to === 'ACQ - Offers Made') {
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
  
  // Week comparisons - always calculate based on actual current date for consistency
  const today = new Date();
  const currentWeekStart = getWeekStart(today);
  const lastWeekStart = new Date(currentWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(currentWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

  let qualifiedThisWeek = 0, qualifiedLastWeek = 0;
  let offersThisWeek = 0, offersLastWeek = 0;
  let priceMotivatedThisWeek = 0, priceMotivatedLastWeek = 0;

  // Calculate week comparisons (simplified for this utility function)
  const allStageChanges = stageChanges;
  
  // Calculate current week totals
  qualifiedThisWeek = allStageChanges
    .filter(change => {
      const changeDate = new Date(change.changed_at);
      return changeDate >= currentWeekStart && changeDate <= today && change.stage_to === 'ACQ - Qualified';
    }).length;
  
  offersThisWeek = allStageChanges
    .filter(change => {
      const changeDate = new Date(change.changed_at);
      return changeDate >= currentWeekStart && changeDate <= today && change.stage_to === 'ACQ - Offers Made';
    }).length;
  
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
  
  const recentActivity = stageChanges
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

  // Get unique campaigns for filter dropdown
  const availableCampaigns = [...new Set(stageChanges
    .map(change => change.campaign_id)
    .filter(campaign => campaign && campaign !== null)
  )].sort();

  // Add "No Campaign" if some records don't have campaign_id
  if (stageChanges.some(change => !change.campaign_id)) {
    availableCampaigns.push('No Campaign');
  }

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

  // Calculate lead source metrics for initial load
  const leadSourceCounts = {};
  stageChanges.forEach(change => {
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
  
  // Calculate real average time to offer
  const avgTimeToOffer = calculateAvgTimeToOffer(stageChanges);
  
  // Calculate pipeline velocity - average days from Qualified to Under Contract
  const pipelineVelocity = calculatePipelineVelocity(stageChanges);

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
          start.setDate(start.getDate() - 30);
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
          start.setDate(start.getDate() - 30);
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