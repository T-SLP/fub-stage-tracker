import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer } from 'recharts';
import { Calendar, TrendingUp, Users, Clock, Target, Award, Filter } from 'lucide-react';

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState('7d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [chartType, setChartType] = useState('daily'); // 'daily' or 'weekly'
  const [visibleLines, setVisibleLines] = useState({
    qualified: true,
    offers: true,
    priceMotivated: true
  });
  const [stageFilter, setStageFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const [data, setData] = useState({
    dailyMetrics: [],
    weeklyMetrics: [],
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
      priceMotivatedAvgPerDay: 0
    },
    recentActivity: [],
    filteredActivity: []
  });
  const [loading, setLoading] = useState(true);

  // Helper function to get week start (Sunday)
  const getWeekStart = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  // Helper function to get date range
  const getDateRange = () => {
    if (customStartDate && customEndDate) {
      return {
        start: new Date(customStartDate),
        end: new Date(customEndDate + 'T23:59:59.999Z')
      };
    }

    const end = new Date();
    const start = new Date();

    switch (timeRange) {
      case 'current_week':
        const currentWeekStart = getWeekStart(end);
        return { start: currentWeekStart, end };
      case 'last_week':
        const lastWeekEnd = new Date(getWeekStart(end));
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
        const lastWeekStart = getWeekStart(lastWeekEnd);
        return { start: lastWeekStart, end: lastWeekEnd };
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      default:
        start.setDate(start.getDate() - 7);
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
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude Sunday and Saturday
        businessDays++;
      }
    }
    return businessDays;
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // Simulate loading delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const { start, end } = getDateRange();
      const businessDays = getBusinessDays(start, end);
      const sampleData = generateSampleData(start, end, businessDays);
      setData(sampleData);
      setLoading(false);
    };

    fetchData();
  }, [timeRange, customStartDate, customEndDate]);

  // Update filtered activity when stage filter changes
  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filter changes
    if (stageFilter === 'all') {
      setData(prev => ({ ...prev, filteredActivity: prev.recentActivity }));
    } else {
      setData(prev => ({ 
        ...prev, 
        filteredActivity: prev.recentActivity.filter(activity => activity.stage === stageFilter)
      }));
    }
  }, [stageFilter, data.recentActivity]);

  // Generate sample data based on date range
  const generateSampleData = (startDate, endDate, businessDays) => {
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const dailyData = [];
    const weeklyData = [];
    
    // Generate daily data
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      dailyData.push({
        date: date.toISOString().split('T')[0],
        qualified: Math.floor(Math.random() * 8) + 1,
        offers: Math.floor(Math.random() * 4) + 0,
        priceMotivated: Math.floor(Math.random() * 6) + 1,
        dateFormatted: date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })
      });
    }

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

    weeklyData.push(...Array.from(weeks.values()).sort((a, b) => new Date(a.date) - new Date(b.date)));

    const qualifiedTotal = dailyData.reduce((sum, day) => sum + day.qualified, 0);
    const offersTotal = dailyData.reduce((sum, day) => sum + day.offers, 0);
    const priceMotivatedTotal = dailyData.reduce((sum, day) => sum + day.priceMotivated, 0);
    
    // Week comparisons
    let qualifiedThisWeek = 0, qualifiedLastWeek = 0;
    let offersThisWeek = 0, offersLastWeek = 0;
    let priceMotivatedThisWeek = 0, priceMotivatedLastWeek = 0;

    if (timeRange === 'current_week' || timeRange === 'last_week') {
      qualifiedThisWeek = qualifiedTotal;
      offersThisWeek = offersTotal;
      priceMotivatedThisWeek = priceMotivatedTotal;
    } else {
      qualifiedThisWeek = dailyData.slice(-7).reduce((sum, day) => sum + day.qualified, 0);
      qualifiedLastWeek = dailyData.slice(-14, -7).reduce((sum, day) => sum + day.qualified, 0);
      offersThisWeek = dailyData.slice(-7).reduce((sum, day) => sum + day.offers, 0);
      offersLastWeek = dailyData.slice(-14, -7).reduce((sum, day) => sum + day.offers, 0);
      priceMotivatedThisWeek = dailyData.slice(-7).reduce((sum, day) => sum + day.priceMotivated, 0);
      priceMotivatedLastWeek = dailyData.slice(-14, -7).reduce((sum, day) => sum + day.priceMotivated, 0);
    }

    // Generate sample recent activity based on date range
    const sampleNames = ['John Smith', 'Sarah Johnson', 'Mike Wilson', 'Lisa Davis', 'Tom Brown', 'Emma Wilson', 'James Taylor', 'Ashley Garcia', 'David Martinez', 'Jessica Rodriguez', 'Chris Anderson', 'Maria Lopez', 'Robert Chen', 'Amanda White', 'Brian Johnson'];
    const stages = ['ACQ - Qualified', 'ACQ - Offers Made', 'ACQ - Price Motivated'];
    const previousStages = ['ACQ - New Lead', 'ACQ - Contacted', 'ACQ - Qualified', 'ACQ - Follow Up'];
    
    const recentActivity = [];
    // Scale activity with date range: roughly 2-4 activities per day
    const activityCount = Math.min(500, Math.max(20, Math.floor(totalDays * (2 + Math.random() * 2)))); 
    
    for (let i = 0; i < activityCount; i++) {
      const activityDate = new Date(startDate);
      activityDate.setDate(activityDate.getDate() + Math.floor(Math.random() * totalDays));
      
      recentActivity.push({
        name: sampleNames[Math.floor(Math.random() * sampleNames.length)],
        stage: stages[Math.floor(Math.random() * stages.length)],
        created_at: activityDate.toISOString(),
        previous_stage: previousStages[Math.floor(Math.random() * previousStages.length)]
      });
    }

    // Sort by date (newest first)
    recentActivity.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return {
      dailyMetrics: dailyData,
      weeklyMetrics: weeklyData,
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
        priceMotivatedAvgPerDay: businessDays > 0 ? Math.round((priceMotivatedTotal / businessDays) * 10) / 10 : 0
      },
      recentActivity,
      filteredActivity: recentActivity
    };
  };

  const getChangePercentage = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const qualifiedWeeklyChange = getChangePercentage(data.summary.qualifiedThisWeek, data.summary.qualifiedLastWeek);
  const offersWeeklyChange = getChangePercentage(data.summary.offersThisWeek, data.summary.offersLastWeek);
  const priceMotivatedWeeklyChange = getChangePercentage(data.summary.priceMotivatedThisWeek, data.summary.priceMotivatedLastWeek);

  const handleLineToggle = (lineKey) => {
    setVisibleLines(prev => ({
      ...prev,
      [lineKey]: !prev[lineKey]
    }));
  };

  const chartData = chartType === 'weekly' ? data.weeklyMetrics : data.dailyMetrics;

  // Pagination calculations
  const totalPages = Math.ceil(data.filteredActivity.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPageData = data.filteredActivity.slice(startIndex, endIndex);

  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading pipeline data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">FUB Pipeline Dashboard</h1>
              <p className="text-gray-600 mt-1">Track qualified leads, offers made, and price motivated leads</p>
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
                  <option value="7d">Last 7 Days</option>
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
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-6 mb-8">
          {/* Qualified Leads Cards */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Users className="text-blue-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Total Qualified</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.qualifiedTotal}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <TrendingUp className="text-green-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Qualified This Week</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.qualifiedThisWeek}</p>
                {timeRange !== 'current_week' && timeRange !== 'last_week' && (
                  <p className={`text-sm ${qualifiedWeeklyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {qualifiedWeeklyChange >= 0 ? '+' : ''}{qualifiedWeeklyChange}% vs last week
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Clock className="text-purple-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Qualified Daily Avg (Business Days)</p>
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
              <Award className="text-red-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Offers This Week</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.offersThisWeek}</p>
                {timeRange !== 'current_week' && timeRange !== 'last_week' && (
                  <p className={`text-sm ${offersWeeklyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {offersWeeklyChange >= 0 ? '+' : ''}{offersWeeklyChange}% vs last week
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Clock className="text-indigo-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Offers Daily Avg (Business Days)</p>
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
              <Users className="text-pink-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Price Motivated This Week</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.priceMotivatedThisWeek}</p>
                {timeRange !== 'current_week' && timeRange !== 'last_week' && (
                  <p className={`text-sm ${priceMotivatedWeeklyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {priceMotivatedWeeklyChange >= 0 ? '+' : ''}{priceMotivatedWeeklyChange}% vs last week
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Clock className="text-teal-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Price Motivated Daily Avg (Business Days)</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.priceMotivatedAvgPerDay}</p>
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
              <div className="flex items-center space-x-2">
                <Filter className="text-gray-400" size={20} />
                <label className="text-sm text-gray-600 font-medium">Filter by New Stage:</label>
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All New Stages</option>
                  <option value="ACQ - Qualified">ACQ - Qualified</option>
                  <option value="ACQ - Offers Made">ACQ - Offers Made</option>
                  <option value="ACQ - Price Motivated">ACQ - Price Motivated</option>
                </select>
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
                    Previous Stage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentPageData.map((activity, index) => (
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
            {data.filteredActivity.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No activity found for the selected stage filter.
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