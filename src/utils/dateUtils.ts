import { toZonedTime } from 'date-fns-tz';
import { holidays2025, specialDays2025 } from '@/data/busData';

export const TIMEZONE = 'Asia/Kolkata';

export interface AcademicDaysData {
  holidays: Array<{ date: string; occasion: string }>;
  specialDays: Array<{ date: string; type: string; note: string }>;
}

// getDayType must stay synchronous (it runs in render paths), so server data
// arrives via this module-level swap — see useAcademicDaysSync().
let activeHolidays: AcademicDaysData['holidays'] = holidays2025;
let activeSpecialDays: AcademicDaysData['specialDays'] = specialDays2025;

export function setAcademicDays(data: AcademicDaysData): void {
  if (data.holidays?.length) activeHolidays = data.holidays;
  if (data.specialDays) activeSpecialDays = data.specialDays;
}

export function getCurrentTimeInKolkata(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

export function getDateInKolkata(date?: Date): Date {
  const targetDate = date || new Date();
  return toZonedTime(targetDate, TIMEZONE);
}

export type DayType = 'weekday' | 'friday' | 'saturday' | 'sunday';

export function getDayType(date: Date): DayType {
  const dayOfWeek = date.getDay();
  const dateStr = date.toISOString().split('T')[0];

  // Check if it's a special instructional day (treat as weekday)
  const isInstructionalDay = activeSpecialDays.some(
    special => special.date === dateStr && special.type === 'instructional'
  );

  if (isInstructionalDay) {
    return 'weekday';
  }

  // Check if it's a holiday
  const isHoliday = activeHolidays.some(holiday => holiday.date === dateStr);
  
  if (dayOfWeek === 0) return 'sunday';
  if (dayOfWeek === 6 || isHoliday) return 'saturday';
  if (dayOfWeek === 5) return 'friday';
  return 'weekday';
}

/**
 * Which half of the mess's two-week rotation `date` falls in.
 *
 * The alternation is anchored to a fixed semester start, so it never drifts on
 * its own — but it also cannot tell when the mess restarts its own count after
 * a break. `flipped` (an admin toggle, stored per mess) inverts the result to
 * realign the two without moving the anchor.
 */
export function getWeekCycle(date: Date, flipped = false): 'week13' | 'week24' {
  // Calculate week number from start of semester (July 30, 2025)
  const semesterStart = new Date('2025-07-30');
  const diffTime = Math.abs(date.getTime() - semesterStart.getTime());
  const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));

  // Week 1 & 3 for even diffWeeks, Week 2 & 4 for odd diffWeeks
  const isOdd = diffWeeks % 2 === 0;
  return isOdd !== flipped ? 'week13' : 'week24';
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
  
  let isAfternoonOrLater = false;
  let prevParsedHour = 0;
  
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
      isAfternoonOrLater = true;
    } else {
      // No AM/PM specified
      if (hours >= 1 && hours <= 6) {
        hours += 12;
        isAfternoonOrLater = true;
      } else if (hours >= 7 && hours <= 11) {
        if (isAfternoonOrLater) {
          hours += 12;
        }
      } else if (hours === 12) {
        if (isAfternoonOrLater && prevParsedHour >= 17 && minutes === 0) {
          // Midnight — end of schedule
          hours = 0;
          resultDate.setDate(resultDate.getDate() + 1);
        } else {
          // Noon
          isAfternoonOrLater = true;
        }
      }
    }
    
    resultDate.setHours(hours, minutes, 0, 0);
    prevParsedHour = hours;
    return { time: timeStr, parsedDate: resultDate };
  });
}

// Improved function to get upcoming buses with proper AM/PM handling
export function getUpcomingBuses(times: string[], currentTime: Date): string[] {
  const baseDate = new Date(currentTime);
  baseDate.setHours(0, 0, 0, 0);
  
  // Track if we've seen PM-range times (indicates we're past the morning section)
  let isAfternoonOrLater = false;
  // Track previous parsed hour to resolve ambiguous 12:00 (noon vs midnight)
  let prevParsedHour = 0;
  
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
        // 12:xx without AM/PM — distinguish noon from midnight.
        // If the previous parsed time was in the morning/early-afternoon range
        // (i.e. we haven't gone through evening yet), this is noon.
        // If we've already seen evening PM times (prevParsedHour >= 17),
        // then this 12:00 is midnight.
        if (isAfternoonOrLater && prevParsedHour >= 17 && minutes === 0) {
          // Midnight — end of schedule
          hours = 0;
          resultDate.setDate(resultDate.getDate() + 1);
        } else {
          // Noon — keep as 12
          isAfternoonOrLater = true;
        }
      }
    }
    
    resultDate.setHours(hours, minutes, 0, 0);
    prevParsedHour = hours;
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
