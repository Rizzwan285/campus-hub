import crypto from 'crypto';
import type { RequestHandler } from 'express';
import { config } from '../config';

/**
 * Guards the write endpoints with a shared secret sent as `X-Admin-Key`.
 *
 * A placeholder until Supabase Auth is wired up, at which point this should
 * verify the caller's JWT and check profiles.role = 'admin' instead.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const expected = config.ADMIN_API_KEY;

  if (!expected) {
    res.status(503).json({ error: 'Admin endpoints are disabled: ADMIN_API_KEY is not set.' });
    return;
  }

  const provided = req.header('x-admin-key') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Invalid or missing X-Admin-Key header.' });
    return;
  }

  next();
};
