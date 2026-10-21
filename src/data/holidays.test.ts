import { describe, expect, it } from 'vitest';
import holidays from './timetable/holidays.json';
import { getDayType } from '../utils/dateUtils';
import { TimetableEngine } from '../engine/timetableEngine';
import type { CourseOffering, MeetingDay } from '../engine/types';

describe('2026 institute holidays', () => {
  it('contains all 17 dates exactly once', () => {
    expect(holidays.map(h => h.date)).toEqual([
      '2026-01-26', '2026-03-04', '2026-03-21', '2026-03-31', '2026-04-03',
      '2026-05-01', '2026-05-27', '2026-06-26', '2026-08-15', '2026-08-26',
      '2026-09-14', '2026-10-02', '2026-10-19', '2026-10-20', '2026-11-08',
      '2026-11-24', '2026-12-25',
    ]);
  });
  it.each(holidays)('$date changes transport/mess schedules and removes classes', holiday => {
    const date = new Date(`${holiday.date}T00:01:00`);
    expect(getDayType(date)).toBe(date.getDay() === 0 ? 'sunday' : 'saturday');
    const day = date.toLocaleDateString('en-US', { weekday: 'long' }) as MeetingDay;
    const course: CourseOffering = {
      id: 'TEST', courseCode: 'TEST', courseName: 'Test', credits: '3', category: 'core',
      meetings: [{ type: 'lecture', day, startTime: '10:00', endTime: '11:00', room: '', instructors: [], recurrence: { type: 'weekly' } }],
    };
    expect(TimetableEngine.resolveWeek([course], holidays, { targetWeek: date }).events).toHaveLength(0);
  });
});
