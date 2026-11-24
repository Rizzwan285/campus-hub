#!/usr/bin/env node
/**
 * Copies the institute's bus timings PDF to public/docs/official-bus-timings.pdf,
 * which the bus card links to as the official timings.
 *
 * The PDF gets a new address with every new circular, so it is looked up each
 * time from the "Bus Times" link in the footer of https://iitpkd.ac.in/. The
 * file is only replaced when its bytes change. Run every week by
 * .github/workflows/fetch-bus-timings.yml; no dependencies, Node 20+.
 *
 *   node scripts/fetch-bus-timings-pdf.mjs          # fetch, and update the file if it changed
 *   node scripts/fetch-bus-timings-pdf.mjs --check  # report only, write nothing
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_URL = 'https://iitpkd.ac.in/';
/** Relative to the repository root; the app links to it as docs/official-bus-timings.pdf. */
export const OUTPUT = 'public/docs/official-bus-timings.pdf';

const MIN_BYTES = 1024;
const MAX_BYTES = 20 * 1024 * 1024;
const USER_AGENT = 'Mozilla/5.0 (compatible; campus-companion-bus-pdf/1.0)';

/** "Bus Times" is what the footer says today; "Bus Timings" and "Bus Schedule" are near enough. */
const LINK_TEXT = /\bbus\s+(?:timings?|times?|schedules?)\b/i;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Every link in the page with an href, and the text a visitor sees on it. */
export function linksIn(html) {
  const links = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(match[1]);
    if (!href) continue;
    links.push({
      href: decodeEntities(href[1] ?? href[2] ?? href[3] ?? '').trim(),
      text: decodeEntities(match[2].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(),
    });
  }
  return links;
}

const isPdfHref = (href) => /\.pdf(?:$|[?#])/i.test(href);
const isFollowable = (href) => href !== '' && !href.startsWith('#') && !/^(?:mailto|tel|javascript):/i.test(href);

function absolute(href, pageUrl) {
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Where the site's bus timings link points, as an absolute URL, or null when
 * the page has none. A link straight to a PDF wins over one to a page.
 */
export function findBusTimingsLink(html, pageUrl) {
  const candidates = linksIn(html).filter((link) => LINK_TEXT.test(link.text) && isFollowable(link.href));
  const best = candidates.find((link) => isPdfHref(link.href)) ?? candidates[0];
  return best ? absolute(best.href, pageUrl) : null;
}

/**
 * For a link that leads to a page instead: the bus PDF on that page, or its
 * only PDF. Null when it has several and none says bus, rather than a guess.
 */
export function findPdfOnPage(html, pageUrl) {
  const pdfs = linksIn(html).filter((link) => isPdfHref(link.href));
  const best = pdfs.find((link) => /\bbus/i.test(link.text) || /bus/i.test(link.href))
    ?? (pdfs.length === 1 ? pdfs[0] : undefined);
  return best ? absolute(best.href, pageUrl) : null;
}

export const looksLikePdf = (bytes) =>
  bytes.length >= MIN_BYTES && bytes.subarray(0, 5).toString('latin1') === '%PDF-';

const shortHash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);

async function download(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}.`);
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) {
    throw new Error(`${url} is larger than ${MAX_BYTES} bytes, which no bus timings PDF should be.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error(`${url} is larger than ${MAX_BYTES} bytes.`);
  return { bytes, type: response.headers.get('content-type') ?? '', url: response.url || url };
}

/**
 * Finds the current PDF and writes it to `outputPath` when it differs from the
 * copy there. Throws, leaving the old copy alone, when the site has no bus
 * timings link or the link does not give a PDF.
 */
export async function updateOfficialPdf({ fetchImpl = fetch, outputPath, check = false, siteUrl = SITE_URL }) {
  const home = await download(fetchImpl, siteUrl);
  let source = findBusTimingsLink(home.bytes.toString('utf8'), home.url);
  if (!source) {
    throw new Error(`There is no "Bus Times" link on ${siteUrl} any more. Find the new one by hand and update this script.`);
  }

  let file = await download(fetchImpl, source);
  if (!looksLikePdf(file.bytes) && /html/i.test(file.type)) {
    const inner = findPdfOnPage(file.bytes.toString('utf8'), file.url);
    if (!inner) throw new Error(`${source} is a page with no bus timings PDF on it.`);
    source = inner;
    file = await download(fetchImpl, source);
  }
  if (!looksLikePdf(file.bytes)) {
    throw new Error(`${source} did not give a PDF (${file.type || 'no content type'}, ${file.bytes.length} bytes).`);
  }

  const previous = fs.existsSync(outputPath) ? fs.readFileSync(outputPath) : null;
  const changed = previous === null || !previous.equals(file.bytes);
  if (changed && !check) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, file.bytes);
  }
  return {
    source,
    bytes: file.bytes.length,
    hash: shortHash(file.bytes),
    previousHash: previous ? shortHash(previous) : null,
    changed,
    written: changed && !check,
  };
}

async function main() {
  const check = process.argv.includes('--check');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await updateOfficialPdf({ outputPath: path.join(root, OUTPUT), check });

  console.log(`Official bus timings PDF: ${result.source} (${result.bytes} bytes, sha256 ${result.hash}…)`);
  if (!result.changed) console.log(`${OUTPUT} is already this file. Nothing to do.`);
  else if (result.written) console.log(`${OUTPUT} updated (was ${result.previousHash ?? 'missing'}).`);
  else console.log(`${OUTPUT} would change (was ${result.previousHash ?? 'missing'}). --check: not written.`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.written}\nsource=${result.source}\n`);
  }
}

// Only when run, not when the tests import it.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
