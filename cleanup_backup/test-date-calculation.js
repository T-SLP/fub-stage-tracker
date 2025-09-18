// Test date calculation logic from dashboard
const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

const today = new Date();
const currentWeekStart = getWeekStart(today);

console.log('Frontend date calculation:');
console.log(`Today: ${today.toISOString().split('T')[0]}`);
console.log(`Current week start (calculated): ${currentWeekStart.toISOString().split('T')[0]}`);
console.log(`This should be: 2025-09-07 (last Sunday)`);

// Test the API date range calculation
const getDateRange = (timeRange) => {
  const end = new Date();
  const start = new Date();

  switch (timeRange) {
    case 'current_week':
      const currentWeekStart = getWeekStart(end);
      return { start: currentWeekStart, end };
    default:
      start.setDate(start.getDate() - 30);
  }
  return { start, end };
};

const { start, end } = getDateRange('current_week');
console.log(`\nAPI will be called with:`);
console.log(`Start: ${start.toISOString().split('T')[0]}`);  
console.log(`End: ${end.toISOString().split('T')[0]}`);

console.log('\nBut frontend recalculates week as:');
console.log(`Week start: ${currentWeekStart.toISOString().split('T')[0]}`);
console.log(`Today: ${today.toISOString().split('T')[0]}`);

// Test if they match
const match = start.toDateString() === currentWeekStart.toDateString();
console.log(`\nDate calculations match: ${match}`);

if (!match) {
  console.log('❌ MISMATCH: API gets data for one week range, frontend counts different week range!');
}