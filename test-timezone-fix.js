// Test timezone conversion fix
function testTimezoneConversion() {
    console.log('Testing timezone fix...');
    
    const timestamp = '2025-09-11T03:00:00.000Z'; // 3AM UTC Wed = 11PM ET Tue
    const changeDateTime = new Date(timestamp);
    
    // OLD method
    const utcDate = changeDateTime.toISOString().split('T')[0];
    
    // NEW method
    const easternDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(changeDateTime);
    
    console.log('UTC date:', utcDate);
    console.log('Eastern date:', easternDateStr);
}
testTimezoneConversion();
