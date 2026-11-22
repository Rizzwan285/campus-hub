import type { Workbook, Worksheet, Borders, RichText } from 'exceljs';
import { columnIsEmpty, shade, tint, type GridPlacement, type GridTable, type Rgb, type TimetableExport } from './timetableExport';

/**
 * The timetable as a workbook: the week laid out like the institute's slot
 * system sheet (days down the side, slot times across, one table for
 * Monday/Wednesday/Friday and one for Tuesday/Thursday) printing on one page,
 * then the courses with their slots and a plain list of classes that can be
 * sorted and filtered.
 */

const argb = ([r, g, b]: Rgb) =>
  `FF${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

const INK = 'FF111827';
const BODY = 'FF374151';
const MUTED = 'FF6B7280';
const HAIRLINE = 'FFE2E5EA';
const LINE = 'FFD1D5DB';
const ACCENT = 'FF2563EB';
const PANEL = 'FFF8FAFC';
const BREAK_FILL = 'FFF1F5F9';
const WHITE = 'FFFFFFFF';
const FONT = 'Calibri';

const DAY_COLUMN_WIDTH = 14;
const TIME_COLUMN_WIDTH = 19;
const LANE_HEIGHT = 64;

const solid = (color: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: color } });
const hair = { style: 'thin' as const, color: { argb: HAIRLINE } };
const line = { style: 'thin' as const, color: { argb: LINE } };

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

/** What a class's cell says: code and slot, name, then room and anything unusual about its time. */
export function classText(placement: GridPlacement): RichText[] {
  const { item } = placement;
  const dark = argb(shade(item.color, 0.4));
  const where = `${item.type === 'lecture' ? '' : `${item.typeLabel} · `}${item.room}`;
  const when = [placement.ownTime?.replace('-', '–'), item.alternate ? 'alternate weeks' : ''].filter(Boolean).join(' · ');
  // Each line break ends its own run: LibreOffice drops one that opens a run.
  return [
    { text: item.slot ? item.courseCode : `${item.courseCode}\n`, font: { name: FONT, size: 11, bold: true, color: { argb: dark } } },
    ...(item.slot
      ? [{ text: `   ${item.slot}\n`, font: { name: FONT, size: 9, bold: true, color: { argb: argb(shade(item.color, 0.1)) } } }]
      : []),
    { text: `${item.courseName}\n`, font: { name: FONT, size: 9, color: { argb: BODY } } },
    { text: when ? `${where}\n` : where, font: { name: FONT, size: 8, color: { argb: MUTED } } },
    ...(when ? [{ text: when, font: { name: FONT, size: 8, color: { argb: MUTED } } }] : []),
  ];
}

/** One table of the week from `top`; returns the last row it uses. */
function weekTable(sheet: Worksheet, table: GridTable, top: number): number {
  const lastColumn = 1 + table.columns.length;
  const firstBody = top + 1;
  const dayRows: Array<{ first: number; last: number }> = [];
  let next = firstBody;
  for (const day of table.days) {
    dayRows.push({ first: next, last: next + day.lanes - 1 });
    next += day.lanes;
  }
  const lastBody = next - 1;

  // Heading row: the slot times, start over end as on the sheet.
  const corner = sheet.getCell(top, 1);
  corner.fill = solid(PANEL);
  corner.border = { top: line, left: line, bottom: line, right: line };
  table.columns.forEach((column, index) => {
    const cell = sheet.getCell(top, index + 2);
    const isBreak = column.kind !== 'slot';
    cell.value = {
      richText: [
        { text: `${column.startTime}\n`, font: { name: FONT, size: 10, bold: true, color: { argb: isBreak ? MUTED : INK } } },
        { text: column.endTime, font: { name: FONT, size: 9, color: { argb: MUTED } } },
      ],
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = solid(isBreak ? BREAK_FILL : PANEL);
    cell.border = { top: line, bottom: line, left: hair, right: index === table.columns.length - 1 ? line : hair };
  });
  sheet.getRow(top).height = 30;

  // Day rows.
  table.days.forEach((day, dayIndex) => {
    const { first, last } = dayRows[dayIndex];
    for (let row = first; row <= last; row += 1) {
      sheet.getRow(row).height = LANE_HEIGHT;
      for (let index = 0; index < table.columns.length; index += 1) {
        const cell = sheet.getCell(row, index + 2);
        cell.fill = solid(table.columns[index].kind === 'slot' ? WHITE : BREAK_FILL);
        // Stacked rows of one day share no line: an empty day reads as one row.
        cell.border = {
          left: hair,
          right: index === table.columns.length - 1 ? line : hair,
          ...(row === first ? { top: hair } : {}),
          ...(row === last ? { bottom: row === lastBody ? line : hair } : {}),
        };
      }
    }
    if (last > first) sheet.mergeCells(first, 1, last, 1);
    const label = sheet.getCell(first, 1);
    label.value = day.day;
    label.font = { name: FONT, size: 11, bold: true, color: { argb: INK } };
    label.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    label.fill = solid(PANEL);
    label.border = { left: line, right: line, top: hair, bottom: last === lastBody ? line : hair };
  });

  // An empty lunch column is one cell down the table, labelled as on the sheet
  // when there is height for the letters (not in a one-row Saturday table).
  table.columns.forEach((column, index) => {
    if (column.kind === 'slot' || !columnIsEmpty(table, index) || lastBody < firstBody) return;
    if (lastBody > firstBody) sheet.mergeCells(firstBody, index + 2, lastBody, index + 2);
    const cell = sheet.getCell(firstBody, index + 2);
    if (lastBody > firstBody) cell.value = column.kind === 'lunch' ? 'LUNCH' : 'BREAK';
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: MUTED } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', textRotation: 'vertical' };
    cell.fill = solid(BREAK_FILL);
    cell.border = { left: hair, right: hair, top: line, bottom: line };
  });

  // Classes.
  table.days.forEach((day, dayIndex) => {
    for (const placement of day.placements) {
      const row = dayRows[dayIndex].first + placement.lane;
      const left = placement.first + 2;
      const right = placement.last + 2;
      const bar = { style: 'thick' as const, color: { argb: argb(placement.item.color) } };
      const edge = { style: 'thin' as const, color: { argb: WHITE } };
      for (let column = left; column <= right; column += 1) {
        const border: Partial<Borders> = { top: edge, bottom: edge };
        if (column === left) border.left = bar;
        if (column === right) border.right = edge;
        const cell = sheet.getCell(row, column);
        cell.fill = solid(argb(tint(placement.item.color, 0.86)));
        cell.border = border;
      }
      if (right > left) sheet.mergeCells(row, left, row, right);
      const cell = sheet.getCell(row, left);
      cell.value = { richText: classText(placement) };
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    }
  });

  return lastBody;
}

function weekSheet(workbook: Workbook, model: TimetableExport) {
  const lastColumn = 1 + Math.max(1, ...model.tables.map((table) => table.columns.length));
  const sheet = workbook.addWorksheet('Week', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 0, showGridLines: false }],
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

  sheet.getColumn(1).width = DAY_COLUMN_WIDTH;
  for (let column = 2; column <= lastColumn; column += 1) sheet.getColumn(column).width = TIME_COLUMN_WIDTH;
  titleRows(sheet, model, 'CLASS TIMETABLE', lastColumn);

  let row = 4;
  for (const table of model.tables) {
    row = weekTable(sheet, table, row) + 2;
    sheet.getRow(row - 1).height = 14;
  }

  if (model.classes.length === 0) {
    sheet.mergeCells(row, 1, row, lastColumn);
    const empty = sheet.getCell(row, 1);
    empty.value = 'No weekly classes in the selected courses.';
    empty.font = { name: FONT, size: 10, color: { argb: MUTED } };
    row += 1;
  }

  sheet.mergeCells(row, 1, row, lastColumn);
  const note = sheet.getCell(row, 1);
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
      if (rowIndex % 2 === 1) cell.fill = solid(PANEL);
    });
    const lines = Math.max(
      1,
      ...row.cells.map((value, index) =>
        String(value)
          .split('\n')
          .reduce((total, text) => total + Math.max(1, Math.ceil(text.length / Math.max(8, columns[index].width - 2))), 0),
      ),
    );
    sheet.getRow(rowNumber).height = Math.max(18, lines * 13.5 + 4);
  });

  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: columns.length } };
  }
}

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
      { title: 'Slot', width: 16 },
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
        course.slot,
        course.credits,
        course.category,
        course.instructors.join(', '),
        course.sessions.join('\n'),
      ],
    })),
  );

  const weekly = model.classes.map((item) => ({
    color: item.color,
    cells: [
      item.day,
      item.startTime,
      item.endTime,
      item.courseCode,
      item.slot ?? '',
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
      '',
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
      { title: 'Slot', width: 9 },
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
