import { TIME_RANGES } from './constants';

export const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

export const getDateRange = (timeRangeType = 'main', timeRange, customStart = '', customEnd = '') => {
  if (customStart && customEnd) {
    return {
      start: new Date(customStart),
      end: new Date(customEnd + 'T23:59:59.999Z')
    };
  }

  const end = new Date();
  const start = new Date();

  switch (timeRange) {
    case TIME_RANGES.CURRENT_WEEK:
      const currentWeekStart = getWeekStart(end);
      return { start: currentWeekStart, end };
    case TIME_RANGES.LAST_WEEK:
      const lastWeekEnd = new Date(getWeekStart(end));
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      const lastWeekStart = getWeekStart(lastWeekEnd);
      return { start: lastWeekStart, end: lastWeekEnd };
    case TIME_RANGES.THIRTY_DAYS:
      start.setDate(start.getDate() - 30);
      break;
    case TIME_RANGES.NINETY_DAYS:
      start.setDate(start.getDate() - 90);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }
  return { start, end };
};

export const getBusinessDays = (startDate, endDate) => {
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  let businessDays = 0;
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays++;
    }
  }
  return businessDays;
};

export const isDateInRange = (dateStr, startDate, endDate) => {
  const date = new Date(dateStr);
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const rangeStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const rangeEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  
  return dateStart >= rangeStart && dateStart <= rangeEnd;
};