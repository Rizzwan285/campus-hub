/**
 * Phone numbers and links in the Contacts directory.
 *
 * Shared by the app, which builds tap-to-call links, and the API, which
 * refuses anything that would not make one — so a number the developer can
 * save always dials. Numbers are stored and shown exactly as typed; only the
 * `tel:` link is normalised.
 */

/** What people type between digits: spaces, hyphens, dots and brackets. */
const SEPARATORS = /[\s\-.()]/g;

export const MAX_PHONE_LENGTH = 20;
export const MAX_LINK_LENGTH = 500;

/**
 * The number to dial, or null when the text is not a plausible phone number.
 *
 * - Ten digits not starting with 0 or 1: an Indian number written without
 *   the country code, so +91 is added.
 * - 0 and then ten digits: the same with the trunk prefix, replaced by +91.
 * - + and then 8–15 digits: already international. After +91 there must be
 *   exactly ten digits.
 * - Three or four digits starting with 1: a short service number such as 108
 *   or 1091, dialled as it is.
 */
export function dialableNumber(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_PHONE_LENGTH) return null;

  const compact = trimmed.replace(SEPARATORS, '');
  if (/^[2-9]\d{9}$/.test(compact)) return `+91${compact}`;
  if (/^0[2-9]\d{9}$/.test(compact)) return `+91${compact.slice(1)}`;
  if (compact.startsWith('+91')) return /^\+91[2-9]\d{9}$/.test(compact) ? compact : null;
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  if (/^1\d{2,3}$/.test(compact)) return compact;
  return null;
}

/** `tel:+919947872907` for "9947872907"; null for something that cannot be dialled. */
export function telHref(raw: string): string | null {
  const number = dialableNumber(raw);
  return number ? `tel:${number}` : null;
}

/** A complete https:// address. Plain http and other schemes are refused. */
export function isHttpsLink(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_LINK_LENGTH) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' && url.hostname.includes('.') && !url.username && !url.password;
  } catch {
    return false;
  }
}
