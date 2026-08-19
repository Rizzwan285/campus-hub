import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (see server/.env.example)'),
  DIRECT_URL: z.string().optional(),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:8080'),
  ADMIN_API_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid server environment:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const allowedOrigins = parsed.data.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * An entry may contain `*` as a subdomain wildcard, e.g. `https://*.vercel.app`
 * to cover Vercel's per-deployment preview URLs. `*` matches one label only, so
 * it never widens past the domain it is written against.
 */
function originMatcher(pattern: string): (origin: string) => boolean {
  if (!pattern.includes('*')) {
    return (origin) => origin === pattern;
  }

  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]+');
  const regex = new RegExp(`^${escaped}$`);
  return (origin) => regex.test(origin);
}

const matchers = allowedOrigins.map(originMatcher);

export const config = {
  ...parsed.data,
  allowedOrigins,
  isOriginAllowed: (origin: string) => matchers.some((matches) => matches(origin)),
  isProduction: parsed.data.NODE_ENV === 'production',
};
