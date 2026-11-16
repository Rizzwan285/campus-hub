import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

/** A trailing slash on APP_URL would put `//admin` in every email link. */
const withoutTrailingSlash = (value: string | undefined) => value?.trim().replace(/\/+$/, '') || undefined;

const isHttpUrl = (value: string, protocols: string[]) => {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (see server/.env.example)'),
    DIRECT_URL: z.string().optional(),
    PORT: z.coerce.number().default(4000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    CORS_ORIGIN: z.string().default('http://localhost:8080'),
    ADMIN_API_KEY: z.string().optional(),
    // Signs session tokens. Changing it signs everyone out.
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    // How long a session survives without use.
    SESSION_DAYS: z.coerce.number().int().positive().default(30),
    /** Roll number that owns the developer account. */
    ADMIN_ROLL_NUMBER: z.string().default('142301026'),

    /** Interpreter for the semester importer (scripts/pipeline). Standard library only. */
    PYTHON_BIN: z.string().default('python3'),

    // ---- email to the developer about new timetable change requests ----
    /**
     * `resend` or `brevo` send over their HTTPS APIs; `apps_script` posts to a
     * Google Apps Script web app that sends from Gmail; `log` prints instead;
     * `none` disables.
     */
    EMAIL_PROVIDER: z.enum(['resend', 'brevo', 'apps_script', 'log', 'none']).default('none'),
    EMAIL_API_KEY: z.string().optional(),
    /** A sender the provider has verified, e.g. "Campus Companion <alerts@example.com>". */
    EMAIL_FROM: z.string().optional(),
    /**
     * Whether change-request emails are queued at all, and where they go. With
     * `apps_script` the script always sends to its own ADMIN_EMAIL property, so
     * set this to that same address.
     */
    ADMIN_NOTIFY_EMAIL: z.string().optional(),
    /** Public URL of the web app, for the link back to /admin. A trailing slash is removed. */
    APP_URL: z.string().optional().transform(withoutTrailingSlash),
    /** The Apps Script deployment's `/exec` URL. */
    APPS_SCRIPT_URL: z.string().optional().transform((value) => value?.trim() || undefined),
    /** Must equal the script's SHARED_SECRET property. Never logged or shown. */
    APPS_SCRIPT_SECRET: z.string().optional().transform((value) => value?.trim() || undefined),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER !== 'apps_script') return;
    // Checked at startup so a half-configured Apps Script relay fails loudly on
    // deploy instead of quietly piling up undelivered emails. The messages name
    // the variable, never its value.
    const problem = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (!env.APPS_SCRIPT_URL) {
      problem('APPS_SCRIPT_URL', 'is required when EMAIL_PROVIDER=apps_script (the deployment\'s /exec URL).');
    } else if (!isHttpUrl(env.APPS_SCRIPT_URL, ['https:'])) {
      problem('APPS_SCRIPT_URL', 'must be an https:// URL.');
    } else if (!new URL(env.APPS_SCRIPT_URL).pathname.endsWith('/exec')) {
      problem('APPS_SCRIPT_URL', 'must be the deployment URL ending in /exec (the /dev URL needs a Google sign-in).');
    }
    if (!env.APPS_SCRIPT_SECRET) {
      problem('APPS_SCRIPT_SECRET', 'is required when EMAIL_PROVIDER=apps_script (the script\'s SHARED_SECRET).');
    } else if (env.APPS_SCRIPT_SECRET.length < 16) {
      problem('APPS_SCRIPT_SECRET', 'must be at least 16 characters.');
    }
    if (!env.ADMIN_NOTIFY_EMAIL?.trim()) {
      problem('ADMIN_NOTIFY_EMAIL', 'is required when EMAIL_PROVIDER=apps_script; without it no email is ever queued. Use the script\'s ADMIN_EMAIL address.');
    }
    if (!env.APP_URL) {
      problem('APP_URL', 'is required when EMAIL_PROVIDER=apps_script, for the link to /admin (e.g. https://rizwans-campus-hub.vercel.app).');
    } else if (!isHttpUrl(env.APP_URL, ['https:', 'http:'])) {
      problem('APP_URL', 'must be the website\'s full URL, starting with https://.');
    }
  });

/** Each problem as "NAME: what is wrong" - values are never included. */
export function describeEnvProblems(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid server environment:');
  for (const line of describeEnvProblems(parsed.error)) {
    console.error(`  ${line}`);
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
