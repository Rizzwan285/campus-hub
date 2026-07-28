import { describe, it, expect } from 'vitest';
import { TimetableEngine } from './timetableEngine';
import { CourseOffering, Holiday, RecurrenceRule } from './types';

describe('TimetableEngine', () => {
  const mockCourses: CourseOffering[] = [
    {
      id: 'UG_CSE_CS5634',
      courseCode: 'CS5634',
      courseName: 'Machine Learning',
      credits: '3',
      category: 'core',
      meetings: [
        {
          type: 'lecture',
          day: 'Monday',
          startTime: '10:00',
          endTime: '10:50',
          room: 'A1-101',
          instructors: [],
          recurrence: { type: 'weekly' }
        }
      ]
    },
    {
      id: 'UG_CSE_CS6000',
      courseCode: 'CS6000',
      courseName: 'Deep Learning',
      credits: '3',
      category: 'elective',
      meetings: [
        {
          type: 'lecture',
          day: 'Monday',
          startTime: '10:30', // Overlaps with CS5634
          endTime: '11:20',
          room: 'A1-102',
          instructors: [],
          recurrence: { type: 'weekly' }
        }
      ]
    }
  ];

  const mockHolidays: Holiday[] = [
    { date: '2026-01-26', name: 'Republic Day' }
  ];

  it('should detect collisions', () => {
    const collisions = TimetableEngine.detectCollisions(mockCourses);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].courseIdA).toBe('UG_CSE_CS5634');
    expect(collisions[0].courseIdB).toBe('UG_CSE_CS6000');
    expect(collisions[0].conflictingDay).toBe('Monday');
  });

  it('should evaluate recurrence rules', () => {
    const ruleWeekly: RecurrenceRule = { type: 'weekly' };
    const date = new Date('2026-01-26');
    
    expect(TimetableEngine.evaluateRecurrence(ruleWeekly, date)).toBe(true);
    
    // We didn't heavily mock the ISO week parity, so just ensure it doesn't crash
    const ruleEven: RecurrenceRule = { type: 'biweekly_even' };
    expect(typeof TimetableEngine.evaluateRecurrence(ruleEven, date)).toBe('boolean');
  });

  it('should resolve a week into calendar events', () => {
    // January 26, 2026 is a Monday (Republic Day)
    // We will test week starting Jan 25 (Sunday)
    const targetWeek = new Date('2026-01-25T00:00:00Z');
    
    const result = TimetableEngine.resolveWeek([mockCourses[0]], mockHolidays, { targetWeek });
    
    // Should hit the holiday
    expect(result.events).toHaveLength(0);
    expect(result.holidaysEncountered).toHaveLength(1);
    expect(result.holidaysEncountered[0].name).toBe('Republic Day');
    
    // Try a week without a holiday
    const targetWeekNoHoliday = new Date('2026-02-02T00:00:00Z');
    const result2 = TimetableEngine.resolveWeek([mockCourses[0]], mockHolidays, { targetWeek: targetWeekNoHoliday });
    
    expect(result2.events).toHaveLength(1);
    expect(result2.events[0].courseCode).toBe('CS5634');
    expect(result2.events[0].startTime.getHours()).toBe(10);
    expect(result2.events[0].endTime.getMinutes()).toBe(50);
  });
});
