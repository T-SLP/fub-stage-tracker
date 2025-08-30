import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_TYPES } from '../../utils/constants';

const VolumeComparisonChart = ({ data, visibleLines, chartType }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {chartType === CHART_TYPES.WEEKLY ? 'Weekly' : 'Daily'} Pipeline Activity
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
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
  );
};

export default VolumeComparisonChart;