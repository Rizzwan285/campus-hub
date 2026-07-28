import { 
  CourseOffering, 
  Holiday, 
  EngineOptions, 
  ResolveResult, 
  CalendarEvent, 
  Collision, 
  TimetableMeeting,
  RecurrenceRule
} from './types';

// Helper to convert "HH:MM" to minutes for easy comparison
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

// Map day names to JS Date day indices (0 = Sunday, 1 = Monday, etc.)
const DAY_MAP: Record<string, number> = {
  'Sunday': 0,
  'Monday': 1,
  'Tuesday': 2,
  'Wednesday': 3,
  'Thursday': 4,
  'Friday': 5,
  'Saturday': 6
};

export const TimetableEngine = {
  /**
   * Evaluates recurrence rule against the target week.
   * Assuming week parity is based on standard ISO week numbers or a specific epoch.
   * For this implementation, we simulate it simply:
   * (targetWeek timestamp / week_ms) % 2 === 0 -> even
   */
  evaluateRecurrence(rule: RecurrenceRule, targetWeek: Date): boolean {
    if (rule.type === 'weekly') return true;
    
    // Simplistic parity calculation using week numbers
    // In a real academic system, week 1 is the first week of the semester.
    // Assuming even/odd based on the week of the year for now.
    const startOfYear = new Date(targetWeek.getFullYear(), 0, 1);
    const pastDaysOfYear = (targetWeek.getTime() - startOfYear.getTime()) / 86400000;
    const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
    
    const isEven = weekNum % 2 === 0;

    if (rule.type === 'biweekly_even' && isEven) return true;
    if (rule.type === 'biweekly_odd' && !isEven) return true;
    
    return false; // custom or mismatch
  },

  /**
   * Checks if a given date matches any holiday.
   */
  isHoliday(date: Date, holidays: Holiday[]): Holiday | null {
    // Convert target Date to YYYY-MM-DD
    const isoDate = date.toISOString().split('T')[0];
    return holidays.find(h => h.date === isoDate) || null;
  },

  /**
   * Detects overlapping meetings within the provided courses.
   */
  detectCollisions(courses: CourseOffering[]): Collision[] {
    const collisions: Collision[] = [];
    
    // Flatten all meetings and retain course association
    const allMeetings: { courseId: string, meeting: TimetableMeeting }[] = [];
    courses.forEach(c => {
      c.meetings.forEach(m => allMeetings.push({ courseId: c.id, meeting: m }));
    });

    // Group by day
    const meetingsByDay: Record<string, typeof allMeetings> = {};
    allMeetings.forEach(item => {
      if (!meetingsByDay[item.meeting.day]) meetingsByDay[item.meeting.day] = [];
      meetingsByDay[item.meeting.day].push(item);
    });

    // Check overlaps day by day
    for (const [day, dailyMeetings] of Object.entries(meetingsByDay)) {
      // Sort by start time
      dailyMeetings.sort((a, b) => timeToMinutes(a.meeting.startTime) - timeToMinutes(b.meeting.startTime));

      for (let i = 0; i < dailyMeetings.length - 1; i++) {
        const current = dailyMeetings[i];
        const next = dailyMeetings[i + 1];
        
        // If they belong to the same course, it's not a collision between different courses, 
        // though technically a course shouldn't overlap itself. We skip same-course overlaps here.
        if (current.courseId === next.courseId) continue;

        // Check if current overlaps with next
        if (timeToMinutes(current.meeting.endTime) > timeToMinutes(next.meeting.startTime)) {
          collisions.push({
            courseIdA: current.courseId,
            courseIdB: next.courseId,
            conflictingDay: day,
            timeWindow: `${current.meeting.startTime} - ${current.meeting.endTime}`
          });
        }
      }
    }

    return collisions;
  },

  /**
   * Resolves selected courses into concrete CalendarEvents for a specific week.
   */
  resolveWeek(
    selectedCourses: CourseOffering[], 
    holidays: Holiday[], 
    options: EngineOptions
  ): ResolveResult {
    const events: CalendarEvent[] = [];
    const holidaysEncountered: Holiday[] = [];
    
    // 1. Detect collisions
    const collisions = this.detectCollisions(selectedCourses);

    // 2. Find the Sunday of the targetWeek as an anchor
    const anchor = new Date(options.targetWeek);
    const dayOfWeek = anchor.getDay();
    anchor.setDate(anchor.getDate() - dayOfWeek); // Move to Sunday

    selectedCourses.forEach(course => {
      course.meetings.forEach((meeting, index) => {
        // Evaluate Recurrence
        if (!this.evaluateRecurrence(meeting.recurrence, options.targetWeek)) return;

        // Calculate specific date for this meeting
        const targetDayIndex = DAY_MAP[meeting.day];
        if (targetDayIndex === undefined) return;

        const meetingDate = new Date(anchor);
        meetingDate.setDate(anchor.getDate() + targetDayIndex);

        // Check Holiday
        const holiday = this.isHoliday(meetingDate, holidays);
        if (holiday) {
          if (!holidaysEncountered.some(h => h.date === holiday.date)) {
            holidaysEncountered.push(holiday);
          }
          return; // Skip this event because it's a holiday
        }

        // Parse Start and End Times
        const [startHH, startMM] = meeting.startTime.split(':').map(Number);
        const [endHH, endMM] = meeting.endTime.split(':').map(Number);

        const startTime = new Date(meetingDate);
        startTime.setHours(startHH, startMM, 0, 0);

        const endTime = new Date(meetingDate);
        endTime.setHours(endHH, endMM, 0, 0);

        events.push({
          id: `${course.id}_${meeting.day}_${meeting.startTime}_${index}`,
          courseId: course.id,
          courseCode: course.courseCode,
          courseName: course.courseName,
          type: meeting.type,
          startTime,
          endTime,
          room: meeting.room || 'TBA'
        });
      });
    });

    return {
      events,
      collisions,
      holidaysEncountered
    };
  }
};
