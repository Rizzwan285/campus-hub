import type { Workbook, Worksheet, Borders } from 'exceljs';
import { formatMinutes, shade, tint, type ExportClass, type Rgb, type TimetableExport } from './timetableExport';

/**
 * The timetable as a workbook: a coloured week grid that prints on one page,
 * then the courses and a plain list of classes that can be sorted and filtered.
 */

const argb = ([r, g, b]: Rgb) =>
  `FF${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

const INK = 'FF111827';
const BODY = 'FF374151';
const MUTED = 'FF6B7280';
const HAIRLINE = 'FFE2E5EA';
const ACCENT = 'FF2563EB';
const BREAK_FILL = 'FFF8FAFC';
const WHITE = 'FFFFFFFF';
const FONT = 'Calibri';

const solid = (color: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: color } });
const hair = { style: 'thin' as const, color: { argb: HAIRLINE } };

/** The row boundaries of the grid: every moment a class starts or ends. */
export function timeSlices(model: TimetableExport): Array<{ start: number; end: number }> {
  const marks = new Set<number>([model.startMin, model.endMin]);
  model.classes.forEach((item) => {
    marks.add(item.start);
    marks.add(item.end);
  });
  const sorted = [...marks].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((start, index) => ({ start, end: sorted[index + 1] }));
}

/** First column and number of columns a class takes within its day. */
export function classColumns(item: ExportClass, dayLaneCount: number): { offset: number; span: number } {
  if (item.lanes === 1) return { offset: 0, span: dayLaneCount };
  // The last of a group of overlapping classes takes whatever width is left.
  return { offset: item.lane, span: item.lane === item.lanes - 1 ? dayLaneCount - item.lane : 1 };
}

function titleRows(sheet: Worksheet, model: TimetableExport, label: string, lastColumn: number) {
  sheet.mergeCells(1, 1, 1, lastColumn);
  const title = sheet.getCell(1, 1);
  title.value = {
    richText: [
      { text: `${label}   `, font: { name: FONT, size: 9, bold: true, color: { argb: ACCENT } } },
      { text: model.title, font: { name: FONT, size: 18, bold: true, color: { argb: INK } } },
    ],
  };
  title.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 32;

  sheet.mergeCells(2, 1, 2, lastColumn);
  const subtitle = sheet.getCell(2, 1);
  subtitle.value = [model.studentName, model.studentDetail, `Generated ${model.generatedLabel}`]
    .filter(Boolean)
    .join('   ·   ');
  subtitle.font = { name: FONT, size: 10, color: { argb: MUTED } };
  subtitle.alignment = { vertical: 'middle' };
  sheet.getRow(2).height = 18;
  for (let column = 1; column <= lastColumn; column += 1) {
    sheet.getCell(2, column).border = { bottom: { style: 'medium', color: { argb: ACCENT } } };
  }
  sheet.getRow(3).height = 8;
}

function headerCell(sheet: Worksheet, row: number, column: number, text: string) {
  const cell = sheet.getCell(row, column);
  cell.value = text;
  cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
  cell.fill = solid(INK);
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

function weekSheet(workbook: Workbook, model: TimetableExport) {
  const sheet = workbook.addWorksheet('Week', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  // Column layout: time, then each day's lanes.
  const dayStart: Record<string, number> = {};
  let column = 2;
  for (const day of model.days) {
    dayStart[day] = column;
    column += model.dayLanes[day] ?? 1;
  }
  const lastColumn = column - 1;
  const dayEdges = new Set<number>([...Object.values(dayStart), lastColumn + 1]);

  sheet.getColumn(1).width = 9;
  for (const day of model.days) {
    const lanes = model.dayLanes[day] ?? 1;
    for (let lane = 0; lane < lanes; lane += 1) {
      sheet.getColumn(dayStart[day] + lane).width = Math.max(14, 26 / lanes);
    }
  }

  titleRows(sheet, model, 'CLASS TIMETABLE', lastColumn);

  const HEADER_ROW = 4;
  headerCell(sheet, HEADER_ROW, 1, 'TIME');
  for (const day of model.days) {
    const lanes = model.dayLanes[day] ?? 1;
    if (lanes > 1) sheet.mergeCells(HEADER_ROW, dayStart[day], HEADER_ROW, dayStart[day] + lanes - 1);
    headerCell(sheet, HEADER_ROW, dayStart[day], day.toUpperCase());
  }
  sheet.getRow(HEADER_ROW).height = 22;

  const slices = timeSlices(model);
  const firstRow = HEADER_ROW + 1;
  const rowOfStart = new Map<number, number>();
  const rowOfEnd = new Map<number, number>();

  slices.forEach((slice, index) => {
    const row = firstRow + index;
    rowOfStart.set(slice.start, row);
    rowOfEnd.set(slice.end, row);
    const minutes = slice.end - slice.start;
    const busy = model.classes.some((item) => item.start < slice.end && item.end > slice.start);
    sheet.getRow(row).height = Math.min(110, Math.max(busy ? 14 : 10, minutes * 1.25));

    const time = sheet.getCell(row, 1);
    // A time axis: each row is labelled with the moment it starts.
    time.value = minutes >= 15 ? formatMinutes(slice.start) : '';
    time.font = { name: FONT, size: 9, bold: busy, color: { argb: busy ? INK : MUTED } };
    time.alignment = { vertical: 'top', horizontal: 'center' };
    time.fill = solid(busy ? WHITE : BREAK_FILL);
    time.border = { top: hair, bottom: hair, right: hair, left: hair };

    for (let cellColumn = 2; cellColumn <= lastColumn; cellColumn += 1) {
      const cell = sheet.getCell(row, cellColumn);
      cell.fill = solid(busy ? WHITE : BREAK_FILL);
      // No line between the lanes of one day: an empty day reads as one column.
      cell.border = {
        top: hair,
        bottom: hair,
        ...(dayEdges.has(cellColumn) ? { left: hair } : {}),
        ...(dayEdges.has(cellColumn + 1) ? { right: hair } : {}),
      };
    }
  });

  for (const item of model.classes) {
    const top = rowOfStart.get(item.start);
    const bottom = rowOfEnd.get(item.end);
    const base = dayStart[item.day];
    if (top === undefined || bottom === undefined || base === undefined) continue;
    const { offset, span } = classColumns(item, model.dayLanes[item.day] ?? 1);
    const left = base + offset;
    const right = left + span - 1;

    const bar = { style: 'thick' as const, color: { argb: argb(item.color) } };
    const edge = { style: 'thin' as const, color: { argb: WHITE } };
    for (let row = top; row <= bottom; row += 1) {
      for (let cellColumn = left; cellColumn <= right; cellColumn += 1) {
        const border: Partial<Borders> = {};
        if (cellColumn === left) border.left = bar;
        if (cellColumn === right) border.right = edge;
        if (row === top) border.top = edge;
        if (row === bottom) border.bottom = edge;
        const cell = sheet.getCell(row, cellColumn);
        cell.fill = solid(argb(tint(item.color, 0.86)));
        cell.border = border;
      }
    }
    if (top !== bottom || left !== right) sheet.mergeCells(top, left, bottom, right);

    const cell = sheet.getCell(top, left);
    const dark = argb(shade(item.color, 0.35));
    cell.value = {
      richText: [
        // Each line break ends its own run: LibreOffice drops one that opens a run.
        { text: `${item.courseCode}\n`, font: { name: FONT, size: 11, bold: true, color: { argb: dark } } },
        { text: `${item.courseName}\n`, font: { name: FONT, size: 9, color: { argb: BODY } } },
        {
          text: `${item.startTime}–${item.endTime} · ${item.typeLabel} · ${item.room}` +
            (item.alternate ? ' · alternate weeks' : ''),
          font: { name: FONT, size: 8, color: { argb: MUTED } },
        },
      ],
    };
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
  }

  const noteRow = firstRow + slices.length + 1;
  sheet.mergeCells(noteRow, 1, noteRow, lastColumn);
  const note = sheet.getCell(noteRow, 1);
  note.value = 'From Campus Companion. Timings can change during the semester; the app has the latest.';
  note.font = { name: FONT, size: 8, italic: true, color: { argb: MUTED } };
}

function tableSheet(
  workbook: Workbook,
  model: TimetableExport,
  name: string,
  label: string,
  columns: Array<{ title: string; width: number }>,
  rows: Array<{ cells: Array<string | number>; color: Rgb }>,
) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  columns.forEach((column, index) => { sheet.getColumn(index + 1).width = column.width; });
  titleRows(sheet, model, label, columns.length);

  columns.forEach((column, index) => {
    headerCell(sheet, 4, index + 1, column.title.toUpperCase());
    sheet.getCell(4, index + 1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  });
  sheet.getRow(4).height = 22;

  rows.forEach((row, rowIndex) => {
    const rowNumber = 5 + rowIndex;
    row.cells.forEach((value, index) => {
      const cell = sheet.getCell(rowNumber, index + 1);
      cell.value = value;
      cell.font = { name: FONT, size: 10, bold: index === 0, color: { argb: index === 0 ? INK : BODY } };
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
      cell.border = {
        bottom: hair,
        ...(index === 0 ? { left: { style: 'thick' as const, color: { argb: argb(row.color) } } } : {}),
      };
      if (rowIndex % 2 === 1) cell.fill = solid(BREAK_FILL);
    });
    const lines = Math.max(
      1,
      ...row.cells.map((value, index) =>
        String(value)
          .split('\n')
          .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / Math.max(8, columns[index].width - 2))), 0),
      ),
    );
    sheet.getRow(rowNumber).height = Math.max(18, lines * 13.5 + 4);
  });

  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: columns.length } };
  }
}

const DAY_INDEX = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export async function buildTimetableXlsx(model: TimetableExport): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Campus Companion';
  workbook.title = `${model.title} timetable`;

  weekSheet(workbook, model);

  tableSheet(
    workbook,
    model,
    'Courses',
    'COURSES',
    [
      { title: 'Code', width: 12 },
      { title: 'Course', width: 40 },
      { title: 'Credits', width: 12 },
      { title: 'Category', width: 18 },
      { title: 'Instructors', width: 34 },
      { title: 'Classes', width: 46 },
    ],
    model.courses.map((course) => ({
      color: course.color,
      cells: [
        course.courseCode,
        course.courseName + (course.isPersonal ? ' (your own timings)' : ''),
        course.credits,
        course.category,
        course.instructors.join(', '),
        course.sessions.join('\n'),
      ],
    })),
  );

  const weekly = [...model.classes]
    .sort((a, b) => DAY_INDEX.indexOf(a.day) - DAY_INDEX.indexOf(b.day) || a.start - b.start)
    .map((item) => ({
      color: item.color,
      cells: [
        item.day,
        item.startTime,
        item.endTime,
        item.courseCode,
        item.courseName,
        item.typeLabel,
        item.room,
        item.alternate ? 'Alternate weeks' : 'Every week',
        item.instructors.join(', '),
      ],
    }));
  const oneOff = model.oneOff.map((item) => ({
    color: item.color,
    cells: [
      item.dateLabel,
      item.startTime,
      item.endTime,
      item.courseCode,
      item.courseName,
      item.typeLabel,
      item.room,
      'Once only',
      '',
    ],
  }));

  tableSheet(
    workbook,
    model,
    'Classes',
    'ALL CLASSES',
    [
      { title: 'Day', width: 18 },
      { title: 'Start', width: 9 },
      { title: 'End', width: 9 },
      { title: 'Code', width: 12 },
      { title: 'Course', width: 38 },
      { title: 'Class', width: 11 },
      { title: 'Room', width: 20 },
      { title: 'Repeats', width: 16 },
      { title: 'Instructors', width: 34 },
    ],
    [...weekly, ...oneOff],
  );

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
