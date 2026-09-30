export interface RecurrenceRule {
  type: 'weekly' | 'biweekly_odd' | 'biweekly_even' | 'custom';
}

export type MeetingDay =
  | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface TimetableMeeting {
  type: 'lecture' | 'lab' | 'tutorial';
  // The published timetable only uses Monday–Friday, but professors schedule
  // extra classes on Saturdays, and students' own timings can say so.
  day: MeetingDay;
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
  /** Only the API sends this, so it also marks data that came from the server. */
  offeringId?: string;
  /** Set by the store when the student's own timings replace the official ones. */
  isPersonal?: boolean;
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
  /** The student's own timing for the course rather than the official one. */
  isPersonal?: boolean;
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
