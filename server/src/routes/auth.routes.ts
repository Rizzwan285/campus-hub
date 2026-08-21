import { Router } from 'express';
import { z } from 'zod';
import { issueToken, verifyPassword } from '../auth/tokens';
import { requireSession } from '../middleware/auth';
import * as profiles from '../repositories/profile.repository';

export const authRouter = Router();

const ROLL_RE = /^[A-Za-z0-9]{4,20}$/;

/**
 * Failed password attempts per roll number.
 *
 * Only accounts that carry a password can land here — today that is the
 * developer account alone — so the map stays small; entries are dropped once
 * the window passes. MAX_TRACKED is the belt-and-braces bound for the day more
 * accounts get passwords: it caps memory no matter what arrives.
 *
 * This lives in process memory, so it protects one instance. Running more than
 * one API instance needs shared state (Redis) for the limit to mean anything.
 */
const attempts = new Map<string, { count: number; firstAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED = 1000;

/** Drops expired entries, then the oldest ones, until the map fits. */
function pruneAttempts(): void {
  const now = Date.now();
  for (const [roll, entry] of attempts) {
    if (now - entry.firstAt > WINDOW_MS) attempts.delete(roll);
  }
  if (attempts.size <= MAX_TRACKED) return;

  // Map iterates in insertion order, so the front is the oldest.
  const excess = attempts.size - MAX_TRACKED;
  let dropped = 0;
  for (const roll of attempts.keys()) {
    if (dropped >= excess) break;
    attempts.delete(roll);
    dropped += 1;
  }
}

function tooManyAttempts(roll: string): boolean {
  const entry = attempts.get(roll);
  if (!entry) return false;

  if (Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.delete(roll);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(roll: string): void {
  const entry = attempts.get(roll);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    if (attempts.size >= MAX_TRACKED) pruneAttempts();
    attempts.set(roll, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

const loginBody = z.object({
  rollNumber: z.string().regex(ROLL_RE, 'Enter a valid roll number.'),
  password: z.string().max(200).optional(),
});

/**
 * POST /api/auth/login
 *
 * Students sign in with a roll number alone; the account is created on first
 * use. Accounts that carry a password (the developer account) must supply it.
 */
authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: z.prettifyError(parsed.error) });
      return;
    }

    const roll = profiles.normalizeRoll(parsed.data.rollNumber);

    if (tooManyAttempts(roll)) {
      res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
      return;
    }

    const existing = await profiles.findByRoll(roll);

    if (existing?.password_hash) {
      if (!parsed.data.password) {
        // Lets the client show a password field without leaking which accounts
        // exist beyond the one everybody already knows is the developer's.
        res.status(401).json({ error: 'Password required.', passwordRequired: true });
        return;
      }
      if (!verifyPassword(parsed.data.password, existing.password_hash)) {
        recordFailure(roll);
        res.status(401).json({ error: 'Incorrect password.', passwordRequired: true });
        return;
      }
      attempts.delete(roll);
    }

    const profile = existing ?? (await profiles.findOrCreateByRoll(roll));
    const { token, expiresAt } = issueToken(profile);
    await profiles.touchLastSeen(profile.id);

    const selected = await profiles.getSelectedCourseIds(profile.id);
    res.json({
      token,
      expiresAt: expiresAt.toISOString(),
      profile: profiles.toPublicProfile(profile, selected),
    });
  } catch (error) {
    next(error);
  }
});

/** Lets the login form know whether to show a password field. */
authRouter.get('/check/:rollNumber', async (req, res, next) => {
  try {
    if (!ROLL_RE.test(req.params.rollNumber)) {
      res.status(400).json({ error: 'Enter a valid roll number.' });
      return;
    }
    const existing = await profiles.findByRoll(req.params.rollNumber);
    res.json({ passwordRequired: Boolean(existing?.password_hash) });
  } catch (error) {
    next(error);
  }
});

/** Current profile; also the client's way of validating a stored token. */
authRouter.get('/me', requireSession, async (req, res, next) => {
  try {
    const profile = await profiles.findByRoll(req.session!.roll);
    if (!profile) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    await profiles.touchLastSeen(profile.id);
    const selected = await profiles.getSelectedCourseIds(profile.id);
    res.json({ profile: profiles.toPublicProfile(profile, selected) });
  } catch (error) {
    next(error);
  }
});

const profileBody = z.object({
  name: z.string().min(1).max(80).optional(),
  mess: z.enum(['Nila', 'Kedaram']).nullable().optional(),
  program: z.enum(['UG', 'PG']).nullable().optional(),
  branch: z.string().max(60).nullable().optional(),
  yearOfStudy: z.string().max(10).nullable().optional(),
  batchNo: z.string().max(10).nullable().optional(),
});

/** PATCH /api/auth/profile — onboarding and later edits, including mess changes. */
authRouter.patch('/profile', requireSession, async (req, res, next) => {
  try {
    const parsed = profileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: z.prettifyError(parsed.error) });
      return;
    }

    const updated = await profiles.updateProfile(req.session!.sub, parsed.data);
    if (!updated) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    const selected = await profiles.getSelectedCourseIds(updated.id);
    res.json({ profile: profiles.toPublicProfile(updated, selected) });
  } catch (error) {
    next(error);
  }
});

const coursesBody = z.object({
  offeringIds: z.array(z.string().max(80)).max(40),
});

/** PUT /api/auth/courses — syncs the user's selection across devices. */
authRouter.put('/courses', requireSession, async (req, res, next) => {
  try {
    const parsed = coursesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: z.prettifyError(parsed.error) });
      return;
    }

    const stored = await profiles.setSelectedCourses(req.session!.sub, parsed.data.offeringIds);
    res.json({ selectedCourseIds: stored });
  } catch (error) {
    next(error);
  }
});
