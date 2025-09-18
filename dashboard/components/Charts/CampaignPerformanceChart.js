import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CampaignPerformanceChart = ({ data }) => {
  // Chart component for campaign performance
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Qualified Leads by Campaign Code ✓</h3>
        {/* AUTO-DEPLOY TEST: Should go directly to production */}
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
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
  );
};

export default CampaignPerformanceChart;