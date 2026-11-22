import { describe, expect, it } from 'vitest';
import type { CourseOffering, TimetableMeeting } from '@/engine/types';
import { buildTimetableExport } from './timetableExport';
import { classColumns, timeSlices, buildTimetableXlsx } from './timetableXlsx';
import { buildTimetablePdf, pdfSafe } from './timetablePdf';

const meeting = (overrides: Partial<TimetableMeeting>): TimetableMeeting => ({
  type: 'lecture',
  day: 'Monday',
  startTime: '09:00',
  endTime: '09:50',
  room: 'LHC 101',
  instructors: ['Dr. A'],
  recurrence: { type: 'weekly' },
  ...overrides,
});

const course = (courseCode: string, meetings: TimetableMeeting[], extra: Partial<CourseOffering> = {}): CourseOffering => ({
  id: `UG_CSE_${courseCode}`,
  courseCode,
  courseName: `${courseCode} course`,
  credits: '3-0-0-3',
  category: 'core',
  meetings,
  ...extra,
});

// Monday 23 November 2026.
const now = new Date(2026, 10, 23, 10, 0);

const build = (courses: CourseOffering[]) =>
  buildTimetableExport({
    courses,
    profile: { name: 'Asha', program: 'UG', branch: 'CSE', yearOfStudy: '1', batchNo: 'B5' },
    semesterName: 'Jan-May 2027',
    now,
  });

describe('buildTimetableExport', () => {
  it('describes the student and names the file after the semester', () => {
    const model = build([course('CS1010', [meeting({})])]);

    expect(model.title).toBe('Jan-May 2027');
    expect(model.studentName).toBe('Asha');
    expect(model.studentDetail).toBe('UG · CSE · Year 1 · Batch B5');
    expect(model.fileBase).toBe('timetable-jan-may-2027');
  });

  it('always shows Monday to Friday and adds a weekend day only when it has a class', () => {
    expect(build([course('CS1010', [meeting({})])]).days).toHaveLength(5);
    expect(build([course('CS1010', [meeting({ day: 'Saturday' })])]).days).toEqual([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
    ]);
  });

  it('bounds the grid by whole hours around the classes', () => {
    const model = build([
      course('CS1010', [meeting({ startTime: '08:30', endTime: '09:20' }), meeting({ day: 'Tuesday', startTime: '14:00', endTime: '16:45' })]),
    ]);

    expect([model.startMin, model.endMin]).toEqual([8 * 60, 17 * 60]);
  });

  it('keeps every weekly class whatever this week holds, and marks alternate weeks', () => {
    const model = build([
      course('CS1010', [
        meeting({}),
        meeting({ day: 'Thursday', recurrence: { type: 'biweekly_odd' } }),
      ]),
    ]);

    expect(model.classes.map((item) => [item.day, item.alternate])).toEqual([
      ['Monday', false],
      ['Thursday', true],
    ]);
    expect(model.courses[0].sessions[1]).toContain('alternate weeks');
  });

  it('lists a one-off class by date while it is still ahead, never in the weekly grid', () => {
    const model = build([
      course('CS1010', [
        meeting({ recurrence: { type: 'once' }, date: '2026-11-28', day: 'Saturday' }),
        meeting({ recurrence: { type: 'once' }, date: '2026-11-20', day: 'Friday' }),
      ]),
    ]);

    expect(model.classes).toEqual([]);
    expect(model.days).toHaveLength(5);
    expect(model.oneOff.map((item) => item.date)).toEqual(['2026-11-28']);
  });

  it('puts overlapping classes side by side and leaves the rest full width', () => {
    const model = build([
      course('CS1010', [meeting({}), meeting({ startTime: '11:00', endTime: '11:50' })]),
      course('MA1010', [meeting({ startTime: '09:30', endTime: '10:20' })]),
    ]);
    const lanes = model.classes.map((item) => [item.courseCode, item.startTime, item.lane, item.lanes]);

    expect(lanes).toContainEqual(['CS1010', '09:00', 0, 2]);
    expect(lanes).toContainEqual(['MA1010', '09:30', 1, 2]);
    expect(lanes).toContainEqual(['CS1010', '11:00', 0, 1]);
    expect(model.dayLanes.Monday).toBe(2);
    expect(model.dayLanes.Tuesday).toBe(1);
  });

  it('skips a meeting with unusable times and falls back to TBA for a missing room', () => {
    const model = build([
      course('CS1010', [meeting({ startTime: '10:00', endTime: '09:00' }), meeting({ day: 'Tuesday', room: '' })]),
    ]);

    expect(model.classes.map((item) => [item.day, item.room])).toEqual([['Tuesday', 'TBA']]);
  });

  it('gives each course its own colour, the same on every class', () => {
    const model = build([
      course('CS1010', [meeting({}), meeting({ day: 'Wednesday' })]),
      course('MA1010', [meeting({ day: 'Tuesday' })]),
    ]);
    const colorOf = (code: string) => model.classes.filter((item) => item.courseCode === code).map((item) => item.color.join());

    expect(new Set(colorOf('CS1010')).size).toBe(1);
    expect(colorOf('CS1010')[0]).not.toBe(colorOf('MA1010')[0]);
  });
});

describe('the Excel grid', () => {
  const model = build([
    course('CS1010', [meeting({}), meeting({ startTime: '11:00', endTime: '11:50' })]),
    course('MA1010', [meeting({ startTime: '09:30', endTime: '10:20' })]),
  ]);

  it('has a row for every stretch between two class boundaries', () => {
    expect(timeSlices(model).map((slice) => [slice.start, slice.end])).toEqual([
      [540, 570], [570, 590], [590, 620], [620, 660], [660, 710], [710, 720],
    ]);
  });

  it('lets a class with nothing beside it span all of its day', () => {
    const [first, , alone] = model.classes.filter((item) => item.courseCode === 'CS1010' || item.courseCode === 'MA1010')
      .sort((a, b) => a.start - b.start);

    expect(classColumns(first, 2)).toEqual({ offset: 0, span: 1 });
    expect(classColumns(alone, 2)).toEqual({ offset: 0, span: 2 });
  });

  it('writes a workbook with the week, the courses and the classes', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildTimetableXlsx(model));

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Week', 'Courses', 'Classes']);
    const week = workbook.getWorksheet('Week')!;
    // Monday needs two columns, so Tuesday starts at the fourth.
    expect(week.getCell(4, 2).value).toBe('MONDAY');
    expect(week.getCell(4, 4).value).toBe('TUESDAY');
    expect(JSON.stringify(week.getCell(5, 2).value)).toContain('CS1010');
    expect(workbook.getWorksheet('Classes')!.getCell(5, 4).value).toBe('CS1010');
  });
});

describe('the PDF', () => {
  it('replaces characters the built-in fonts cannot print', () => {
    expect(pdfSafe('Signals – “Systems” ✓')).toBe('Signals - "Systems"');
  });

  it('is a PDF with the week and the details on separate pages', async () => {
    const bytes = new Uint8Array(await buildTimetablePdf(build([course('CS1010', [meeting({})])])));

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(new TextDecoder('latin1').decode(bytes)).toContain('/Count 2');
  });
});
