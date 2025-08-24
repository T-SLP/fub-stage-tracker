import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Calendar, TrendingUp, Users, Clock, Target, Award, Filter, Zap } from 'lucide-react';
import { TIME_RANGES, CHART_TYPES, STAGES, PIE_COLORS } from '../utils/constants';
import { getWeekStart as getWeekStartHelper, getDateRange as getDateRangeHelper, getBusinessDays, isDateInRange } from '../utils/dateHelpers';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import MetricCard from '../components/Cards/MetricCard';
import ChartTypeToggle from '../components/Header/ChartTypeToggle';
import TimeRangeSelector from '../components/Header/TimeRangeSelector';
import DashboardHeader from '../components/Header/DashboardHeader';
import CombinedTrendChart from '../components/Charts/CombinedTrendChart';
import VolumeComparisonChart from '../components/Charts/VolumeComparisonChart';
import CampaignPerformanceChart from '../components/Charts/CampaignPerformanceChart';
import LeadSourceChart from '../components/Charts/LeadSourceChart';
import RecentActivityTable from '../components/Activity/RecentActivityTable';

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState(TIME_RANGES.CURRENT_WEEK);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [chartType, setChartType] = useState('daily');
  const [visibleLines, setVisibleLines] = useState({
    qualified: true,
    offers: true,
    priceMotivated: true
  });
  const [campaignTimeRange, setCampaignTimeRange] = useState(TIME_RANGES.CURRENT_WEEK);
  const [campaignCustomStartDate, setCampaignCustomStartDate] = useState('');
  const [campaignCustomEndDate, setCampaignCustomEndDate] = useState('');
  const [leadSourceTimeRange, setLeadSourceTimeRange] = useState(TIME_RANGES.CURRENT_WEEK);
  const [leadSourceCustomStartDate, setLeadSourceCustomStartDate] = useState('');
  const [leadSourceCustomEndDate, setLeadSourceCustomEndDate] = useState('');
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
      <DashboardHeader>
        <TimeRangeSelector
          timeRange={timeRange}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onTimeRangeChange={setTimeRange}
          onCustomStartDateChange={setCustomStartDate}
          onCustomEndDateChange={setCustomEndDate}
        />

        <ChartTypeToggle
          chartType={chartType}
          onChartTypeChange={setChartType}
        />
      </DashboardHeader>

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
          
          <MetricCard
            icon={Clock}
            iconColor="text-purple-600"
            title="Qualified Daily Avg"
            value={data.summary.qualifiedAvgPerDay}
          />

          {/* Offers Made Cards */}
          <MetricCard
            icon={Target}
            iconColor="text-orange-600"
            title="Total Offers"
            value={data.summary.offersTotal}
          />
          
          <MetricCard
            icon={Clock}
            iconColor="text-indigo-600"
            title="Offers Daily Avg"
            value={data.summary.offersAvgPerDay}
          />

          {/* Price Motivated Cards */}
          <MetricCard
            icon={TrendingUp}
            iconColor="text-yellow-600"
            title="Total Price Motivated"
            value={data.summary.priceMotivatedTotal}
          />
          
          <MetricCard
            icon={Clock}
            iconColor="text-teal-600"
            title="Price Motivated Daily Avg"
            value={data.summary.priceMotivatedAvgPerDay}
          />
        </div>

        {/* Advanced Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <MetricCard
            icon={Target}
            iconColor="text-blue-600"
            title="Qualified → Offer Rate"
            value={`${data.summary.qualifiedToOfferRate}%`}
            subtitle={`(${data.summary.offersTotal} of ${data.summary.qualifiedTotal} qualified)`}
          />

          <MetricCard
            icon={Clock}
            iconColor="text-orange-600"
            title="Avg Time to Offer"
            value={data.summary.avgTimeToOffer}
            subtitle="days from qualified"
          />

          <MetricCard
            icon={Zap}
            iconColor="text-purple-600"
            title="Pipeline Velocity"
            value={data.summary.pipelineVelocity}
            subtitle="avg days qualified → contract"
          />
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
          <CombinedTrendChart
            data={chartData}
            visibleLines={visibleLines}
            chartType={chartType}
          />

          <VolumeComparisonChart
            data={chartData}
            visibleLines={visibleLines}
            chartType={chartType}
          />
        </div>

        <CampaignPerformanceChart
          data={data.campaignMetrics}
          campaignTimeRange={campaignTimeRange}
          campaignCustomStartDate={campaignCustomStartDate}
          campaignCustomEndDate={campaignCustomEndDate}
          onCampaignTimeRangeChange={setCampaignTimeRange}
          onCampaignCustomStartDateChange={setCampaignCustomStartDate}
          onCampaignCustomEndDateChange={setCampaignCustomEndDate}
        />

        <LeadSourceChart
          data={data.leadSourceMetrics}
          leadSourceTimeRange={leadSourceTimeRange}
          leadSourceCustomStartDate={leadSourceCustomStartDate}
          leadSourceCustomEndDate={leadSourceCustomEndDate}
          onLeadSourceTimeRangeChange={setLeadSourceTimeRange}
          onLeadSourceCustomStartDateChange={setLeadSourceCustomStartDate}
          onLeadSourceCustomEndDateChange={setLeadSourceCustomEndDate}
        />

        <RecentActivityTable data={data} />
      </div>
    </div>
  );
};

export default Dashboard;