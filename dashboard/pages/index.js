import React, { useState, useEffect } from 'react';
import { Users, Clock, Target, TrendingUp, Zap, Trash2 } from 'lucide-react';

// Constants and Utils
import { TIME_RANGES, CHART_TYPES } from '../utils/constants';
import {
  getDateRange,
  getBusinessDays,
  fetchRealData
} from '../utils/dataProcessing';

// Components
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import MetricCard from '../components/Cards/MetricCard';
import DashboardHeader from '../components/Header/DashboardHeader';
import TimeRangeSelector from '../components/Header/TimeRangeSelector';
import ChartTypeToggle from '../components/Header/ChartTypeToggle';
import ChartControls from '../components/Charts/ChartControls';
import VolumeComparisonChart from '../components/Charts/VolumeComparisonChart';
import CampaignPerformanceChart from '../components/Charts/CampaignPerformanceChart';
import LeadSourceChart from '../components/Charts/LeadSourceChart';
import RecentActivityTable from '../components/Activity/RecentActivityTable';

const Dashboard = () => {
  // State management
  const [timeRange, setTimeRange] = useState(TIME_RANGES.CURRENT_WEEK);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [chartType, setChartType] = useState(CHART_TYPES.DAILY);
  const [visibleLines, setVisibleLines] = useState({
    qualified: true,
    offers: true,
    priceMotivated: true,
    throwawayLeads: true
  });
  // Campaign data now uses main time range - no separate time range needed
  // Lead source data now uses main time range - no separate time range needed
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
      throwawayTotal: 0,
      throwawayThisWeek: 0,
      throwawayLastWeek: 0,
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

  // Chart data calculation
  const chartData = chartType === CHART_TYPES.WEEKLY ? data.weeklyMetrics : data.dailyMetrics;

  // Helper function to get correct throwaway value based on timeRange
  const getThrowawayValue = () => {
    switch (timeRange) {
      case TIME_RANGES.CURRENT_WEEK:
        return data.summary.throwawayThisWeek || 0;
      case TIME_RANGES.LAST_WEEK:
        return data.summary.throwawayLastWeek || 0;
      default:
        // For longer time periods (30d, 90d, custom), use the reliable direct calculation
        // from stage changes to avoid timezone issues with daily bucket totals
        return data.summary.throwawayForDateRange || 0;
    }
  };

  // Line toggle handler
  const handleLineToggle = (lineKey) => {
    setVisibleLines(prev => ({
      ...prev,
      [lineKey]: !prev[lineKey]
    }));
  };

  // Main data fetching effect
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const { start, end } = getDateRange('main', timeRange, customStartDate, customEndDate);
        console.log('📅 Date range:', timeRange);
        const businessDays = getBusinessDays(start, end);
        const realData = await fetchRealData(start, end, businessDays);
        
        setData(realData);
      } catch (error) {
        console.error('ERROR HANDLER TRIGGERED - This is why offers are showing as 0:', error);
        console.error('Error details:', error.message, error.stack);
        setError('Failed to load pipeline data. Please check your connection and try again.');
        
        // Set empty data on error
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
            throwawayTotal: 0,
            throwawayThisWeek: 0,
            throwawayLastWeek: 0,
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

    if (timeRange === TIME_RANGES.CUSTOM) {
      if (customStartDate && customEndDate) {
        const timeoutId = setTimeout(fetchData, 500);
        return () => clearTimeout(timeoutId);
      }
    } else {
      fetchData();
    }
  }, [timeRange, customStartDate, customEndDate]);

  // Campaign data is now included in main data fetch - no separate API call needed

  // Lead source data is now included in main data fetch - no separate API call needed

  // Loading and error states
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
        {/* Volume Summary Cards - Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
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
            icon={Trash2}
            iconColor="text-red-600"
            title="Throwaway Leads"
            value={getThrowawayValue()}
          />
        </div>

        {/* Volume Summary Cards - Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            icon={Target}
            iconColor="text-green-600"
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
            title="Time to Offer (30 day avg)"
            value={data.summary.avgTimeToOffer}
            subtitle="days from qualified"
          />

          <MetricCard
            icon={Zap}
            iconColor="text-purple-600"
            title="Pipeline Velocity (60 day avg)"
            value={data.summary.pipelineVelocity}
            subtitle="avg days qualified → contract"
          />
        </div>

        {/* Chart Controls */}
        <ChartControls 
          visibleLines={visibleLines}
          onLineToggle={handleLineToggle}
        />

        {/* Charts */}
        <div className="mb-8">
          <VolumeComparisonChart
            data={chartData}
            visibleLines={visibleLines}
            chartType={chartType}
          />
        </div>

        {/* Campaign Performance Chart */}
        <CampaignPerformanceChart
          data={data.campaignMetrics}
        />

        {/* Lead Source Chart */}
        <LeadSourceChart
          data={data.leadSourceMetrics}
        />

        {/* Recent Activity Table */}
        <RecentActivityTable data={data} />
      </div>
    </div>
  );
};

export default Dashboard;