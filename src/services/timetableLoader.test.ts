import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimetableLoader } from './timetableLoader';

// Mock the dynamic imports
vi.mock('../data/timetable/UG/CSE.json', () => ({
  default: [{ id: 'UG_CSE_CS5634', courseCode: 'CS5634' }]
}));

vi.mock('../data/timetable/holidays.json', () => ({
  default: [{ date: '2026-01-26', name: 'Republic Day' }]
}));

describe('TimetableLoader', () => {
  beforeEach(() => {
    TimetableLoader.clearCache();
  });

  it('should load branch data and cache the result', async () => {
    const data1 = await TimetableLoader.loadBranchData('UG', 'CSE');
    expect(data1).toHaveLength(1);
    expect(data1[0].courseCode).toBe('CS5634');

    // Should return from cache
    const data2 = await TimetableLoader.loadBranchData('UG', 'CSE');
    expect(data1).toBe(data2); // Same reference
  });

  it('should handle missing branch data gracefully', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Missing branch data throws import error in mock, handled by catch
    const data = await TimetableLoader.loadBranchData('UG', 'MissingBranch');
    
    expect(data).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalled();
    
    consoleWarnSpy.mockRestore();
  });

  it('should load holidays and cache the result', async () => {
    const holidays1 = await TimetableLoader.loadHolidays();
    expect(holidays1).toHaveLength(1);
    expect(holidays1[0].name).toBe('Republic Day');

    const holidays2 = await TimetableLoader.loadHolidays();
    expect(holidays1).toBe(holidays2); // Same reference
  });
});
