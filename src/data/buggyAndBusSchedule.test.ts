import { describe, it, expect } from 'vitest';
import {
  workingDaysBuggy,
  saturdayHolidayBuggy,
  sundayBuggy,
  BUGGY_DISCLAIMER,
} from './buggyData';
import {
  workingDaysBus,
  saturdayHolidayBus,
  sundayBus,
} from './busData';

describe('Buggy Schedule Data', () => {
  it('has 21 buggy trips for working days in both directions', () => {
    expect(workingDaysBuggy.nilaToSahyadri).toHaveLength(21);
    expect(workingDaysBuggy.sahyadriToNila).toHaveLength(21);

    expect(workingDaysBuggy.nilaToSahyadri[0]).toBe('8:15 AM');
    expect(workingDaysBuggy.nilaToSahyadri[workingDaysBuggy.nilaToSahyadri.length - 1]).toBe('2:00 AM');

    expect(workingDaysBuggy.sahyadriToNila[0]).toBe('8:00 AM');
    expect(workingDaysBuggy.sahyadriToNila[workingDaysBuggy.sahyadriToNila.length - 1]).toBe('2:15 AM');
  });

  it('has 21 Nila->Sahyadri and 20 Sahyadri->Nila trips for Saturdays/Holidays', () => {
    expect(saturdayHolidayBuggy.nilaToSahyadri).toHaveLength(21);
    expect(saturdayHolidayBuggy.sahyadriToNila).toHaveLength(20);

    expect(saturdayHolidayBuggy.nilaToSahyadri[0]).toBe('8:00 AM');
    expect(saturdayHolidayBuggy.nilaToSahyadri[saturdayHolidayBuggy.nilaToSahyadri.length - 1]).toBe('2:00 AM');

    expect(saturdayHolidayBuggy.sahyadriToNila[0]).toBe('8:45 AM');
    expect(saturdayHolidayBuggy.sahyadriToNila[saturdayHolidayBuggy.sahyadriToNila.length - 1]).toBe('2:15 AM');
  });

  it('has strictly NO buggy service on Sundays', () => {
    expect(sundayBuggy.nilaToSahyadri).toEqual([]);
    expect(sundayBuggy.sahyadriToNila).toEqual([]);
  });

  it('contains the mandatory tentative disclaimer', () => {
    expect(BUGGY_DISCLAIMER).toBe(
      'These are tentative timings and may vary due to availability or prior allotments.'
    );
  });
});

describe('Bus Timings Verification & Additions', () => {
  it('includes 9:00 AM from town in working days Nila->Sahyadri', () => {
    expect(workingDaysBus.nilaToSahyadri).toContain('9:00');
    // Pre-existing 8:55 preserved
    expect(workingDaysBus.nilaToSahyadri).toContain('8:55');
  });

  it('includes 8:45, 9:00, 8:37*, and 12:10* in working days Sahyadri->Nila', () => {
    expect(workingDaysBus.sahyadriToNila).toContain('8:45');
    expect(workingDaysBus.sahyadriToNila).toContain('9:00');
    expect(workingDaysBus.sahyadriToNila).toContain('8:37*');
    expect(workingDaysBus.sahyadriToNila).toContain('12:10*');

    // Pre-existing 8:55 and 1:55 preserved
    expect(workingDaysBus.sahyadriToNila).toContain('8:55');
    expect(workingDaysBus.sahyadriToNila).toContain('1:55');
  });

  it('includes 8:00, 8:37*, and 12:10* in Saturday/Holiday Sahyadri->Nila', () => {
    expect(saturdayHolidayBus.sahyadriToNila).toContain('8:00');
    expect(saturdayHolidayBus.sahyadriToNila).toContain('8:37*');
    expect(saturdayHolidayBus.sahyadriToNila).toContain('12:10*');

    // Pre-existing 8:15 preserved
    expect(saturdayHolidayBus.sahyadriToNila).toContain('8:15');
  });

  it('keeps Sunday bus schedule unmodified and separate', () => {
    expect(sundayBus.nilaToSahyadri).toHaveLength(21);
    expect(sundayBus.sahyadriToNila).toHaveLength(21);
    expect(sundayBus.nilaToSahyadri[0]).toBe('8:45');
    expect(sundayBus.sahyadriToNila[0]).toBe('8:00');
  });

  it('does NOT mark 8:37* or 12:10* as multiple buses', () => {
    const s2nWorkingIndex = workingDaysBus.sahyadriToNila.indexOf('8:37*');
    const s2nWorkingMidnightIndex = workingDaysBus.sahyadriToNila.indexOf('12:10*');
    expect(workingDaysBus.multipleBusPositions?.sahyadriToNila).not.toContain(s2nWorkingIndex);
    expect(workingDaysBus.multipleBusPositions?.sahyadriToNila).not.toContain(s2nWorkingMidnightIndex);

    const s2nSatIndex = saturdayHolidayBus.sahyadriToNila.indexOf('8:37*');
    const s2nSatMidnightIndex = saturdayHolidayBus.sahyadriToNila.indexOf('12:10*');
    expect(saturdayHolidayBus.multipleBusPositions?.sahyadriToNila).not.toContain(s2nSatIndex);
    expect(saturdayHolidayBus.multipleBusPositions?.sahyadriToNila).not.toContain(s2nSatMidnightIndex);
  });
});
