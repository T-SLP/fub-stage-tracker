import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_TYPES } from '../../utils/constants';

const CombinedTrendChart = ({ data, visibleLines, chartType }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {chartType === CHART_TYPES.WEEKLY ? 'Weekly' : 'Daily'} Pipeline Activity
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
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
  );
};

export default CombinedTrendChart;