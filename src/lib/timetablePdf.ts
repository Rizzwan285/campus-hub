import type { jsPDF as JsPDF } from 'jspdf';
import { columnIsEmpty, shade, tint, type GridPlacement, type GridTable, type Rgb, type TimetableExport } from './timetableExport';

/**
 * The timetable as an A4 landscape PDF: the week on the first page, laid out
 * like the institute's slot system sheet (days down the side, slot times
 * across, Monday/Wednesday/Friday and Tuesday/Thursday as separate tables),
 * then the course details with each course's slot. Drawn directly rather than
 * from a screenshot of the page, so it is sharp when printed and the same on
 * every phone.
 */

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 12;

const INK: Rgb = [17, 24, 39];
const MUTED: Rgb = [107, 114, 128];
const HAIRLINE: Rgb = [226, 229, 234];
const ACCENT: Rgb = [37, 99, 235];

/** The built-in PDF fonts only cover Latin-1; anything else would print as garbage. */
export function pdfSafe(text: string): string {
  return (text ?? '')
    .replace(/[–—−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fit(doc: JsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}..`) > maxWidth) cut = cut.slice(0, -1);
  return cut.length > 1 ? `${cut.trimEnd()}..` : '';
}

function pageHeader(doc: JsPDF, label: string, title: string, model: TimetableExport) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...ACCENT);
  doc.text(label, MARGIN, 15.5, { charSpace: 0.7 });

  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text(fit(doc, pdfSafe(title), 170), MARGIN, 24.5);

  const right = PAGE_W - MARGIN;
  if (model.studentName) {
    doc.setFontSize(11);
    doc.text(fit(doc, pdfSafe(model.studentName), 90), right, 19, { align: 'right' });
  }
  if (model.studentDetail) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(pdfSafe(model.studentDetail), right, model.studentName ? 24.5 : 21, { align: 'right' });
  }

  // A short accent stroke running into a hairline.
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 29, right, 29);
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.9);
  doc.line(MARGIN, 29, MARGIN + 22, 29);
}

function pageFooter(doc: JsPDF, model: TimetableExport, page: number, pages: number) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(
    `Generated ${model.generatedLabel} from Campus Companion. Timings can change during the semester; the app has the latest.`,
    MARGIN,
    PAGE_H - 7,
  );
  doc.text(`${page} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 7, { align: 'right' });
}

const LINE: Rgb = [209, 213, 219];
const PANEL: Rgb = [248, 250, 252];
const BREAK: Rgb = [241, 245, 249];
const BODY: Rgb = [55, 65, 81];

const DAY_W = 26;
const HEADER_H = 10;
const TABLE_GAP = 7;
const MAX_LANE_H = 24;

/** A lunch or break column no class falls in, drawn as one shaded cell. */
const emptyBreak = (table: GridTable, index: number) => table.columns[index].kind !== 'slot' && columnIsEmpty(table, index);

/** Column edges across the page: slots by length, an empty lunch column narrower. */
function columnEdges(table: GridTable, left: number, right: number): number[] {
  const weights = table.columns.map((column, index) => {
    if (column.kind !== 'slot') return emptyBreak(table, index) ? 0.55 : 1;
    return 0.6 + 0.4 * ((column.end - column.start) / 50);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const edges = [left];
  weights.forEach((weight) => edges.push(edges[edges.length - 1] + ((right - left) * weight) / total));
  return edges;
}

function drawBlock(doc: JsPDF, placement: GridPlacement, x: number, y: number, w: number, h: number) {
  const { item } = placement;
  doc.setFillColor(...tint(item.color, 0.86));
  doc.roundedRect(x, y, w, h, 0.9, 0.9, 'F');
  doc.setFillColor(...item.color);
  doc.rect(x, y, 1.1, h, 'F');

  const textX = x + 2.6;
  const textW = w - 3.8;
  const lineH = 2.9;
  const lines = Math.max(1, Math.floor((h - 2.2) / lineH));

  const code = pdfSafe(item.courseCode);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const codeW = doc.getTextWidth(code);

  // The slot, small in the corner, as the slot system sheet names it; the
  // course code comes first when there is not room for both.
  if (item.slot) {
    doc.setFontSize(6.5);
    const tag = pdfSafe(item.slot);
    if (codeW + doc.getTextWidth(tag) + 1.5 <= textW) {
      doc.setTextColor(...shade(item.color, 0.1));
      doc.text(tag, x + w - 1.4, y + 3.6, { align: 'right' });
    }
    doc.setFontSize(8);
  }

  let cursor = y + 3.7;
  doc.setTextColor(...shade(item.color, 0.4));
  doc.text(fit(doc, code, textW), textX, cursor);
  cursor += lineH + 0.3;

  // After the code: when, if it is not what the headings say, and where; they
  // share a line when space is short. The name takes what is left.
  const where = `${item.type === 'lecture' ? '' : `${item.typeLabel} · `}${pdfSafe(item.room)}`;
  const when = [placement.ownTime, item.alternate ? 'alt. weeks' : ''].filter(Boolean).join(' · ');
  const spare = Math.max(0, lines - 1);
  const details = !when ? [where].slice(0, spare) : spare >= 2 ? [where, when] : [`${when} · ${where}`].slice(0, spare);
  const nameLines = Math.min(2, spare - details.length);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...BODY);
  if (nameLines > 0) {
    const wrapped = doc.splitTextToSize(pdfSafe(item.courseName), textW) as string[];
    wrapped.slice(0, nameLines).forEach((line, index) => {
      const last = index === nameLines - 1 && wrapped.length > nameLines;
      doc.text(last ? fit(doc, `${line}..`, textW) || line : line, textX, cursor);
      cursor += lineH;
    });
  }
  doc.setTextColor(...MUTED);
  for (const line of details) {
    doc.text(fit(doc, line, textW), textX, cursor);
    cursor += lineH;
  }
}

/** One table of the week, as on the slot system sheet. Returns where it ends. */
function drawTable(doc: JsPDF, table: GridTable, top: number, laneH: number): number {
  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const gridLeft = left + DAY_W;
  const edges = columnEdges(table, gridLeft, right);
  const bodyTop = top + HEADER_H;

  const dayTops: number[] = [];
  let y = bodyTop;
  for (const day of table.days) {
    dayTops.push(y);
    y += day.lanes * laneH;
  }
  const bottom = y;

  // Panels: heading row, day names, break columns.
  doc.setFillColor(...PANEL);
  doc.rect(left, top, right - left, HEADER_H, 'F');
  doc.rect(left, bodyTop, DAY_W, bottom - bodyTop, 'F');
  table.columns.forEach((column, index) => {
    if (column.kind === 'slot') return;
    doc.setFillColor(...BREAK);
    doc.rect(edges[index], top, edges[index + 1] - edges[index], bottom - top, 'F');
  });

  // Rules. An empty lunch column is one cell from top to bottom, as on the sheet.
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.2);
  for (let index = 1; index < table.columns.length; index += 1) doc.line(edges[index], top, edges[index], bottom);
  dayTops.slice(1).forEach((dayTop) => {
    doc.line(left, dayTop, edges[0], dayTop);
    table.columns.forEach((column, index) => {
      if (!emptyBreak(table, index)) doc.line(edges[index], dayTop, edges[index + 1], dayTop);
    });
  });
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(left, bodyTop, right, bodyTop);
  doc.line(gridLeft, top, gridLeft, bottom);
  doc.rect(left, top, right - left, bottom - top, 'S');

  // Column headings: start over end, as on the sheet.
  table.columns.forEach((column, index) => {
    const centre = (edges[index] + edges[index + 1]) / 2;
    const isBreak = column.kind !== 'slot';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...(isBreak ? MUTED : INK));
    doc.text(column.startTime, centre, top + 4.3, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(column.endTime, centre, top + 7.9, { align: 'center' });
  });

  // Day names.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  table.days.forEach((day, index) => {
    const height = day.lanes * laneH;
    doc.text(day.day, left + 3.5, dayTops[index] + height / 2, { baseline: 'middle' });
  });

  // "LUNCH" down an empty break column, as the sheet has it.
  table.columns.forEach((column, index) => {
    if (column.kind !== 'lunch' || !emptyBreak(table, index)) return;
    const letters = 'LUNCH'.split('');
    const height = bottom - bodyTop;
    const centre = (edges[index] + edges[index + 1]) / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    if (height >= 24) {
      const step = Math.min(4.2, (height - 4) / letters.length);
      const start = bodyTop + (height - step * (letters.length - 1)) / 2;
      letters.forEach((letter, n) => doc.text(letter, centre, start + n * step, { align: 'center', baseline: 'middle' }));
    } else if (height >= doc.getTextWidth('LUNCH') + 3) {
      doc.text('LUNCH', centre + 1, bodyTop + (height + doc.getTextWidth('LUNCH')) / 2, { angle: 90 });
    }
  });

  // Classes.
  const inset = 0.8;
  table.days.forEach((day, index) => {
    for (const placement of day.placements) {
      const x = edges[placement.first] + inset;
      const w = edges[placement.last + 1] - edges[placement.first] - inset * 2;
      const blockTop = dayTops[index] + placement.lane * laneH + inset;
      drawBlock(doc, placement, x, blockTop, w, laneH - inset * 2);
    }
  });

  return bottom;
}

