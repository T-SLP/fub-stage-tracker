// Test the actual getDateRange function from dashboard
const { TIME_RANGES } = require('./dashboard/utils/constants.js');

// Copy the functions from dataProcessing.js
const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

const getDateRange = (timeRangeType = 'main', timeRange, customStart = '', customEnd = '', campaignTimeRange, campaignCustomStartDate, campaignCustomEndDate, leadSourceTimeRange, leadSourceCustomStartDate, leadSourceCustomEndDate) => {
  let selectedTimeRange, selectedCustomStart, selectedCustomEnd;
  
  if (timeRangeType === 'campaign') {
    selectedTimeRange = campaignTimeRange;
    selectedCustomStart = campaignCustomStartDate;
    selectedCustomEnd = campaignCustomEndDate;
  } else if (timeRangeType === 'leadSource') {
    selectedTimeRange = leadSourceTimeRange;
    selectedCustomStart = leadSourceCustomStartDate;
    selectedCustomEnd = leadSourceCustomEndDate;
  } else {
    selectedTimeRange = timeRange;
    selectedCustomStart = customStart;
    selectedCustomEnd = customEnd;
  }

  if (selectedCustomStart && selectedCustomEnd) {
    return {
      start: new Date(selectedCustomStart),
      end: new Date(selectedCustomEnd + 'T23:59:59.999Z')
    };
  }

  const end = new Date();
  const start = new Date();

  switch (selectedTimeRange) {
    case 'current_week':
      const currentWeekStart = getWeekStart(end);
      return { start: currentWeekStart, end };
    case 'last_week':
      const lastWeekEnd = new Date(getWeekStart(end));
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      const lastWeekStart = getWeekStart(lastWeekEnd);
      return { start: lastWeekStart, end: lastWeekEnd };
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }
  return { start, end };
};

console.log('Testing getDateRange function with current_week:');
const result = getDateRange('main', TIME_RANGES.CURRENT_WEEK, '', '', '', '', '', '', '', '');
console.log('Result:', {
  start: result.start.toISOString().split('T')[0],
  end: result.end.toISOString().split('T')[0]
});

// Test what the API would be called with
console.log('\nAPI would be called with:');
console.log(`startDate: ${result.start.toISOString().split('T')[0]}`);
console.log(`endDate: ${result.end.toISOString().split('T')[0]}`);

// Compare with known API call
console.log('\nBut we observed API debug showing: 2025-09-08 to 2025-09-09');
console.log('Expected: 2025-09-07 to 2025-09-09');

const isCorrect = result.start.toISOString().split('T')[0] === '2025-09-07' && 
                  result.end.toISOString().split('T')[0] === '2025-09-09';
console.log(`\nIs getDateRange working correctly: ${isCorrect}`);