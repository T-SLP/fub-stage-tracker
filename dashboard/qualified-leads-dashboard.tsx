import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer } from 'recharts';
import { Calendar, TrendingUp, Users, Clock } from 'lucide-react';

const QualifiedLeadsDashboard = () => {
  const [timeRange, setTimeRange] = useState('7d');
  const [data, setData] = useState({
    dailyQualified: [],
    summary: { total: 0, thisWeek: 0, lastWeek: 0, avgPerDay: 0 },
    recentQualified: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Simulate API call - replace with actual Supabase query
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // This would be your actual Supabase query
        // const { data: stageChanges } = await supabase
        //   .from('stage_changes')
        //   .select('*')
        //   .eq('new_stage', 'ACQ - Qualified')
        //   .gte('created_at', getDateRange(timeRange))
        
        // Sample data for demonstration
        const sampleData = generateSampleData(timeRange);
        setData(sampleData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange]);

  const generateSampleData = (range) => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const dailyData = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dailyData.push({
        date: date.toISOString().split('T')[0],
        qualified: Math.floor(Math.random() * 15) + 2,
        dateFormatted: date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })
      });
    }

    const total = dailyData.reduce((sum, day) => sum + day.qualified, 0);
    const thisWeek = dailyData.slice(-7).reduce((sum, day) => sum + day.qualified, 0);
    const lastWeek = dailyData.slice(-14, -7).reduce((sum, day) => sum + day.qualified, 0);

    const recentQualified = [
      { name: 'John Smith', email: 'john@example.com', qualified_at: '2025-07-18 14:30', previous_stage: 'ACQ - New Lead' },
      { name: 'Sarah Johnson', email: 'sarah@example.com', qualified_at: '2025-07-18 11:15', previous_stage: 'ACQ - Contacted' },
      { name: 'Mike Wilson', email: 'mike@example.com', qualified_at: '2025-07-17 16:45', previous_stage: 'ACQ - New Lead' },
      { name: 'Lisa Davis', email: 'lisa@example.com', qualified_at: '2025-07-17 09:20', previous_stage: 'ACQ - Contacted' },
      { name: 'Tom Brown', email: 'tom@example.com', qualified_at: '2025-07-16 13:10', previous_stage: 'ACQ - New Lead' }
    ];

    return {
      dailyQualified: dailyData,
      summary: {
        total,
        thisWeek,
        lastWeek,
        avgPerDay: Math.round((total / days) * 10) / 10
      },
      recentQualified
    };
  };

  const getChangePercentage = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const weeklyChange = getChangePercentage(data.summary.thisWeek, data.summary.lastWeek);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading qualified leads data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">Error loading data</div>
          <p className="text-gray-600">{error}</p>
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
              <h1 className="text-3xl font-bold text-gray-900">Qualified Leads Dashboard</h1>
              <p className="text-gray-600 mt-1">Track leads moving to "ACQ - Qualified" stage</p>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Users className="text-blue-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Total Qualified</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.total}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <TrendingUp className="text-green-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">This Week</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.thisWeek}</p>
                <p className={`text-sm ${weeklyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {weeklyChange >= 0 ? '+' : ''}{weeklyChange}% vs last week
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Clock className="text-purple-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Daily Average</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.avgPerDay}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Calendar className="text-orange-600" size={24} />
              <div className="ml-4">
                <p className="text-sm text-gray-600">Last Week</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.lastWeek}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Daily Trend Line Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Qualified Leads Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.dailyQualified}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateFormatted" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="qualified" 
                  stroke="#2563eb" 
                  strokeWidth={2}
                  dot={{ fill: '#2563eb', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bar Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Volume</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.dailyQualified}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dateFormatted" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="qualified" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Qualified Leads */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Recent Qualified Leads</h3>
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
                    Previous Stage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Qualified At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.recentQualified.map((lead, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{lead.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{lead.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {lead.previous_stage}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(lead.qualified_at).toLocaleString()}
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

export default QualifiedLeadsDashboard;