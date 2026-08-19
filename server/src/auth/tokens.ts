import crypto from 'crypto';
import { config } from '../config';

/**
 * Stateless session tokens: base64url(payload).base64url(hmac).
 *
 * Deliberately not a JWT — there is no algorithm field to confuse, only
 * SHA-256 HMAC with the server secret. Stateless keeps auth off the database's
 * critical path, which matters when every query is a round trip to Singapore.
 */

const ALGORITHM = 'sha256';

export interface SessionPayload {
  /** profiles.id */
  sub: string;
  roll: string;
  role: 'student' | 'admin';
  /** issued at, epoch seconds */
  iat: number;
  /** expires at, epoch seconds */
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string): string {
  return crypto.createHmac(ALGORITHM, config.SESSION_SECRET).update(data).digest('base64url');
}

export function issueToken(
  profile: { id: string; roll_number: string; role: string },
  lifetimeDays = config.SESSION_DAYS,
): { token: string; expiresAt: Date } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + lifetimeDays * 86400;

  const payload: SessionPayload = {
    sub: profile.id,
    roll: profile.roll_number,
    role: profile.role === 'admin' ? 'admin' : 'student',
    iat: now,
    exp,
  };

  const body = b64url(JSON.stringify(payload));
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp * 1000) };
}

export function verifyToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  const expected = sign(body);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
  if (!payload.sub || !payload.roll) return null;

  return payload;
}

/**
 * Sliding expiry: once a token is more than a day old, hand back a fresh one so
 * anyone using the app at least once every SESSION_DAYS stays signed in.
 */
export function shouldRenew(payload: SessionPayload): boolean {
  const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat;
  return ageSeconds > 86400;
}

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;

  const [scheme, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;

  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expectedBuf = Buffer.from(expected, 'hex');

  return (
    derived.length === expectedBuf.length && crypto.timingSafeEqual(derived, expectedBuf)
  );
}
