import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OFFICIAL_BUS_PDF_FILE } from '../src/lib/officialBusPdf';
import {
  OUTPUT, findBusTimingsLink, findPdfOnPage, linksIn, looksLikePdf, updateOfficialPdf,
} from './fetch-bus-timings-pdf.mjs';

const SITE = 'https://iitpkd.ac.in/';
const CURRENT_PDF = 'https://iitpkd.ac.in/sites/default/files/2026-10/e307a534-0591-4127-9cdb-3b4126330840.pdf';

/** The footer menu as iitpkd.ac.in served it on 25 Nov 2026. */
const FOOTER = `
  <li class="menu-item"
  >
    <a href="/sites/default/files/2019-07/StudentCodeofConduct.pdf">Students&#039; Code of Conduct</a>
  </li>
  <li class="menu-item"
  >
    <a href="/sites/default/files/2024-10/33676753-qwer-3ed8-Imnk-dc36hh5263b9.pdf">Grievance Cell Guidelines</a>
  </li>
  <li class="menu-item"
  >
    <a href="/sites/default/files/2026-10/e307a534-0591-4127-9cdb-3b4126330840.pdf">Bus Times</a>
  </li>
  <li class="menu-item"
  >
    <a href="https://docs.google.com/forms/d/e/1FAIpQLSc18KjYoX5HiZ6ES0mYzZWWNOZtXS1PBfpTVqL6xZE6Jo6lvQ/viewform">Shuttle Services Request (Buses)</a>
  </li>`;

const pdfBytes = (marker) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2048, marker)]);

/** A stand-in for fetch: a map of URL to [body, content type], 404 for anything else. */
function fakeFetch(pages) {
  const asked = [];
  const impl = async (url) => {
    asked.push(url);
    const page = pages[url];
    if (!page) return new Response('missing', { status: 404 });
    const [body, type] = page;
    return new Response(body, { status: 200, headers: { 'content-type': type } });
  };
  return { impl, asked };
}

describe('finding the bus timings link', () => {
  it('reads the link in the real footer, and not the shuttle request form', () => {
    expect(findBusTimingsLink(FOOTER, SITE)).toBe(CURRENT_PDF);
  });

  it('accepts other wordings, nested markup, entities and absolute or single-quoted links', () => {
    expect(findBusTimingsLink(`<a class='x' href='https://example.test/a.pdf?x=1&amp;y=2'><span>Bus\n  Timings</span></a>`, SITE))
      .toBe('https://example.test/a.pdf?x=1&y=2');
    expect(findBusTimingsLink('<a href="/files/b.pdf">Bus Schedule</a>', SITE)).toBe('https://iitpkd.ac.in/files/b.pdf');
    expect(findBusTimingsLink('<a href="/files/c.pdf">BUS TIMING</a>', SITE)).toBe('https://iitpkd.ac.in/files/c.pdf');
  });

  it('prefers a direct PDF over a page with the same words', () => {
    const html = '<a href="/transport">Bus Timings</a> … <a href="/f/bus.pdf">Bus Times</a>';
    expect(findBusTimingsLink(html, SITE)).toBe('https://iitpkd.ac.in/f/bus.pdf');
    expect(findBusTimingsLink('<a href="/transport">Bus Timings</a>', SITE)).toBe('https://iitpkd.ac.in/transport');
  });

  it('finds nothing rather than guessing', () => {
    expect(findBusTimingsLink('<a href="/bus-pass.pdf">Bus Pass</a><a href="#">Bus Times</a>', SITE)).toBeNull();
    expect(findBusTimingsLink('<a>Bus Times</a><a href="mailto:x@y">Bus Times</a>', SITE)).toBeNull();
    expect(findBusTimingsLink('<p>Bus Times</p>', SITE)).toBeNull();
  });

  it('keeps the visible text of every link', () => {
    expect(linksIn(FOOTER).map((link) => link.text)).toEqual([
      "Students' Code of Conduct", 'Grievance Cell Guidelines', 'Bus Times', 'Shuttle Services Request (Buses)',
    ]);
  });
});

describe('a link that leads to a page', () => {
  it('takes the bus PDF on it, or its only PDF', () => {
    const page = '<a href="rules.pdf">Rules</a><a href="/f/bus-timings-oct.pdf">October circular</a>';
    expect(findPdfOnPage(page, 'https://iitpkd.ac.in/transport/')).toBe('https://iitpkd.ac.in/f/bus-timings-oct.pdf');
    expect(findPdfOnPage('<a href="only.pdf">Circular</a>', 'https://iitpkd.ac.in/transport/'))
      .toBe('https://iitpkd.ac.in/transport/only.pdf');
  });

  it('gives up when several PDFs are there and none says bus', () => {
    expect(findPdfOnPage('<a href="a.pdf">One</a><a href="b.pdf">Two</a>', SITE)).toBeNull();
  });
});

