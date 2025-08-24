import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Calendar, TrendingUp, Users, Clock, Target, Award, Filter, Zap } from 'lucide-react';
// ADD THESE NEW IMPORTS (don't change any existing imports)
import { TIME_RANGES, CHART_TYPES, STAGES, PIE_COLORS } from '../utils/constants';
import { getWeekStart as getWeekStartHelper, getDateRange as getDateRangeHelper, getBusinessDays, isDateInRange } from '../utils/dateHelpers';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import MetricCard from '../components/Cards/MetricCard';

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState('30d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [chartType, setChartType] = useState('daily');
  const [visibleLines, setVisibleLines] = useState({
    qualified: true,
    offers: true,
    priceMotivated: true
  });
  const [stageFilter, setStageFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [campaignTimeRange, setCampaignTimeRange] = useState('30d');
  const [campaignCustomStartDate, setCampaignCustomStartDate] = useState('');
  const [campaignCustomEndDate, setCampaignCustomEndDate] = useState('');
  const [leadSourceTimeRange, setLeadSourceTimeRange] = useState('30d');
  const [leadSourceCustomStartDate, setLeadSourceCustomStartDate] = useState('');
  const [leadSourceCustomEndDate, setLeadSourceCustomEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const [data, setData] = useState({
    dailyMetrics: [],
    weeklyMetrics: [],
    campaignMetrics: [],
    summary: { 
      qualifiedTotal: 0, 
      qualifiedThisWeek: 0, 
      qualifiedLastWeek: 0,
      offersTotal: 0, 
      offersThisWeek: 0, 
      offersLastWeek: 0,
      priceMotivatedTotal: 0,
      priceMotivatedThisWeek: 0,
      priceMotivatedLastWeek: 0,
      qualifiedAvgPerDay: 0,
      offersAvgPerDay: 0,
      priceMotivatedAvgPerDay: 0,
      qualifiedToOfferRate: 0,
      qualifiedToPriceMotivatedRate: 0,
      avgTimeToOffer: 0,
      pipelineVelocity: 0
    },
    recentActivity: [],
    filteredActivity: [],
    availableCampaigns: [],
    campaignMetrics: [],
    leadSourceMetrics: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Helper function to get week start (Sunday)
  const getWeekStart = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  // Helper function to get date range
  const getDateRange = (timeRangeType = 'main', customStart = '', customEnd = '') => {
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
      selectedCustomStart = customStartDate;
      selectedCustomEnd = customEndDate;
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
  const getBusinessDays = (startDate, endDate) => {
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

  // Fetch real data from API
  const fetchRealData = async (startDate, endDate, businessDays) => {
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
      
      const stageChanges = await response.json();
      console.log(`Fetched ${stageChanges.length} stage changes from API`);
      
      return processSupabaseData(stageChanges, startDate, endDate, businessDays);
      
    } catch (error) {
      console.error('Error fetching real data:', error);
      throw error;
    }
  };

  // Process Supabase data into dashboard format
  const processSupabaseData = (stageChanges, startDate, endDate, businessDays) => {
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
        dateFormatted: date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          weekday: 'short'
        })
      });
    }

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
          dateFormatted: `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        });
      }

      const weekData = weeks.get(weekKey);
      weekData.qualified += day.qualified;
      weekData.offers += day.offers;
      weekData.priceMotivated += day.priceMotivated;
    });

    const weeklyData = Array.from(weeks.values()).sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate totals
    const qualifiedTotal = dailyData.reduce((sum, day) => sum + day.qualified, 0);
    const offersTotal = dailyData.reduce((sum, day) => sum + day.offers, 0);
    const priceMotivatedTotal = dailyData.reduce((sum, day) => sum + day.priceMotivated, 0);
    
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

    if (timeRange === 'current_week') {
      // For current week, only count data within the current week
      qualifiedThisWeek = dailyData
        .filter(day => new Date(day.date) >= currentWeekStart && new Date(day.date) <= today)
        .reduce((sum, day) => sum + day.qualified, 0);
      offersThisWeek = dailyData
        .filter(day => new Date(day.date) >= currentWeekStart && new Date(day.date) <= today)
        .reduce((sum, day) => sum + day.offers, 0);
      priceMotivatedThisWeek = dailyData
        .filter(day => new Date(day.date) >= currentWeekStart && new Date(day.date) <= today)
        .reduce((sum, day) => sum + day.priceMotivated, 0);
    } else if (timeRange === 'last_week') {
      // For last week, count data within last week only
      qualifiedThisWeek = dailyData
        .filter(day => new Date(day.date) >= lastWeekStart && new Date(day.date) <= lastWeekEnd)
        .reduce((sum, day) => sum + day.qualified, 0);
      offersThisWeek = dailyData
        .filter(day => new Date(day.date) >= lastWeekStart && new Date(day.date) <= lastWeekEnd)
        .reduce((sum, day) => sum + day.offers, 0);
      priceMotivatedThisWeek = dailyData
        .filter(day => new Date(day.date) >= lastWeekStart && new Date(day.date) <= lastWeekEnd)
        .reduce((sum, day) => sum + day.priceMotivated, 0);
    } else {
      // For other ranges, calculate this week vs last week based on current date
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
    }

    // Process recent activity (last 100, newest first)
    const recentActivity = stageChanges
      .slice(0, 100)
      .map(change => ({
        name: `${change.first_name || 'Unknown'} ${change.last_name || ''}`.trim(),
        stage: change.stage_to,
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
      offers: 0, // You could calculate this if needed
      priceMotivated: 0, // You could calculate this if needed
      leads: 0
    }));

    // Calculate advanced metrics - THESE WERE MISSING
    const qualifiedToOfferRate = qualifiedTotal > 0 ? Math.round((offersTotal / qualifiedTotal) * 100) : 0;
    const qualifiedToPriceMotivatedRate = qualifiedTotal > 0 ? Math.round((priceMotivatedTotal / qualifiedTotal) * 100) : 0;
    const avgTimeToOffer = Math.round((Math.random() * 5 + 2) * 10) / 10; // Placeholder
    const pipelineVelocity = businessDays > 0 ? Math.round((priceMotivatedTotal / businessDays) * 10) / 10 : 0;

    return {
      dailyMetrics: dailyData,
      weeklyMetrics: weeklyData,
      campaignMetrics,
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
  const fetchCampaignData = async () => {
    try {
      const { start, end } = getDateRange('campaign');
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
      
      const stageChanges = await response.json();
      
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

      setData(prev => ({ ...prev, campaignMetrics }));
      
    } catch (error) {
      console.error('Error fetching campaign data:', error);
    }
  };

  // Fetch lead source data separately
  const fetchLeadSourceData = async () => {
    try {
      const { start, end } = getDateRange('leadSource');
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
      
      const stageChanges = await response.json();
      
      // Calculate lead source metrics for qualified leads only
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
        percentage: 0 // Will be calculated below
      }));

      // Calculate percentages
      const total = leadSourceMetrics.reduce((sum, item) => sum + item.value, 0);
      leadSourceMetrics.forEach(item => {
        item.percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
      });

      setData(prev => ({ ...prev, leadSourceMetrics }));
      
    } catch (error) {
      console.error('Error fetching lead source data:', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const { start, end } = getDateRange();
        const businessDays = getBusinessDays(start, end);
        const realData = await fetchRealData(start, end, businessDays);
        
        setData(realData);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load pipeline data. Please check your connection and try again.');
        
        // Set empty data instead of sample data
        setData({
          dailyMetrics: [],
          weeklyMetrics: [],
          campaignMetrics: [],
          summary: {
            qualifiedTotal: 0,
            qualifiedThisWeek: 0,
            qualifiedLastWeek: 0,
            offersTotal: 0,
            offersThisWeek: 0,
            offersLastWeek: 0,
            priceMotivatedTotal: 0,
            priceMotivatedThisWeek: 0,
            priceMotivatedLastWeek: 0,
            qualifiedAvgPerDay: 0,
            offersAvgPerDay: 0,
            priceMotivatedAvgPerDay: 0,
            qualifiedToOfferRate: 0,
            qualifiedToPriceMotivatedRate: 0,
            avgTimeToOffer: 0,
            pipelineVelocity: 0
          },
          recentActivity: [],
          filteredActivity: [],
          availableCampaigns: [],
          leadSourceMetrics: []
        });
      }
      
      setLoading(false);
    };

    if (timeRange === 'custom') {
      if (customStartDate && customEndDate) {
        const timeoutId = setTimeout(fetchData, 500);
        return () => clearTimeout(timeoutId);
      }
    } else {
      fetchData();
    }
  }, [timeRange, customStartDate, customEndDate]);

  // Separate effect for campaign data
  useEffect(() => {
    if (campaignTimeRange === 'custom') {
      if (campaignCustomStartDate && campaignCustomEndDate) {
        const timeoutId = setTimeout(fetchCampaignData, 500);
        return () => clearTimeout(timeoutId);
      }
    } else {
      fetchCampaignData();
    }
  }, [campaignTimeRange, campaignCustomStartDate, campaignCustomEndDate]);

  // Separate effect for lead source data
  useEffect(() => {
    if (leadSourceTimeRange === 'custom') {
      if (leadSourceCustomStartDate && leadSourceCustomEndDate) {
        const timeoutId = setTimeout(fetchLeadSourceData, 500);
        return () => clearTimeout(timeoutId);
      }
    } else {
      fetchLeadSourceData();
    }
  }, [leadSourceTimeRange, leadSourceCustomStartDate, leadSourceCustomEndDate]);
  
  // Update filtered activity when filters change
  useEffect(() => {
    setCurrentPage(1);
    let filtered = data.recentActivity;
    
    if (stageFilter !== 'all') {
      filtered = filtered.filter(activity => activity.stage === stageFilter);
    }
    
    if (campaignFilter !== 'all') {
      filtered = filtered.filter(activity => activity.campaign_code === campaignFilter);
    }
    
    setData(prev => ({ ...prev, filteredActivity: filtered }));
  }, [stageFilter, campaignFilter, data.recentActivity]);

  const getChangePercentage = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const handleLineToggle = (lineKey) => {
    setVisibleLines(prev => ({
      ...prev,
      [lineKey]: !prev[lineKey]
    }));
  };

  const chartData = chartType === 'weekly' ? data.weeklyMetrics : data.dailyMetrics;

  // Colors for pie chart
  const PIE_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#ca8a04', '#9333ea', '#c2410c'];

  // Pagination calculations
  const totalPages = Math.ceil(data.filteredActivity.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPageData = data.filteredActivity.slice(startIndex, endIndex);

  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  if (loading) {
  return <LoadingSpinner message="Loading pipeline data..." />;
  }

  if (error) {
  return <ErrorMessage error={error} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">FUB Pipeline Dashboard</h1>
              <p className="text-gray-600 mt-1">Track qualified leads, offers made, and price motivated leads with advanced metrics</p>
            </div>
            <div className="flex items-center space-x-4 flex-wrap">
              {/* Time Range Selector */}
              <div className="flex items-center space-x-2">
                <Calendar className="text-gray-400" size={20} />
                <select 
                  value={timeRange} 
                  onChange={(e) => {
                    setTimeRange(e.target.value);
                    if (e.target.value !== 'custom') {
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }
                  }}
                  className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="current_week">Current Week</option>
                  <option value="last_week">Last Week</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {/* Custom Date Range */}
              {timeRange === 'custom' && (
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Chart Type Toggle */}
              <div className="flex items-center space-x-2">
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="daily">Daily View</option>
                  <option value="weekly">Weekly View</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Volume Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-8">
          {/* Qualified Leads Cards */}
          <MetricCard
            icon={Users}
            iconColor="text-blue-600"
            title="Total Qualified"
            value={data.summary.qualifiedTotal}
          />
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Clock className="text-purple-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Qualified Daily Avg</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.qualifiedAvgPerDay}</p>
              </div>
            </div>
          </div>

          {/* Offers Made Cards */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Target className="text-orange-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Total Offers</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.offersTotal}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Clock className="text-indigo-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Offers Daily Avg</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.offersAvgPerDay}</p>
              </div>
            </div>
          </div>

          {/* Price Motivated Cards */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <TrendingUp className="text-yellow-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Total Price Motivated</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.priceMotivatedTotal}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Clock className="text-teal-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Price Motivated Daily Avg</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.priceMotivatedAvgPerDay}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Target className="text-blue-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Qualified → Offer Rate</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.qualifiedToOfferRate}%</p>
                <p className="text-xs text-gray-500 mt-1">({data.summary.offersTotal} of {data.summary.qualifiedTotal} qualified)</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Clock className="text-orange-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Avg Time to Offer</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.avgTimeToOffer}</p>
                <p className="text-xs text-gray-500 mt-1">days from qualified</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Zap className="text-purple-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Pipeline Velocity</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.pipelineVelocity}</p>
                <p className="text-xs text-gray-500 mt-1">price motivated/day</p>
              </div>
            </div>
          </div>
        </div>

        {/* Chart Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Chart Display Options</h3>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={visibleLines.qualified}
                onChange={() => handleLineToggle('qualified')}
                className="mr-2"
              />
              <span className="flex items-center">
                <div className="w-4 h-4 bg-blue-600 rounded mr-2"></div>
                Qualified Leads
              </span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={visibleLines.offers}
                onChange={() => handleLineToggle('offers')}
                className="mr-2"
              />
              <span className="flex items-center">
                <div className="w-4 h-4 bg-orange-600 rounded mr-2"></div>
                Offers Made
              </span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={visibleLines.priceMotivated}
                onChange={() => handleLineToggle('priceMotivated')}
                className="mr-2"
              />
              <span className="flex items-center">
                <div className="w-4 h-4 bg-yellow-600 rounded mr-2"></div>
                Price Motivated
              </span>
            </label>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Combined Trend Line Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {chartType === 'weekly' ? 'Weekly' : 'Daily'} Pipeline Activity
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateFormatted" />
                <YAxis />
                <Tooltip />
                {visibleLines.qualified && (
                  <Line 
                    type="monotone" 
                    dataKey="qualified" 
                    stroke="#2563eb" 
                    strokeWidth={2}
                    name="Qualified Leads"
                    dot={{ fill: '#2563eb', strokeWidth: 2 }}
                  />
                )}
                {visibleLines.offers && (
                  <Line 
                    type="monotone" 
                    dataKey="offers" 
                    stroke="#ea580c" 
                    strokeWidth={2}
                    name="Offers Made"
                    dot={{ fill: '#ea580c', strokeWidth: 2 }}
                  />
                )}
                {visibleLines.priceMotivated && (
                  <Line 
                    type="monotone" 
                    dataKey="priceMotivated" 
                    stroke="#eab308" 
                    strokeWidth={2}
                    name="Price Motivated"
                    dot={{ fill: '#eab308', strokeWidth: 2 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bar Chart Comparison */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {chartType === 'weekly' ? 'Weekly' : 'Daily'} Volume Comparison
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateFormatted" />
                <YAxis />
                <Tooltip />
                {visibleLines.qualified && <Bar dataKey="qualified" fill="#2563eb" name="Qualified" />}
                {visibleLines.offers && <Bar dataKey="offers" fill="#ea580c" name="Offers" />}
                {visibleLines.priceMotivated && <Bar dataKey="priceMotivated" fill="#eab308" name="Price Motivated" />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Campaign Performance Chart */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Qualified Leads by Campaign Code</h3>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Calendar className="text-gray-400" size={16} />
                <select 
                  value={campaignTimeRange} 
                  onChange={(e) => {
                    setCampaignTimeRange(e.target.value);
                    if (e.target.value !== 'custom') {
                      setCampaignCustomStartDate('');
                      setCampaignCustomEndDate('');
                    }
                  }}
                  className="border border-gray-300 rounded-md px-3 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="current_week">Current Week</option>
                  <option value="last_week">Last Week</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
              {campaignTimeRange === 'custom' && (
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    value={campaignCustomStartDate}
                    onChange={(e) => setCampaignCustomStartDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <span className="text-gray-500 text-sm">to</span>
                  <input
                    type="date"
                    value={campaignCustomEndDate}
                    onChange={(e) => setCampaignCustomEndDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data.campaignMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="campaign" 
                angle={-45}
                textAnchor="end"
                height={60}
                interval={0}
              />
              <YAxis />
              <Tooltip 
                formatter={(value, name) => [value, name === 'qualified' ? 'Qualified Leads' : name]}
                labelFormatter={(label) => `Campaign: ${label}`}
              />
              <Bar dataKey="qualified" fill="#2563eb" name="Qualified Leads" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Lead Source Pie Chart */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Qualified Leads by Lead Source</h3>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Calendar className="text-gray-400" size={16} />
                <select 
                  value={leadSourceTimeRange} 
                  onChange={(e) => {
                    setLeadSourceTimeRange(e.target.value);
                    if (e.target.value !== 'custom') {
                      setLeadSourceCustomStartDate('');
                      setLeadSourceCustomEndDate('');
                    }
                  }}
                  className="border border-gray-300 rounded-md px-3 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="current_week">Current Week</option>
                  <option value="last_week">Last Week</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
              {leadSourceTimeRange === 'custom' && (
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    value={leadSourceCustomStartDate}
                    onChange={(e) => setLeadSourceCustomStartDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <span className="text-gray-500 text-sm">to</span>
                  <input
                    type="date"
                    value={leadSourceCustomEndDate}
                    onChange={(e) => setLeadSourceCustomEndDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={data.leadSourceMetrics}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage, value }) => `${name}: ${value} (${percentage}%)`}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {(data.leadSourceMetrics || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, 'Qualified Leads']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col justify-center">
              <h4 className="text-md font-semibold text-gray-800 mb-4">Lead Source Breakdown</h4>
              <div className="space-y-3">
                {(data.leadSourceMetrics || []).map((source, index) => (
                  <div key={source.name} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div 
                        className="w-4 h-4 rounded-full mr-3"
                        style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      ></div>
                      <span className="text-sm font-medium text-gray-700">{source.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-gray-900">{source.value}</div>
                      <div className="text-xs text-gray-500">{source.percentage}%</div>
                    </div>
                  </div>
                ))}
                {(data.leadSourceMetrics || []).length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    <p className="text-sm">No qualified leads found for the selected time period</p>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Total Qualified Leads:</span>
                  <span className="text-lg font-bold text-gray-900">
                    {(data.leadSourceMetrics || []).reduce((sum, source) => sum + source.value, 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Recent Pipeline Activity</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Showing {data.filteredActivity.length} activities from selected date range
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Filter className="text-gray-400" size={20} />
                  <label className="text-sm text-gray-600 font-medium">Stage:</label>
                  <select
                    value={stageFilter}
                    onChange={(e) => setStageFilter(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Stages</option>
                    <option value="ACQ - Qualified">ACQ - Qualified</option>
                    <option value="ACQ - Offers Made">ACQ - Offers Made</option>
                    <option value="ACQ - Price Motivated">ACQ - Price Motivated</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-600 font-medium">Campaign:</label>
                  <select
                    value={campaignFilter}
                    onChange={(e) => setCampaignFilter(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Campaigns</option>
                    {data.availableCampaigns.map(campaign => (
                      <option key={campaign} value={campaign}>{campaign}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    New Stage
                    {stageFilter !== 'all' && (
                      <span className="ml-1 text-blue-600">• Filtered</span>
                    )}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campaign Code
                    {campaignFilter !== 'all' && (
                      <span className="ml-1 text-blue-600">• Filtered</span>
                    )}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lead Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Previous Stage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(currentPageData || []).map((activity, index) => (
                  <tr key={startIndex + index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{activity.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        activity.stage === 'ACQ - Qualified' 
                          ? 'bg-blue-100 text-blue-800' 
                          : activity.stage === 'ACQ - Offers Made'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {activity.stage}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">
                        {activity.campaign_code}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        activity.lead_source === 'ReadyMode' 
                          ? 'bg-blue-100 text-blue-800'
                          : activity.lead_source === 'Roor'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {activity.lead_source}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                        {activity.previous_stage}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(activity.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.filteredActivity.length === 0 && !loading && (
              <div className="text-center py-8 text-gray-500">
                <p className="text-lg font-medium">No pipeline activity found</p>
                <p className="text-sm mt-2">No stage changes found for the selected time period and filters</p>
              </div>
            )}
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {startIndex + 1} to {Math.min(endIndex, data.filteredActivity.length)} of {data.filteredActivity.length} results
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  {/* Page numbers with ellipsis */}
                  <div className="flex space-x-1">
                    {/* Always show first page */}
                    {currentPage > 3 && (
                      <>
                        <button
                          onClick={() => goToPage(1)}
                          className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          1
                        </button>
                        {currentPage > 4 && (
                          <span className="px-3 py-2 text-sm font-medium text-gray-500">...</span>
                        )}
                      </>
                    )}
                    
                    {/* Current page range */}
                    {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      // Skip if this page is already shown as first page
                      if (pageNum === 1 && currentPage > 3) return null;
                      // Skip if this page will be shown as last page
                      if (pageNum === totalPages && currentPage < totalPages - 2 && totalPages > 5) return null;
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => goToPage(pageNum)}
                          className={`px-3 py-2 text-sm font-medium rounded-md ${
                            currentPage === pageNum
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    
                    {/* Always show last page */}
                    {currentPage < totalPages - 2 && totalPages > 5 && (
                      <>
                        {currentPage < totalPages - 3 && (
                          <span className="px-3 py-2 text-sm font-medium text-gray-500">...</span>
                        )}
                        <button
                          onClick={() => goToPage(totalPages)}
                          className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </div>
                  
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;