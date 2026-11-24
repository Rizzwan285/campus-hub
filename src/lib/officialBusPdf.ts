import { docUrl } from './documentUrl';

/**
 * The institute's own bus timings PDF, for anyone who wants the source rather
 * than the app's reading of it. scripts/fetch-bus-timings-pdf.mjs copies it
 * from iitpkd.ac.in to public/docs every week (.github/workflows/fetch-bus-timings.yml).
 */
export const OFFICIAL_BUS_PDF_FILE = 'official-bus-timings.pdf';
export const OFFICIAL_BUS_PDF_URL = docUrl(OFFICIAL_BUS_PDF_FILE);
export const INSTITUTE_SITE_URL = 'https://iitpkd.ac.in/';
