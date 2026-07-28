export interface RecurrenceRule {
  type: 'weekly' | 'biweekly_odd' | 'biweekly_even' | 'custom';
}

export interface TimetableMeeting {
  type: 'lecture' | 'lab' | 'tutorial';
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  startTime: string; // "HH:MM" 24h
  endTime: string;   // "HH:MM" 24h
  room: string;
  instructors: string[];
  recurrence: RecurrenceRule;
}

export interface CourseOffering {
  id: string; // e.g., UG_CSE_CS5634
  courseCode: string;
  courseName: string;
  credits: string;
  category: 'core' | 'elective' | 'project' | 'backlog' | 'common';
  meetings: TimetableMeeting[];
}

export interface Holiday {
  date: string; // ISO Date "YYYY-MM-DD"
  name: string;
}

// Engine Output Types
export interface CalendarEvent {
  id: string; // unique event signature
  courseId: string; // The parent offeringId
  courseCode: string;
  courseName: string;
  type: 'lecture' | 'lab' | 'tutorial';
  startTime: Date; // Fully resolved JS Date for the target preview week
  endTime: Date;
  room: string;
}

export interface Collision {
  courseIdA: string;
  courseIdB: string;
  conflictingDay: string;
  timeWindow: string; // e.g., "10:00 - 11:15"
}

export interface EngineOptions {
  targetWeek: Date; // The anchor date to resolve "Monday" to an actual Date
  previewMode?: boolean; 
}

export interface ResolveResult {
  events: CalendarEvent[];
  collisions: Collision[];
  holidaysEncountered: Holiday[];
}
