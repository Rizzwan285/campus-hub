import { describe, expect, it } from 'vitest';
import type { CourseOffering, TimetableMeeting } from '@/engine/types';
import type { SlotDefinitions } from '@/engine/courseSchedule';
import bundledSlots from '@/data/timetable/slots.json';
import { buildTimetableExport, columnSpan, type GridTable, type TimetableExport } from './timetableExport';
import { buildTimetableXlsx, classText } from './timetableXlsx';
import { buildTimetablePdf, pdfSafe } from './timetablePdf';

// The institute's slot system, as Jan-May 2027 publishes it (the bundle plus EML).
const SLOTS = {
  ...(bundledSlots as unknown as SlotDefinitions),
  EML: { type: 'lecture', timings: [{ day: 'Wednesday', startTime: '15:30', endTime: '18:00' }] },
} as SlotDefinitions;

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

const build = (courses: CourseOffering[], slots: SlotDefinitions | null = SLOTS) =>
  buildTimetableExport({
    courses,
    profile: { name: 'Asha', program: 'UG', branch: 'CSE', yearOfStudy: '1', batchNo: 'B5' },
    semesterName: 'Jan-May 2027',
    slots,
    now,
  });

const headings = (table: GridTable) => table.columns.map((c) => `${c.startTime}-${c.endTime}${c.kind === 'slot' ? '' : ` ${c.kind}`}`);

/** Where each class sits: "CODE Day first-last lane own-time". */
const cells = (model: TimetableExport) =>
  model.tables.flatMap((table) =>
    table.days.flatMap((day) =>
      day.placements.map((p) =>
        [p.item.courseCode, day.day, `${table.columns[p.first].startTime}-${table.columns[p.last].endTime}`, p.lane, p.ownTime].join(' ').trim(),
      ),
    ),
  );

