import React from 'react';
import { CHART_TYPES } from '../../utils/constants';

const ChartTypeToggle = ({ chartType, onChartTypeChange }) => {
  return (
    <div className="flex items-center space-x-2">
      <select
        value={chartType}
        onChange={(e) => onChartTypeChange(e.target.value)}
        className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value={CHART_TYPES.DAILY}>Daily View</option>
        <option value={CHART_TYPES.WEEKLY}>Weekly View</option>
      </select>
    </div>
  );
};

export default ChartTypeToggle;