import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { holidays2025, specialDays2025 } from '@/data/busData';

export const TIMEZONE = 'Asia/Kolkata';

export function getCurrentTimeInKolkata(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

export function getDateInKolkata(date?: Date): Date {
  const targetDate = date || new Date();
  return toZonedTime(targetDate, TIMEZONE);
}

export type DayType = 'weekday' | 'saturday' | 'sunday';

export function getDayType(date: Date): DayType {
  const dayOfWeek = date.getDay();
  const dateStr = date.toISOString().split('T')[0];

  // Check if it's a special instructional day (treat as weekday)
  const isInstructionalDay = specialDays2025.some(
    special => special.date === dateStr && special.type === 'instructional'
  );
  
  if (isInstructionalDay) {
    return 'weekday';
  }

  // Check if it's a holiday
  const isHoliday = holidays2025.some(holiday => holiday.date === dateStr);
  
  if (dayOfWeek === 0) return 'sunday';
  if (dayOfWeek === 6 || isHoliday) return 'saturday';
  return 'weekday';
}

export function getWeekCycle(date: Date): 'week13' | 'week24' {
  // Calculate week number from start of semester (July 30, 2025)
  const semesterStart = new Date('2025-07-30');
  const diffTime = Math.abs(date.getTime() - semesterStart.getTime());
  const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
  
  // Week 1 & 3 for odd weeks, Week 2 & 4 for even weeks
  return diffWeeks % 2 === 0 ? 'week13' : 'week24';
}

export function parseTime(timeStr: string, referenceDate: Date): Date {
  const date = new Date(referenceDate);
  
  // Handle various time formats
  let hours = 0;
  let minutes = 0;
  
  // Remove spaces and convert to lowercase
  const cleanTime = timeStr.trim().toLowerCase();
  
  // Check for AM/PM
  const isAM = cleanTime.includes('am');
  const isPM = cleanTime.includes('pm');
  
  // Extract numbers
  const timeMatch = cleanTime.match(/(\d+):?(\d+)?/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    
    // Convert to 24-hour format
    if (isPM && hours !== 12) {
      hours += 12;
    } else if (isAM && hours === 12) {
      hours = 0;
    } else if (!isAM && !isPM) {
      // For times without AM/PM:
      // Morning times: 7-11 are AM (7:00-11:59)
      // Afternoon: 12-7 stay as is for PM interpretation (12:00-7:59 PM)
      // Evening/Night: 8-11 are PM (8:00-11:59 PM)
      // Midnight: 12:00 at end of schedule is next day (00:00)
      if (hours >= 1 && hours <= 7) {
        // Early morning hours or late night continuation
        if (hours < 7) {
          // 1:00-6:59 are AM next day
          hours += 12;
          if (hours >= 24) hours -= 24;
        } else {
          // 7:xx is morning
          hours = hours;
        }
      } else if (hours === 8 || hours === 9 || hours === 10 || hours === 11) {
        // Evening times 8-11 PM
        hours += 12;
      } else if (hours === 12) {
        // 12:00 can be noon or midnight
        // If minutes are 00, 15, 30, context suggests it's likely noon for 12:15, 12:30
        // But standalone 12:00 at the end is midnight (next day)
        if (minutes === 0) {
          // Treat 12:00 as midnight (00:00 next day)
          hours = 0;
          // Don't add a day here, handle in filtering logic
        } else {
          // 12:15, 12:30 etc. are noon
          hours = 12;
        }
      }
    }
  }
  
  date.setHours(hours, minutes, 0, 0);
  
  // Handle midnight transition: if we parsed as early morning (0-6 hours) 
  // and it's meant to be next day
  if (hours < 7 && cleanTime.match(/^(12:00|1:|2:|3:|4:|5:|6:)/)) {
    // This is next day early morning
    date.setDate(date.getDate() + 1);
  }
  
  return date;
}

export function getUpcomingBuses(times: string[], currentTime: Date): string[] {
  const currentDate = new Date(currentTime);
  
  return times.filter(timeStr => {
    const busTime = parseTime(timeStr, currentDate);
    return busTime > currentTime;
  });
}

export function getNextBus(times: string[], currentTime: Date): string | null {
  const upcoming = getUpcomingBuses(times, currentTime);
  return upcoming.length > 0 ? upcoming[0] : null;
}

export function getTimeUntil(timeStr: string, currentTime: Date): string {
  const busTime = parseTime(timeStr, currentTime);
  const diffMs = busTime.getTime() - currentTime.getTime();
  
  if (diffMs < 0) return 'Passed';
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  
  if (diffHours > 0) {
    return `${diffHours}h ${remainingMins}m`;
  }
  return `${diffMins}m`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE 
  });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: TIMEZONE
  });
}
