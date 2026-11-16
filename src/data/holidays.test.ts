import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import holidays from './timetable/holidays.json';
import { getDayType } from '../utils/dateUtils';
import { TimetableEngine } from '../engine/timetableEngine';
import type { CourseOffering, MeetingDay } from '../engine/types';

describe('2026 and 2027 institute holidays', () => {
  it('contains all 17 dates of 2026 exactly once', () => {
    expect(holidays.filter(h => h.date.startsWith('2026')).map(h => h.date)).toEqual([
      '2026-01-26', '2026-03-04', '2026-03-21', '2026-03-31', '2026-04-03',
      '2026-05-01', '2026-05-27', '2026-06-26', '2026-08-15', '2026-08-26',
      '2026-09-14', '2026-10-02', '2026-10-19', '2026-10-20', '2026-11-08',
      '2026-11-24', '2026-12-25',
    ]);
  });

  it('contains the 17 holidays of 2027 on 16 dates, in date order', () => {
    expect(holidays.filter(h => h.date.startsWith('2027')).map(h => h.date)).toEqual([
      '2027-01-15', '2027-01-26', '2027-03-10', '2027-03-23', '2027-03-26',
      '2027-04-19', '2027-05-17', '2027-05-20', '2027-06-16', '2027-08-15',
      '2027-10-02', '2027-10-08', '2027-10-09', '2027-10-29', '2027-11-14',
      '2027-12-25',
    ]);
    // academic_days keeps one row per date, so the two 15 August holidays share one.
    expect(holidays.find(h => h.date === '2027-08-15')?.name)
      .toBe("Independence Day & Prophet Mohammad's Birthday (Id-E-Milad)*");
    expect(holidays.filter(h => h.date.startsWith('2027') && h.name.includes('*')).map(h => h.date))
      .toEqual(['2027-03-10', '2027-05-17', '2027-06-16', '2027-08-15']);
    expect(new Set(holidays.map(h => h.date)).size).toBe(holidays.length);
  });

  it('matches migration 015 row for row', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../server/db/migrations/015_holidays_2027.sql'), 'utf8');
    const rows = [...sql.matchAll(/\('(\d{4}-\d{2}-\d{2})', '((?:[^']|'')*)', 'holiday'/g)]
      .map(([, date, name]) => ({ date, name: name.replace(/''/g, "'") }));
    expect(rows).toEqual(holidays.filter(h => h.date.startsWith('2027')));
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