describe('buildTimetableExport', () => {
  it('describes the student and names the file after the semester', () => {
    const model = build([course('CS1010', [meeting({})])]);

    expect(model.title).toBe('Jan-May 2027');
    expect(model.studentName).toBe('Asha');
    expect(model.studentDetail).toBe('UG · CSE · Year 1 · Batch B5');
    expect(model.fileBase).toBe('timetable-jan-may-2027');
  });

  it('lays the week out as the slot system does: Mon/Wed/Fri, then Tue/Thu', () => {
    const model = build([course('CS1010', [meeting({})])]);

    expect(model.tables.map((table) => table.days.map((day) => day.day))).toEqual([
      ['Monday', 'Wednesday', 'Friday'],
      ['Tuesday', 'Thursday'],
    ]);
    expect(headings(model.tables[0])).toEqual([
      '08:00-08:50', '09:00-09:50', '10:00-10:50', '11:00-11:50', '12:05-12:55',
      '13:00-13:50 lunch', '14:00-15:15', '15:30-16:45', '17:10-18:00',
    ]);
    expect(headings(model.tables[1])).toEqual([
      '08:00-08:50', '09:00-10:15', '10:30-11:45', '12:00-12:50',
      '13:00-13:50 lunch', '14:00-15:15', '15:30-16:45', '17:10-18:00',
    ]);
  });

  it('adds a weekend table only when there is a class at the weekend', () => {
    const model = build([course('CS1010', [meeting({ day: 'Saturday', startTime: '10:00', endTime: '11:30' })])]);

    expect(model.tables).toHaveLength(3);
    expect(model.tables[2].days.map((day) => day.day)).toEqual(['Saturday']);
    expect(cells(model)).toEqual(['CS1010 Saturday 10:00-11:50 0 10:00-11:30']);
  });

  it('puts a class in its slot column, and a lab across the columns it fills', () => {
    const model = build([
      course('CS1010', [meeting({ day: 'Tuesday', startTime: '09:00', endTime: '10:15', slot: 'F' })]),
      course('CS1110', [meeting({ type: 'lab', day: 'Monday', startTime: '09:00', endTime: '11:45', slot: 'PM1' })]),
    ]);

    expect(cells(model)).toEqual([
      'CS1110 Monday 09:00-11:50 0 09:00-11:45',
      'CS1010 Tuesday 09:00-10:15 0',
    ]);
  });

  it("fits Wednesday's one-day slots into the columns they fall in, with their own times", () => {
    const wednesday = (code: string, slot: string, startTime: string, endTime: string) =>
      course(code, [meeting({ day: 'Wednesday', startTime, endTime, slot })]);
    const model = build([
      wednesday('MA1', 'Q', '14:00', '14:50'),
      wednesday('MA2', 'R3', '15:00', '15:50'),
      wednesday('MA3', 'CMN-B', '17:00', '17:50'),
    ]);

    expect(cells(model)).toEqual([
      'MA1 Wednesday 14:00-15:15 0 14:00-14:50',
      'MA2 Wednesday 15:30-16:45 0 15:00-15:50',
      'MA3 Wednesday 17:10-18:00 0 17:00-17:50',
    ]);
    // EML runs across two columns.
    expect(columnSpan(model.tables[0].columns, 15 * 60 + 30, 18 * 60)).toEqual({ first: 7, last: 8 });
  });

  it('stacks classes that would share a cell: a clash, or labs on alternate weeks', () => {
    const model = build([
      course('CS1110', [meeting({ type: 'lab', day: 'Tuesday', startTime: '14:00', endTime: '16:45', recurrence: { type: 'biweekly_even' } })]),
      course('EE1110', [meeting({ type: 'lab', day: 'Tuesday', startTime: '14:00', endTime: '16:45', recurrence: { type: 'biweekly_odd' } })]),
      course('MA1010', [meeting({ day: 'Tuesday', startTime: '08:00', endTime: '08:50' })]),
    ]);
    const tuesday = model.tables[1].days[0];

    expect(tuesday.lanes).toBe(2);
    expect(cells(model)).toEqual([
      'MA1010 Tuesday 08:00-08:50 0',
      'CS1110 Tuesday 14:00-16:45 0',
      'EE1110 Tuesday 14:00-16:45 1',
    ]);
    expect(model.tables[0].days.every((day) => day.lanes === 1)).toBe(true);
  });

  it('adds hour columns for a class outside the slot hours, only in its table', () => {
    const model = build([course('CS1010', [meeting({ day: 'Friday', startTime: '18:00', endTime: '19:30' })])]);

    expect(headings(model.tables[0]).slice(-3)).toEqual(['17:10-18:00', '18:00-19:00', '19:00-20:00']);
    expect(headings(model.tables[1]).at(-1)).toBe('17:10-18:00');
    expect(cells(model)).toEqual(['CS1010 Friday 18:00-20:00 0 18:00-19:30']);
  });

  it('falls back to plain hours when the slot system is not known', () => {
    const model = build([course('CS1010', [meeting({ slot: 'B' }), meeting({ day: 'Tuesday' })])], null);

    expect(headings(model.tables[0])).toEqual(Array.from({ length: 10 }, (_, i) =>
      `${String(8 + i).padStart(2, '0')}:00-${String(9 + i).padStart(2, '0')}:00`));
    expect(model.classes.map((item) => item.slot)).toEqual(['B', null]);
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
    expect(model.tables).toHaveLength(2);
    expect(model.oneOff.map((item) => item.date)).toEqual(['2026-11-28']);
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

describe('slots', () => {
  it("names a course's slots as the course lists do, with days when it uses only some", () => {
    // CS2020A in Aug-Dec 2026: "F+I [Fri]".
    const model = build([
      course('CS2020A', [
        meeting({ day: 'Tuesday', startTime: '09:00', endTime: '10:15' }),
        meeting({ day: 'Thursday', startTime: '10:30', endTime: '11:45' }),
        meeting({ day: 'Friday', startTime: '15:30', endTime: '16:45' }),
      ]),
      // Lectures before labs, whatever day the lab is on.
      course('CS5016', [
        meeting({ type: 'lab', day: 'Monday', startTime: '14:00', endTime: '16:45' }),
        meeting({ day: 'Tuesday', startTime: '12:00', endTime: '12:50' }),
        meeting({ day: 'Thursday', startTime: '12:00', endTime: '12:50' }),
      ]),
      course('ID4001', [meeting({ day: 'Saturday', startTime: '10:00', endTime: '11:30' })]),
    ]);

    expect(model.courses.map((c) => [c.courseCode, c.slot])).toEqual([
      ['CS2020A', 'F + I [Fri]'],
      ['CS5016', 'M + PA1'],
      ['ID4001', ''],
    ]);
  });

  it('believes the slot the timetable names, even when it moves the class within that day', () => {
    // First years' H was at 9:00-9:55 on Mondays.
    const model = build([course('GN1010', [meeting({ startTime: '09:00', endTime: '09:55', slot: 'H' })])]);

    expect(model.classes[0].slot).toBe('H');
    expect(cells(model)).toEqual(['GN1010 Monday 09:00-09:50 0 09:00-09:55']);
  });

  it("does not keep the slot of a class a student moved to another time", () => {
    const own = { isPersonal: true };
    const model = build([
      course('CS6007', [
        meeting({ startTime: '12:05', endTime: '12:55', slot: 'H' }),
        meeting({ day: 'Friday', startTime: '18:00', endTime: '19:30', slot: 'H' }),
        // Moved onto another slot's time: named after that slot.
        meeting({ day: 'Wednesday', startTime: '08:00', endTime: '08:50', slot: 'H' }),
      ], own),
    ]);

    expect(model.classes.map((item) => [item.day, item.slot])).toEqual([
      ['Monday', 'H'],
      ['Wednesday', 'C'],
      ['Friday', null],
    ]);
    expect(model.courses[0].slot).toBe('H [Mon] + C [Wed]');
  });
});

describe('the Excel file', () => {
  const model = build([
    course('CS1010', [meeting({ slot: 'B' }), meeting({ day: 'Tuesday', startTime: '08:00', endTime: '08:50', slot: 'B' })]),
    course('CS1110', [meeting({ type: 'lab', day: 'Monday', startTime: '14:00', endTime: '16:45', slot: 'PA1' })]),
  ]);

  it('says what a class is, its slot, and its time when that is not the heading', () => {
    const lab = model.tables[0].days[0].placements.find((p) => p.item.courseCode === 'CS1110')!;
    const text = (placement: typeof lab) => classText(placement).map((run) => run.text).join('');

    expect(text(lab)).toBe('CS1110   PA1\nCS1110 course\nLab · LHC 101');
    expect(text({ ...lab, ownTime: '14:00-16:30' })).toBe('CS1110   PA1\nCS1110 course\nLab · LHC 101\n14:00–16:30');
    // A line break only ever ends a run: LibreOffice drops one that opens a run.
    expect(classText({ ...lab, ownTime: '14:00-16:30' }).every((run) => !run.text.startsWith('\n'))).toBe(true);
  });

  it('writes the two week tables, the courses with their slots and the classes', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildTimetableXlsx(model));
    const text = (value: unknown) => JSON.stringify(value);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Week', 'Courses', 'Classes']);
    const week = workbook.getWorksheet('Week')!;
    // Row 4: the Mon/Wed/Fri headings; Monday's B (09:00) in the third column.
    expect(text(week.getCell(4, 2).value)).toContain('08:00');
    expect(week.getCell(5, 1).value).toBe('Monday');
    expect(text(week.getCell(5, 3).value)).toContain('CS1010');
    // Then a gap row and the Tue/Thu table, its B at 08:00 in the second column.
    expect(text(week.getCell(9, 3).value)).toContain('10:15');
    expect(week.getCell(10, 1).value).toBe('Tuesday');
    expect(text(week.getCell(10, 2).value)).toContain('CS1010');

    const courses = workbook.getWorksheet('Courses')!;
    expect(courses.getCell(4, 3).value).toBe('SLOT');
    expect(courses.getCell(5, 3).value).toBe('B [Mon, Tue]');
    expect(courses.getCell(6, 3).value).toBe('PA1');
    expect(workbook.getWorksheet('Classes')!.getCell(5, 5).value).toBe('B');
  });
});

describe('the PDF', () => {
  it('replaces characters the built-in fonts cannot print', () => {
    expect(pdfSafe('Signals – “Systems” ✓')).toBe('Signals - "Systems"');
  });

  it('is a PDF with the week and the details, slots included, on separate pages', async () => {
    const bytes = new Uint8Array(await buildTimetablePdf(build([course('CS1010', [meeting({ slot: 'B' })])])));
    const raw = new TextDecoder('latin1').decode(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(raw).toContain('/Count 2');
    expect(raw).toContain('(SLOT)');
    expect(raw).toContain('(Wednesday)');
  });
});
