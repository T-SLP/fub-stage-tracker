// pages\index.js - FIRST MIGRATION STEP
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Calendar, TrendingUp, Users, Clock, Target, Award, Filter, Zap } from 'lucide-react';

// 👈 NEW IMPORTS - Using our new files
import { TIME_RANGES, CHART_TYPES, STAGES, PIE_COLORS } from '../utils/constants';
import { getWeekStart, getDateRange, getBusinessDays, isDateInRange } from '../utils/dateHelpers';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import MetricCard from '../components/Cards/MetricCard';

const Dashboard = () => {
  // 👈 UPDATED - Using constants instead of hardcoded strings
  const [timeRange, setTimeRange] = useState(TIME_RANGES.THIRTY_DAYS);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [chartType, setChartType] = useState(CHART_TYPES.DAILY);
  const [visibleLines, setVisibleLines] = useState({
    qualified: true,
    offers: true,
    priceMotivated: true
  });
  const [stageFilter, setStageFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [campaignTimeRange, setCampaignTimeRange] = useState(TIME_RANGES.THIRTY_DAYS);
  const [campaignCustomStartDate, setCampaignCustomStartDate] = useState('');
  const [campaignCustomEndDate, setCampaignCustomEndDate] = useState('');
  const [leadSourceTimeRange, setLeadSourceTimeRange] = useState(TIME_RANGES.THIRTY_DAYS);
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

  // 👈 UPDATED - Using helper function from dateHelpers.js
  const getDateRangeHelper = (timeRangeType = 'main', customStart = '', customEnd = '') => {
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

    return getDateRange(timeRangeType, selectedTimeRange, selectedCustomStart, selectedCustomEnd);
  };

  // REST OF YOUR EXISTING CODE STAYS THE SAME FOR NOW...
  // (Keep all your existing functions like fetchRealData, processSupabaseData, etc.)
  
  // 👈 UPDATED - Use new components for loading and error states
  if (loading) {
    return <LoadingSpinner message="Loading pipeline data..." />;
  }

  if (error) {
    return <ErrorMessage error={error} />;
  }

  // 👈 REST OF RENDER - Keep your existing JSX but update the constants
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
                    if (e.target.value !== TIME_RANGES.CUSTOM) {
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }
                  }}
                  className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={TIME_RANGES.CURRENT_WEEK}>Current Week</option>
                  <option value={TIME_RANGES.LAST_WEEK}>Last Week</option>
                  <option value={TIME_RANGES.THIRTY_DAYS}>Last 30 Days</option>
                  <option value={TIME_RANGES.NINETY_DAYS}>Last 90 Days</option>
                  <option value={TIME_RANGES.CUSTOM}>Custom Range</option>
                </select>
              </div>

              {/* Custom Date Range */}
              {timeRange === TIME_RANGES.CUSTOM && (
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
                  <option value={CHART_TYPES.DAILY}>Daily View</option>
                  <option value={CHART_TYPES.WEEKLY}>Weekly View</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 👈 UPDATED - Using MetricCard component */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-8">
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

        {/* 👈 REST OF YOUR EXISTING JSX STAYS THE SAME FOR NOW */}
        {/* Keep all your existing charts, tables, etc. */}
        {/* We'll migrate those in the next steps */}
        
      </div>
    </div>
  );
};

export default Dashboard;