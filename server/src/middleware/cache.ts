import crypto from 'crypto';
import type { RequestHandler } from 'express';

/**
 * Response cache for the public content endpoints.
 *
 * These payloads change a few times a semester but are requested on every app
 * open, and each miss costs a round trip to the database in Singapore (~100ms
 * from here, more from a phone on campus wifi). Two layers:
 *
 *   1. An in-process map, so repeat requests skip the database entirely.
 *   2. An ETag, so a returning browser gets a 304 with no body at all — which
 *      is what keeps Supabase's egress allowance comfortable at a few hundred
 *      users.
 *
 * Admin writes call invalidate(), so an edit is visible immediately rather than
 * after the TTL.
 */

interface Entry {
  body: string;
  etag: string;
  storedAt: number;
}

const store = new Map<string, Entry>();

/** Browsers may reuse a cached body for this long without revalidating. */
const BROWSER_MAX_AGE_SECONDS = 60;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function etagFor(body: string): string {
  return `W/"${crypto.createHash('sha1').update(body).digest('base64url')}"`;
}

export function invalidate(prefix?: string): number {
  if (!prefix) {
    const size = store.size;
    store.clear();
    return size;
  }

  let removed = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function cacheStats() {
  return { entries: store.size, keys: [...store.keys()] };
}

/**
 * Caches the JSON body a handler produces, keyed by the request path plus
 * query. Only safe on responses that are identical for every visitor.
 */
export function cached(ttlMs = DEFAULT_TTL_MS): RequestHandler {
  return (req, res, next) => {
    const key = req.originalUrl;
    const hit = store.get(key);
    const fresh = hit && Date.now() - hit.storedAt < ttlMs;

    if (fresh) {
      res.setHeader('ETag', hit.etag);
      res.setHeader('Cache-Control', `public, max-age=${BROWSER_MAX_AGE_SECONDS}`);
      res.setHeader('X-Cache', 'HIT');

      if (req.header('if-none-match') === hit.etag) {
        res.status(304).end();
        return;
      }

      res.type('application/json').send(hit.body);
      return;
    }

    // Intercept res.json so handlers stay unaware of caching.
    const originalJson = res.json.bind(res);
    res.json = ((payload: unknown) => {
      if (res.statusCode === 200) {
        const body = JSON.stringify(payload);
        const etag = etagFor(body);
        store.set(key, { body, etag, storedAt: Date.now() });

        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', `public, max-age=${BROWSER_MAX_AGE_SECONDS}`);
        res.setHeader('X-Cache', 'MISS');

        if (req.header('if-none-match') === etag) {
          res.status(304).end();
          return res;
        }
        return res.type('application/json').send(body);
      }
      return originalJson(payload);
    }) as typeof res.json;

    next();
  };
}