function drawWeek(doc: JsPDF, model: TimetableExport) {
  const top = 34;
  const bottom = PAGE_H - 14;
  const tables = model.tables;
  const lanes = tables.reduce((sum, table) => sum + table.days.reduce((count, day) => count + day.lanes, 0), 0);
  const fixed = tables.length * HEADER_H + (tables.length - 1) * TABLE_GAP;
  const laneH = Math.min(MAX_LANE_H, (bottom - top - fixed) / Math.max(1, lanes));

  let y = top;
  for (const table of tables) y = drawTable(doc, table, y, laneH) + TABLE_GAP;

  if (model.classes.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('No weekly classes in the selected courses.', PAGE_W / 2, Math.min(bottom - 4, y + 4), { align: 'center' });
  }
}

interface Column {
  title: string;
  width: number;
}

function drawDetails(doc: JsPDF, model: TimetableExport, startPage: () => void) {
  const right = PAGE_W - MARGIN;
  const bottom = PAGE_H - 14;
  const lineH = 3.9;
  let y = 36;

  const sectionTitle = (number: string, text: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...ACCENT);
    doc.text(number, MARGIN, y);
    doc.setTextColor(...INK);
    doc.setFontSize(11);
    doc.text(text, MARGIN + 7, y);
    y += 5;
  };

  const tableHeader = (columns: Column[]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    let x = MARGIN + 4;
    for (const column of columns) {
      doc.text(column.title.toUpperCase(), x, y, { charSpace: 0.4 });
      x += column.width;
    }
    y += 2;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, right, y);
    y += 1;
  };

  const tableRow = (columns: Column[], cells: string[][], color: Rgb, boldFirst: boolean) => {
    doc.setFontSize(8.5);
    const wrapped = cells.map((lines, index) => {
      doc.setFont('helvetica', index === 0 && boldFirst ? 'bold' : 'normal');
      return lines.flatMap((line) => doc.splitTextToSize(pdfSafe(line) || '-', columns[index].width - 3) as string[]);
    });
    const height = Math.max(...wrapped.map((lines) => lines.length)) * lineH + 3;
    if (y + height > bottom) {
      startPage();
      y = 36;
      tableHeader(columns);
      doc.setFontSize(8.5);
    }
    doc.setFillColor(...color);
    doc.rect(MARGIN, y + 1, 1.1, height - 2, 'F');
    let x = MARGIN + 4;
    wrapped.forEach((lines, index) => {
      doc.setFont('helvetica', index === 0 && boldFirst ? 'bold' : 'normal');
      doc.setTextColor(...(index === 0 ? INK : ([55, 65, 81] as Rgb)));
      lines.forEach((line, lineIndex) => doc.text(line, x, y + 4.4 + lineIndex * lineH));
      x += columns[index].width;
    });
    y += height;
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.15);
    doc.line(MARGIN, y, right, y);
  };

  const full = right - MARGIN - 4;
  const courseColumns: Column[] = [
    { title: 'Code', width: 22 },
    { title: 'Course', width: 64 },
    { title: 'Slot', width: 30 },
    { title: 'Credits', width: 19 },
    { title: 'Instructors', width: 56 },
    { title: 'Classes', width: full - 191 },
  ];

  sectionTitle('01', 'Courses');
  tableHeader(courseColumns);
  for (const course of model.courses) {
    tableRow(
      courseColumns,
      [
        [course.courseCode],
        [course.courseName + (course.isPersonal ? ' (your own timings)' : '')],
        [course.slot || '-'],
        [course.credits],
        course.instructors.length ? [course.instructors.join(', ')] : ['-'],
        course.sessions.length ? course.sessions : ['No weekly classes'],
      ],
      course.color,
      true,
    );
  }

  if (model.oneOff.length > 0) {
    const oneOffColumns: Column[] = [
      { title: 'Date', width: 40 },
      { title: 'Time', width: 30 },
      { title: 'Course', width: 110 },
      { title: 'Class', width: 30 },
      { title: 'Room', width: full - 210 },
    ];
    y += 8;
    if (y + 24 > bottom) {
      startPage();
      y = 36;
    }
    sectionTitle('02', 'One-off classes');
    tableHeader(oneOffColumns);
    for (const item of model.oneOff) {
      tableRow(
        oneOffColumns,
        [
          [item.dateLabel],
          [`${item.startTime}-${item.endTime}`],
          [`${item.courseCode}  ${item.courseName}`],
          [item.typeLabel],
          [item.room],
        ],
        item.color,
        true,
      );
    }
  }
}

export async function buildTimetablePdf(model: TimetableExport): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `${model.title} timetable`, creator: 'Campus Companion' });

  pageHeader(doc, 'CLASS TIMETABLE', model.title, model);
  drawWeek(doc, model);

  const startPage = () => {
    doc.addPage('a4', 'landscape');
    pageHeader(doc, 'COURSE DETAILS', model.title, model);
  };
  startPage();
  drawDetails(doc, model, startPage);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    pageFooter(doc, model, page, pages);
  }
  return doc.output('arraybuffer');
}
