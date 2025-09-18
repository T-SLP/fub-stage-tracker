import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PIE_COLORS } from '../../utils/constants';

const LeadSourceChart = ({ data }) => {
  // Chart component for lead source breakdown
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Qualified Leads by Lead Source</h3>
        {/* PRODUCTION BRANCH TEST: master → production */}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percentage, value }) => `${name}: ${value} (${percentage}%)`}
              outerRadius={120}
              fill="#8884d8"
              dataKey="value"
            >
              {(data || []).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [value, 'Qualified Leads']} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col justify-center">
          <h4 className="text-md font-semibold text-gray-800 mb-4">Lead Source Breakdown</h4>
          <div className="space-y-3">
            {(data || []).map((source, index) => (
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
            {(data || []).length === 0 && (
              <div className="text-center py-4 text-gray-500">
                <p className="text-sm">No qualified leads found for the selected time period</p>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Total Qualified Leads:</span>
              <span className="text-lg font-bold text-gray-900">
                {(data || []).reduce((sum, source) => sum + source.value, 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadSourceChart;