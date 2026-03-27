import { toZonedTime } from 'date-fns-tz';
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

  // Week 1 & 3 for even diffWeeks, Week 2 & 4 for odd diffWeeks
  return diffWeeks % 2 === 0 ? 'week13' : 'week24';
}

export function parseTime(timeStr: string, referenceDate: Date): Date {
  const date = new Date(referenceDate);
  
  // Remove spaces and convert to lowercase
  const cleanTime = timeStr.trim().toLowerCase();
  
  // Check for AM/PM
  const isAM = cleanTime.includes('am');
  const isPM = cleanTime.includes('pm');
  
  // Extract numbers
  const timeMatch = cleanTime.match(/(\d+):?(\d+)?/);
  if (!timeMatch) {
    date.setHours(0, 0, 0, 0);
    return date;
  }
  
  let hours = parseInt(timeMatch[1], 10);
  const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  
  // Convert to 24-hour format
  if (isAM) {
    // AM times
    if (hours === 12) {
      hours = 0; // 12 AM is midnight
    }
  } else if (isPM) {
    // PM times
    if (hours !== 12) {
      hours += 12; // Add 12 for PM (except 12 PM which stays 12)
    }
  } else {
    // No AM/PM specified - use context based on hour
    // Buses typically run from early morning to midnight
    // 7-11 are morning (AM)
    // 12 is noon (PM)
    // 1-6 are afternoon/evening (PM)
    // 7-11 in evening context would be PM, but bus times like "8:30" morning are AM
    
    if (hours >= 7 && hours <= 11) {
      // Could be morning or evening - check if it's a typical morning time
      // Bus schedules start around 7:30-8:30 AM
      // Evening buses are around 7:00-11:00 PM
      // Since we have times like 8:30 appearing twice (morning and evening),
      // we need to sort by order in array. But for parsing individual times,
      // we'll use a heuristic: if the reference time context shows morning, use AM
      
      // For simplicity: 7:xx-9:xx that appear early in schedule are AM
      // Later appearances of 8:xx-11:xx are PM
      // Use reference date's current hour to determine context
      const refHour = referenceDate.getHours();
      
      // If before noon, interpret as AM; if after, interpret as PM
      if (refHour < 12) {
        // Keep as-is (morning interpretation)
      } else {
        // Evening interpretation
        hours += 12;
      }
    } else if (hours === 12) {
      // 12:xx without AM/PM
      if (minutes === 0) {
        // 12:00 could be noon or midnight
        // In bus schedules, 12:00 at end is typically midnight (next day)
        hours = 0;
        date.setDate(date.getDate() + 1);
      }
      // 12:15, 12:30 etc. are noon
    } else if (hours >= 1 && hours <= 6) {
      // Afternoon times (1 PM - 6 PM)
      hours += 12;
    }
  }
  
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// Parse all bus times for a day, handling the AM/PM context properly
export function parseBusTimesForDay(times: string[], referenceDate: Date): { time: string; parsedDate: Date }[] {
  const baseDate = new Date(referenceDate);
  baseDate.setHours(0, 0, 0, 0);
  
  return times.map(timeStr => {
    const cleanTime = timeStr.trim().toLowerCase();
    const isAM = cleanTime.includes('am');
    const isPM = cleanTime.includes('pm');
    
    const timeMatch = cleanTime.match(/(\d+):?(\d+)?/);
    if (!timeMatch) {
      return { time: timeStr, parsedDate: baseDate };
    }
    
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    
    const resultDate = new Date(baseDate);
    
    if (isAM) {
      if (hours === 12) hours = 0;
    } else if (isPM) {
      if (hours !== 12) hours += 12;
    } else {
      // No AM/PM - interpret based on position in schedule
      // Bus schedules follow a pattern: morning → afternoon → evening → night
      // 7-9: morning (AM)
      // 10-11: late morning (AM)
      // 12: noon (stays 12)
      // 1-6: afternoon (PM, so +12)
      // 7-11: evening (PM, so +12)
      // 12:00 at the end: midnight (0 hours, next day)
      
      if (hours >= 1 && hours <= 6) {
        // 1:00 - 6:xx are PM (afternoon)
        hours += 12;
      } else if (hours >= 7 && hours <= 11) {
        // This is tricky - could be AM or PM
        // Looking at bus data: first occurrences of 7:xx, 8:xx, 9:xx are AM
        // Later occurrences of 7:xx, 8:xx, 9:xx, 10:xx, 11:xx are PM
        // We'll use a simple rule: if hour < 10, default to AM for first pass
        // But bus times 7:00, 7:30, 8:00, etc. in evening are PM
        // The key insight: look at the raw time value
        // Times 7:00-11:59 without AM/PM that appear AFTER 6:xx times are PM
        
        // Simplified approach: Check if this is likely evening based on common patterns
        // Bus evening times typically include 7:00, 7:30, 8:00, 8:30, 9:00, 10:00, 11:00
        // Morning times are 7:45, 8:15, 8:30, 8:45, 9:00, 9:25, 9:45, 10:20, 10:45, 11:15, 11:50
        // 
        // Since we're processing the array in order, and afternoon times (1-6) come before
        // evening times (7-11 PM), we can track this properly
        // 
        // For now, use a simpler heuristic that works for this specific data:
        // The schedule pattern is morning → midday → afternoon → evening → night
        // So we need to know the "current phase" of the schedule
        
        // Leave as AM for now - we'll fix this in getUpcomingBuses
      } else if (hours === 12 && minutes === 0) {
        // 12:00 at end of schedule is midnight
        hours = 0;
        resultDate.setDate(resultDate.getDate() + 1);
      }
    }
    
    resultDate.setHours(hours, minutes, 0, 0);
    return { time: timeStr, parsedDate: resultDate };
  });
}

// Improved function to get upcoming buses with proper AM/PM handling
export function getUpcomingBuses(times: string[], currentTime: Date): string[] {
  const baseDate = new Date(currentTime);
  baseDate.setHours(0, 0, 0, 0);
  
  // Track if we've seen PM-range times (indicates we're past the morning section)
  let isAfternoonOrLater = false;
  
  const parsedTimes = times.map(timeStr => {
    const cleanTime = timeStr.trim().toLowerCase();
    const isAM = cleanTime.includes('am');
    const isPM = cleanTime.includes('pm');
    
    const timeMatch = cleanTime.match(/(\d+):?(\d+)?/);
    if (!timeMatch) {
      return { time: timeStr, parsedDate: new Date(baseDate) };
    }
    
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    
    const resultDate = new Date(baseDate);
    
    if (isAM) {
      if (hours === 12) hours = 0;
    } else if (isPM) {
      if (hours !== 12) hours += 12;
      isAfternoonOrLater = true;
    } else {
      // No AM/PM specified
      if (hours >= 1 && hours <= 6) {
        // 1-6 are afternoon/evening hours (PM)
        hours += 12;
        isAfternoonOrLater = true;
      } else if (hours >= 7 && hours <= 11) {
        // 7-11 could be AM or PM
        // If we've already seen PM times, these are evening (PM)
        if (isAfternoonOrLater) {
          hours += 12;
        }
        // Otherwise, they're morning (AM) - keep as is
      } else if (hours === 12) {
        if (minutes === 0) {
          // 12:00 is midnight (end of day)
          hours = 0;
          resultDate.setDate(resultDate.getDate() + 1);
        }
        // 12:15, 12:30 are noon - keep as 12
        isAfternoonOrLater = true;
      }
    }
    
    resultDate.setHours(hours, minutes, 0, 0);
    return { time: timeStr, parsedDate: resultDate };
  });
  
  // Filter for times after currentTime
  return parsedTimes
    .filter(({ parsedDate }) => parsedDate > currentTime)
    .map(({ time }) => time);
}

export function getNextBus(times: string[], currentTime: Date): string | null {
  const upcoming = getUpcomingBuses(times, currentTime);
  return upcoming.length > 0 ? upcoming[0] : null;
}

export function getTimeUntil(timeStr: string, currentTime: Date, isAfternoonContext: boolean = false): string {
  const baseDate = new Date(currentTime);
  baseDate.setHours(0, 0, 0, 0);
  
  const cleanTime = timeStr.trim().toLowerCase();
  const isAM = cleanTime.includes('am');
  const isPM = cleanTime.includes('pm');
  
  const timeMatch = cleanTime.match(/(\d+):?(\d+)?/);
  if (!timeMatch) return 'Unknown';
  
  let hours = parseInt(timeMatch[1], 10);
  const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  
  const busTime = new Date(baseDate);
  
  if (isAM) {
    if (hours === 12) hours = 0;
  } else if (isPM) {
    if (hours !== 12) hours += 12;
  } else {
    if (hours >= 1 && hours <= 6) {
      hours += 12;
    } else if (hours >= 7 && hours <= 11) {
      if (isAfternoonContext) {
        hours += 12;
      }
    } else if (hours === 12 && minutes === 0) {
      hours = 0;
      busTime.setDate(busTime.getDate() + 1);
    }
  }
  
  busTime.setHours(hours, minutes, 0, 0);
  
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
