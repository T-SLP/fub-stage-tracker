import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer } from 'recharts';
import { Calendar, TrendingUp, Users, Clock, Target, Award } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState('7d');
  const [data, setData] = useState({
    dailyMetrics: [],
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
    recentActivity: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        // Fetch stage changes for qualified leads, offers, and price motivated
        const { data: stageChanges, error: dbError } = await supabase
          .from('stage_changes')
          .select('*')
          .in('stage_to', ['ACQ - Qualified', 'ACQ - Offers Made', 'ACQ - Price Motivated'])
          .gte('changed_at', startDate.toISOString())
          .order('changed_at', { ascending: true });

        if (dbError) {
          throw new Error(`Database error: ${dbError.message}`);
        }

        const processedData = processStageData(stageChanges || [], days);
        setData(processedData);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
        // Fall back to sample data for testing
        const sampleData = generateSampleData(timeRange);
        setData(sampleData);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange]);

  const processStageData = (stageChanges, days) => {
    // Create daily buckets
    const dailyData = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dailyData.push({
        date: date.toISOString().split('T')[0],
        qualified: 0,
        offers: 0,
        priceMotivated: 0,
        dateFormatted: date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })
      });
    }

    // Count stage changes by day
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

    // Calculate summary stats
    const qualifiedTotal = dailyData.reduce((sum, day) => sum + day.qualified, 0);
    const offersTotal = dailyData.reduce((sum, day) => sum + day.offers, 0);
    const priceMotivatedTotal = dailyData.reduce((sum, day) => sum + day.priceMotivated, 0);
    const qualifiedThisWeek = dailyData.slice(-7).reduce((sum, day) => sum + day.qualified, 0);
    const qualifiedLastWeek = dailyData.slice(-14, -7).reduce((sum, day) => sum + day.qualified, 0);
    const offersThisWeek = dailyData.slice(-7).reduce((sum, day) => sum + day.offers, 0);
    const offersLastWeek = dailyData.slice(-14, -7).reduce((sum, day) => sum + day.offers, 0);
    const priceMotivatedThisWeek = dailyData.slice(-7).reduce((sum, day) => sum + day.priceMotivated, 0);
    const priceMotivatedLastWeek = dailyData.slice(-14, -7).reduce((sum, day) => sum + day.priceMotivated, 0);

    // Recent activity (last 10 stage changes)
    const recentActivity = stageChanges
      .slice(-10)
      .reverse()
      .map(change => ({
        name: `${change.first_name || 'Unknown'} ${change.last_name || ''}`.trim(),
        email: change.person_email || 'No email available',
        stage: change.stage_to,
        created_at: change.changed_at,
        previous_stage: change.stage_from
      }));

    return {
      dailyMetrics: dailyData,
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
        qualifiedAvgPerDay: Math.round((qualifiedTotal / days) * 10) / 10,
        offersAvgPerDay: Math.round((offersTotal / days) * 10) / 10,
        priceMotivatedAvgPerDay: Math.round((priceMotivatedTotal / days) * 10) / 10
      },
      recentActivity
    };
  };

  // Sample data for testing
  const generateSampleData = (range) => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const dailyData = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dailyData.push({
        date: date.toISOString().split('T')[0],
        qualified: Math.floor(Math.random() * 15) + 2,
        offers: Math.floor(Math.random() * 8) + 1,
        priceMotivated: Math.floor(Math.random() * 12) + 1,
        dateFormatted: date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })
      });
    }

    const qualifiedTotal = dailyData.reduce((sum, day) => sum + day.qualified, 0);
    const offersTotal = dailyData.reduce((sum, day) => sum + day.offers, 0);
    const priceMotivatedTotal = dailyData.reduce((sum, day) => sum + day.priceMotivated, 0);
    const qualifiedThisWeek = dailyData.slice(-7).reduce((sum, day) => sum + day.qualified, 0);
    const qualifiedLastWeek = dailyData.slice(-14, -7).reduce((sum, day) => sum + day.qualified, 0);
    const offersThisWeek = dailyData.slice(-7).reduce((sum, day) => sum + day.offers, 0);
    const offersLastWeek = dailyData.slice(-14, -7).reduce((sum, day) => sum + day.offers, 0);
    const priceMotivatedThisWeek = dailyData.slice(-7).reduce((sum, day) => sum + day.priceMotivated, 0);
    const priceMotivatedLastWeek = dailyData.slice(-14, -7).reduce((sum, day) => sum + day.priceMotivated, 0);

    const recentActivity = [
      { name: 'John Smith', email: 'john@example.com', stage: 'ACQ - Qualified', created_at: '2025-07-18T14:30:00Z', previous_stage: 'ACQ - New Lead' },
      { name: 'Sarah Johnson', email: 'sarah@example.com', stage: 'ACQ - Offers Made', created_at: '2025-07-18T11:15:00Z', previous_stage: 'ACQ - Qualified' },
      { name: 'Mike Wilson', email: 'mike@example.com', stage: 'ACQ - Price Motivated', created_at: '2025-07-17T16:45:00Z', previous_stage: 'ACQ - Contacted' },
      { name: 'Lisa Davis', email: 'lisa@example.com', stage: 'ACQ - Offers Made', created_at: '2025-07-17T09:20:00Z', previous_stage: 'ACQ - Qualified' },
      { name: 'Tom Brown', email: 'tom@example.com', stage: 'ACQ - Qualified', created_at: '2025-07-16T13:10:00Z', previous_stage: 'ACQ - New Lead' }
    ];

    return {
      dailyMetrics: dailyData,
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
        qualifiedAvgPerDay: Math.round((qualifiedTotal / days) * 10) / 10,
        offersAvgPerDay: Math.round((offersTotal / days) * 10) / 10,
        priceMotivatedAvgPerDay: Math.round((priceMotivatedTotal / days) * 10) / 10
      },
      recentActivity
    };
  };

  const getChangePercentage = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const qualifiedWeeklyChange = getChangePercentage(data.summary.qualifiedThisWeek, data.summary.qualifiedLastWeek);
  const offersWeeklyChange = getChangePercentage(data.summary.offersThisWeek, data.summary.offersLastWeek);
  const priceMotivatedWeeklyChange = getChangePercentage(data.summary.priceMotivatedThisWeek, data.summary.priceMotivatedLastWeek);

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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">⚠️ Using Sample Data</div>
          <p className="text-gray-600 text-sm">Error: {error}</p>
          <p className="text-gray-500 text-sm mt-2">Dashboard loaded with sample data for testing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">FUB Pipeline Dashboard</h1>
              <p className="text-gray-600 mt-1">Track qualified leads, offers made, and price motivated leads</p>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="text-gray-400" size={20} />
              <select 
                value={timeRange} 
                onChange={(e) => setTimeRange(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
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
                <p className={`text-sm ${qualifiedWeeklyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {qualifiedWeeklyChange >= 0 ? '+' : ''}{qualifiedWeeklyChange}% vs last week
                </p>
              </div>
            </div>
          </div>
          
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
              <Award className="text-red-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Offers This Week</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.offersThisWeek}</p>
                <p className={`text-sm ${offersWeeklyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {offersWeeklyChange >= 0 ? '+' : ''}{offersWeeklyChange}% vs last week
                </p>
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
              <Users className="text-pink-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Price Motivated This Week</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.priceMotivatedThisWeek}</p>
                <p className={`text-sm ${priceMotivatedWeeklyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {priceMotivatedWeeklyChange >= 0 ? '+' : ''}{priceMotivatedWeeklyChange}% vs last week
                </p>
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

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Combined Trend Line Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Pipeline Activity</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.dailyMetrics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateFormatted" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="qualified" 
                  stroke="#2563eb" 
                  strokeWidth={2}
                  name="Qualified Leads"
                  dot={{ fill: '#2563eb', strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="offers" 
                  stroke="#ea580c" 
                  strokeWidth={2}
                  name="Offers Made"
                  dot={{ fill: '#ea580c', strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="priceMotivated" 
                  stroke="#eab308" 
                  strokeWidth={2}
                  name="Price Motivated"
                  dot={{ fill: '#eab308', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bar Chart Comparison */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Volume Comparison</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.dailyMetrics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateFormatted" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="qualified" fill="#2563eb" name="Qualified" />
                <Bar dataKey="offers" fill="#ea580c" name="Offers" />
                <Bar dataKey="priceMotivated" fill="#eab308" name="Price Motivated" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Recent Pipeline Activity</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    New Stage
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
                {data.recentActivity.map((activity, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{activity.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{activity.email}</div>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;