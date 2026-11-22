import type { jsPDF as JsPDF } from 'jspdf';
import { formatMinutes, laneSpan, shade, tint, type Rgb, type TimetableExport } from './timetableExport';

/**
 * The timetable as a two-page A4 landscape PDF: the week as a grid, then the
 * course details. Drawn directly rather than from a screenshot of the page, so
 * it is sharp when printed and the same on every phone.
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

function drawWeek(doc: JsPDF, model: TimetableExport) {
  const left = MARGIN;
  const gutter = 13;
  const top = 34;
  const headerH = 8;
  const bodyTop = top + headerH;
  const bodyBottom = PAGE_H - 14;
  const bodyH = bodyBottom - bodyTop;
  const dayW = (PAGE_W - MARGIN - left - gutter) / model.days.length;
  const span = Math.max(60, model.endMin - model.startMin);
  const yOf = (minutes: number) => bodyTop + ((minutes - model.startMin) / span) * bodyH;
  const xOfDay = (index: number) => left + gutter + index * dayW;

  // Day names.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  model.days.forEach((day, index) => {
    doc.text(day.toUpperCase(), xOfDay(index) + dayW / 2, top + 5.2, { align: 'center', charSpace: 0.5 });
  });

  // Hours.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setLineWidth(0.15);
  for (let minutes = model.startMin; minutes <= model.endMin; minutes += 60) {
    const y = yOf(minutes);
    doc.setDrawColor(...HAIRLINE);
    doc.line(left + gutter, y, PAGE_W - MARGIN, y);
    doc.setTextColor(...MUTED);
    doc.text(formatMinutes(minutes), left + gutter - 2, y, { align: 'right', baseline: 'middle' });
  }
  // Day separators.
  for (let index = 0; index <= model.days.length; index += 1) {
    doc.setDrawColor(...HAIRLINE);
    doc.line(xOfDay(index), bodyTop, xOfDay(index), bodyBottom);
  }

  // Classes.
  for (const item of model.classes) {
    const dayIndex = model.days.indexOf(item.day);
    if (dayIndex === -1) continue;
    const { offset, width } = laneSpan(item);
    const x = xOfDay(dayIndex) + offset * dayW + 0.7;
    const w = width * dayW - 1.4;
    const y = yOf(item.start) + 0.5;
    const h = Math.max(4, yOf(item.end) - yOf(item.start) - 1);

    doc.setFillColor(...tint(item.color, 0.88));
    doc.roundedRect(x, y, w, h, 0.9, 0.9, 'F');
    doc.setFillColor(...item.color);
    doc.rect(x, y, 1.1, h, 'F');

    const textX = x + 2.6;
    const textW = w - 3.8;
    const lineH = 2.9;
    const room = Math.max(1, Math.floor((h - 2.2) / lineH));

    const detail: string[] = [];
    if (room >= 2) detail.push(`${item.typeLabel} · ${pdfSafe(item.room)}`);
    if (room >= 3) detail.push(`${item.startTime}-${item.endTime}${item.alternate ? ' · alt. weeks' : ''}`);

    let cursor = y + 3.7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...shade(item.color, 0.35));
    const code = item.alternate && room < 3 ? `${item.courseCode} (alt)` : item.courseCode;
    doc.text(fit(doc, pdfSafe(code), textW), textX, cursor);
    cursor += lineH + 0.2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(55, 65, 81);

    // The course name takes whatever lines are left over.
    const nameLines = Math.min(2, room - 1 - detail.length);
    if (nameLines > 0) {
      const wrapped = doc.splitTextToSize(pdfSafe(item.courseName), textW) as string[];
      wrapped.slice(0, nameLines).forEach((line, index) => {
        const last = index === nameLines - 1 && wrapped.length > nameLines;
        doc.text(last ? fit(doc, `${line}..`, textW) || line : line, textX, cursor);
        cursor += lineH;
      });
    }
    for (const line of detail) {
      doc.text(fit(doc, line, textW), textX, cursor);
      cursor += lineH;
    }
  }

  if (model.classes.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('No weekly classes in the selected courses.', PAGE_W / 2, bodyTop + bodyH / 2, { align: 'center' });
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
    { title: 'Code', width: 24 },
    { title: 'Course', width: 78 },
    { title: 'Credits', width: 22 },
    { title: 'Instructors', width: 62 },
    { title: 'Classes', width: full - 186 },
  ];

  sectionTitle('01', 'Courses');
  tableHeader(courseColumns);
  for (const course of model.courses) {
    tableRow(
      courseColumns,
      [
        [course.courseCode],
        [course.courseName + (course.isPersonal ? ' (your own timings)' : '')],
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