describe('checking the download', () => {
  it('wants the PDF signature and a sensible size', () => {
    expect(looksLikePdf(pdfBytes(1))).toBe(true);
    expect(looksLikePdf(Buffer.from('<!DOCTYPE html><html>…</html>'.padEnd(4000, ' ')))).toBe(false);
    expect(looksLikePdf(Buffer.from('%PDF-1.4 tiny'))).toBe(false);
  });

  it('is written where the bus card links to', () => {
    expect(OUTPUT).toBe(`public/docs/${OFFICIAL_BUS_PDF_FILE}`);
  });
});

describe('updating the copy', () => {
  let dir;
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));
  const target = () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bus-pdf-'));
    return path.join(dir, 'docs', 'official-bus-timings.pdf');
  };

  it('writes a new PDF, then leaves an unchanged one alone', async () => {
    const out = target();
    const { impl } = fakeFetch({ [SITE]: [FOOTER, 'text/html'], [CURRENT_PDF]: [pdfBytes(1), 'application/pdf'] });

    const first = await updateOfficialPdf({ fetchImpl: impl, outputPath: out });
    expect(first).toMatchObject({ source: CURRENT_PDF, changed: true, written: true, previousHash: null });
    expect(fs.readFileSync(out).equals(pdfBytes(1))).toBe(true);

    const again = await updateOfficialPdf({ fetchImpl: impl, outputPath: out });
    expect(again).toMatchObject({ changed: false, written: false });
  });

  it('replaces the copy when the institute publishes a new circular', async () => {
    const out = target();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, pdfBytes(1));
    const newer = FOOTER.replace('2026-10/e307a534-0591-4127-9cdb-3b4126330840.pdf', '2027-01/new.pdf');
    const { impl } = fakeFetch({
      [SITE]: [newer, 'text/html'],
      'https://iitpkd.ac.in/sites/default/files/2027-01/new.pdf': [pdfBytes(2), 'application/pdf'],
    });

    const result = await updateOfficialPdf({ fetchImpl: impl, outputPath: out });
    expect(result).toMatchObject({ changed: true, written: true });
    expect(fs.readFileSync(out).equals(pdfBytes(2))).toBe(true);
  });

  it('only reports with check', async () => {
    const out = target();
    const { impl } = fakeFetch({ [SITE]: [FOOTER, 'text/html'], [CURRENT_PDF]: [pdfBytes(1), 'application/pdf'] });
    const result = await updateOfficialPdf({ fetchImpl: impl, outputPath: out, check: true });
    expect(result).toMatchObject({ changed: true, written: false });
    expect(fs.existsSync(out)).toBe(false);
  });

  it('follows a link to a page through to its PDF', async () => {
    const out = target();
    const { impl, asked } = fakeFetch({
      [SITE]: ['<a href="/transport">Bus Timings</a>', 'text/html'],
      'https://iitpkd.ac.in/transport': ['<a href="/f/bus-2027.pdf">Download</a>', 'text/html; charset=UTF-8'],
      'https://iitpkd.ac.in/f/bus-2027.pdf': [pdfBytes(3), 'application/pdf'],
    });
    const result = await updateOfficialPdf({ fetchImpl: impl, outputPath: out });
    expect(result.source).toBe('https://iitpkd.ac.in/f/bus-2027.pdf');
    expect(asked).toEqual([SITE, 'https://iitpkd.ac.in/transport', 'https://iitpkd.ac.in/f/bus-2027.pdf']);
  });

  it('fails, keeping the old copy, when the link is gone or is not a PDF', async () => {
    const out = target();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, pdfBytes(1));

    const noLink = fakeFetch({ [SITE]: ['<a href="/about">About</a>', 'text/html'] });
    await expect(updateOfficialPdf({ fetchImpl: noLink.impl, outputPath: out })).rejects.toThrow(/no "Bus Times" link/);

    const notPdf = fakeFetch({ [SITE]: [FOOTER, 'text/html'], [CURRENT_PDF]: ['Access denied'.padEnd(3000), 'text/plain'] });
    await expect(updateOfficialPdf({ fetchImpl: notPdf.impl, outputPath: out })).rejects.toThrow(/did not give a PDF/);

    const gone = fakeFetch({ [SITE]: [FOOTER, 'text/html'] });
    await expect(updateOfficialPdf({ fetchImpl: gone.impl, outputPath: out })).rejects.toThrow(/HTTP 404/);

    const siteDown = fakeFetch({});
    await expect(updateOfficialPdf({ fetchImpl: siteDown.impl, outputPath: out })).rejects.toThrow(/HTTP 404/);

    expect(fs.readFileSync(out).equals(pdfBytes(1))).toBe(true);
  });
});
