import React from 'react';
import { Calendar } from 'lucide-react';
import { TIME_RANGES } from '../../utils/constants';

const TimeRangeSelector = ({
  timeRange,
  customStartDate,
  customEndDate,
  onTimeRangeChange,
  onCustomStartDateChange,
  onCustomEndDateChange,
  label = "Time Range"
}) => {
  return (
    <div className="flex items-center space-x-4 flex-wrap">
      <div className="flex items-center space-x-2">
        <Calendar className="text-gray-400" size={20} />
        <select 
          value={timeRange} 
          onChange={(e) => {
            onTimeRangeChange(e.target.value);
            if (e.target.value !== TIME_RANGES.CUSTOM) {
              onCustomStartDateChange('');
              onCustomEndDateChange('');
            }
          }}
          className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value={TIME_RANGES.CURRENT_WEEK}>Current Week</option>
          <option value={TIME_RANGES.LAST_WEEK}>Last Week</option>
          <option value={TIME_RANGES.THIRTY_DAYS}>Last 30 Days</option>
          <option value={TIME_RANGES.NINETY_DAYS}>Last 90 Days</option>
          <option value={TIME_RANGES.CUSTOM}>Custom Range</option>
        </select>
      </div>

      {timeRange === TIME_RANGES.CUSTOM && (
        <div className="flex items-center space-x-2">
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => onCustomStartDateChange(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => onCustomEndDateChange(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}
    </div>
  );
};

export default TimeRangeSelector;