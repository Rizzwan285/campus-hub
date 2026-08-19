import crypto from 'crypto';
import type { RequestHandler, Request } from 'express';
import { config } from '../config';
import { verifyToken, shouldRenew, issueToken, type SessionPayload } from '../auth/tokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}

function bearerToken(req: Request): string | undefined {
  const header = req.header('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return undefined;
}

/**
 * Attaches req.session when a valid token is present. Never rejects — routes
 * decide whether a session is required.
 *
 * Sends a refreshed token back in `X-Session-Token` once a token is over a day
 * old, so an active user's session keeps sliding forward.
 */
export const attachSession: RequestHandler = (req, res, next) => {
  const payload = verifyToken(bearerToken(req));

  if (payload) {
    req.session = payload;
    if (shouldRenew(payload)) {
      const { token } = issueToken({
        id: payload.sub,
        roll_number: payload.roll,
        role: payload.role,
      });
      res.setHeader('X-Session-Token', token);
    }
  }

  next();
};

export const requireSession: RequestHandler = (req, res, next) => {
  if (!req.session) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  next();
};

function matchesApiKey(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Admin access via either an admin session (the developer signed in through the
 * UI) or the shared X-Admin-Key, which keeps scripting and curl workable.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.session?.role === 'admin') {
    next();
    return;
  }

  const provided = req.header('x-admin-key');
  if (provided && config.ADMIN_API_KEY && matchesApiKey(provided, config.ADMIN_API_KEY)) {
    next();
    return;
  }

  res.status(req.session ? 403 : 401).json({
    error: req.session ? 'This account is not an administrator.' : 'Sign in as an administrator.',
  });
};
