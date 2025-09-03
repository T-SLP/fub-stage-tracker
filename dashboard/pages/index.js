import React, { useState, useEffect } from 'react';
import { Users, Clock, Target, TrendingUp, Zap } from 'lucide-react';

// Constants and Utils
import { TIME_RANGES, CHART_TYPES } from '../utils/constants';
import { 
  getDateRange, 
  getBusinessDays, 
  fetchRealData, 
  fetchCampaignData as fetchCampaignDataUtil, 
  fetchLeadSourceData as fetchLeadSourceDataUtil 
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
  const [campaignTimeRange, setCampaignTimeRange] = useState(TIME_RANGES.CURRENT_WEEK);
  const [campaignCustomStartDate, setCampaignCustomStartDate] = useState('');
  const [campaignCustomEndDate, setCampaignCustomEndDate] = useState('');
  const [leadSourceTimeRange, setLeadSourceTimeRange] = useState(TIME_RANGES.CURRENT_WEEK);
  const [leadSourceCustomStartDate, setLeadSourceCustomStartDate] = useState('');
  const [leadSourceCustomEndDate, setLeadSourceCustomEndDate] = useState('');
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
        const { start, end } = getDateRange('main', timeRange, customStartDate, customEndDate, campaignTimeRange, campaignCustomStartDate, campaignCustomEndDate, leadSourceTimeRange, leadSourceCustomStartDate, leadSourceCustomEndDate);
        const businessDays = getBusinessDays(start, end);
        const realData = await fetchRealData(start, end, businessDays);
        
        setData(realData);
      } catch (error) {
        console.error('Error fetching data:', error);
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

  // Campaign data fetching effect
  useEffect(() => {
    const fetchCampaign = async () => {
      try {
        const campaignMetrics = await fetchCampaignDataUtil(campaignTimeRange, campaignCustomStartDate, campaignCustomEndDate);
        setData(prev => ({ ...prev, campaignMetrics }));
      } catch (error) {
        console.error('Error fetching campaign data:', error);
      }
    };

    if (campaignTimeRange === TIME_RANGES.CUSTOM) {
      if (campaignCustomStartDate && campaignCustomEndDate) {
        const timeoutId = setTimeout(fetchCampaign, 500);
        return () => clearTimeout(timeoutId);
      }
    } else {
      fetchCampaign();
    }
  }, [campaignTimeRange, campaignCustomStartDate, campaignCustomEndDate]);

  // Lead source data fetching effect
  useEffect(() => {
    const fetchLeadSource = async () => {
      try {
        const leadSourceMetrics = await fetchLeadSourceDataUtil(leadSourceTimeRange, leadSourceCustomStartDate, leadSourceCustomEndDate);
        setData(prev => ({ ...prev, leadSourceMetrics }));
      } catch (error) {
        console.error('Error fetching lead source data:', error);
      }
    };

    if (leadSourceTimeRange === TIME_RANGES.CUSTOM) {
      if (leadSourceCustomStartDate && leadSourceCustomEndDate) {
        const timeoutId = setTimeout(fetchLeadSource, 500);
        return () => clearTimeout(timeoutId);
      }
    } else {
      fetchLeadSource();
    }
  }, [leadSourceTimeRange, leadSourceCustomStartDate, leadSourceCustomEndDate]);

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
        {/* Volume Summary Cards */}
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
          campaignTimeRange={campaignTimeRange}
          campaignCustomStartDate={campaignCustomStartDate}
          campaignCustomEndDate={campaignCustomEndDate}
          onCampaignTimeRangeChange={setCampaignTimeRange}
          onCampaignCustomStartDateChange={setCampaignCustomStartDate}
          onCampaignCustomEndDateChange={setCampaignCustomEndDate}
        />

        {/* Lead Source Chart */}
        <LeadSourceChart
          data={data.leadSourceMetrics}
          leadSourceTimeRange={leadSourceTimeRange}
          leadSourceCustomStartDate={leadSourceCustomStartDate}
          leadSourceCustomEndDate={leadSourceCustomEndDate}
          onLeadSourceTimeRangeChange={setLeadSourceTimeRange}
          onLeadSourceCustomStartDateChange={setLeadSourceCustomStartDate}
          onLeadSourceCustomEndDateChange={setLeadSourceCustomEndDate}
        />

        {/* Recent Activity Table */}
        <RecentActivityTable data={data} />
      </div>
    </div>
  );
};

export default Dashboard;