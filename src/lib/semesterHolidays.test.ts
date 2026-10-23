import { describe, expect, it } from 'vitest';
import { formatDaysAway, getSemesterWindow, groupHolidays } from './semesterHolidays';
import holidays2026 from '@/data/timetable/holidays.json';

const calendar = holidays2026.map(({ date, name }) => ({ date, occasion: name }));

describe('getSemesterWindow', () => {
  it('counts July into the Aug–Dec term so a break is never empty', () => {
    expect(getSemesterWindow(new Date(2026, 6, 15))).toEqual({
      label: 'Aug–Dec 2026',
      startKey: '2026-07-01',
      endKey: '2026-12-31',
    });
  });

  it('counts June into the Jan–May term', () => {
    expect(getSemesterWindow(new Date(2026, 5, 10)).label).toBe('Jan–May 2026');
    expect(getSemesterWindow(new Date(2026, 0, 2)).endKey).toBe('2026-06-30');
  });
});

describe('groupHolidays', () => {
  const today = new Date(2026, 9, 23); // 23 Oct 2026

  it('lists only this semester, in date order', () => {
    const { thisSemester } = groupHolidays(calendar, today);

    expect(thisSemester.map((entry) => entry.date)).toEqual([
      '2026-08-15', '2026-08-26', '2026-09-14', '2026-10-02',
      '2026-10-19', '2026-10-20', '2026-11-08', '2026-11-24', '2026-12-25',
    ]);
  });

  it('marks what has already gone and how far off the rest are', () => {
    const { thisSemester } = groupHolidays(calendar, today);
    const independence = thisSemester.find((entry) => entry.date === '2026-08-15');
    const diwali = thisSemester.find((entry) => entry.date === '2026-11-08');

    expect(independence?.past).toBe(true);
    expect(independence?.onWeekend).toBe(true); // 15 Aug 2026 is a Saturday
    expect(diwali?.past).toBe(false);
    expect(diwali?.daysAway).toBe(16);
  });

  it('names the next holiday still to come', () => {
    expect(groupHolidays(calendar, today).next?.occasion).toBe('Diwali (Deepavali)');
    expect(groupHolidays(calendar, new Date(2026, 9, 19)).next?.date).toBe('2026-10-19');
  });

  it('treats a holiday today as still to come, not past', () => {
    const { next } = groupHolidays(calendar, new Date(2026, 10, 8));

    expect(next?.date).toBe('2026-11-08');
    expect(next?.daysAway).toBe(0);
  });

  it('lists the next holidays beyond the semester separately', () => {
    const { thisSemester, afterSemester } = groupHolidays(
      [...calendar, { date: '2027-01-26', occasion: 'Republic Day' }],
      today,
    );

    expect(thisSemester.some((entry) => entry.date === '2027-01-26')).toBe(false);
    expect(afterSemester.map((entry) => entry.date)).toEqual(['2027-01-26']);
  });

  it('caps the after-semester list', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      date: `2027-0${i + 1}-01`,
      occasion: `Holiday ${i + 1}`,
    }));

    expect(groupHolidays(many, today).afterSemester).toHaveLength(4);
    expect(groupHolidays(many, today, 2).afterSemester).toHaveLength(2);
  });

  it('keeps one entry per date, preferring the first (the API answer)', () => {
    const { thisSemester } = groupHolidays(
      [{ date: '2026-12-25', occasion: 'Christmas (admin edit)' }, ...calendar],
      today,
    );
    const christmas = thisSemester.filter((entry) => entry.date === '2026-12-25');

    expect(christmas).toHaveLength(1);
    expect(christmas[0].occasion).toBe('Christmas (admin edit)');
  });

  it('reads a holiday key as a local wall date, not a UTC instant', () => {
    const [entry] = groupHolidays([{ date: '2026-01-26', occasion: 'Republic Day' }], new Date(2026, 0, 1)).thisSemester;

    expect(entry.at.getDate()).toBe(26);
    expect(entry.at.getMonth()).toBe(0);
  });
});

describe('formatDaysAway', () => {
  it('reads naturally for the near dates', () => {
    expect(formatDaysAway(0)).toBe('Today');
    expect(formatDaysAway(1)).toBe('Tomorrow');
    expect(formatDaysAway(16)).toBe('in 16 days');
  });
});
