import { Router } from 'express';
import { z } from 'zod';
import { requireSession } from '../middleware/auth';
import * as changes from '../repositories/courseChanges.repository';
import { meetingListSchema } from './schemas';

/**
 * A student's inbox of timetable updates: optional changes to accept or
 * decline, official changes to be aware of, and the outcome of their own
 * requests. Every route acts only on the signed-in student's own entries.
 */
export const notificationsRouter = Router();

notificationsRouter.use(requireSession);

notificationsRouter.get('/', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store').json(await changes.listNotifications(req.session!.sub));
  } catch (error) {
    next(error);
  }
});

const markBody = z.object({
  ids: z.union([z.literal('all'), z.array(z.number().int().positive()).min(1).max(200)]),
  read: z.boolean().optional(),
  /** The interrupting alert for these entries has been shown. */
  alertSeen: z.boolean().optional(),
});

/** POST /api/notifications/mark — read state and "alert already shown". */
notificationsRouter.post('/mark', async (req, res, next) => {
  try {
    const parsed = markBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: z.prettifyError(parsed.error) });
      return;
    }
    const updated = await changes.markNotifications(req.session!.sub, parsed.data.ids, {
      read: parsed.data.read,
      alertSeen: parsed.data.alertSeen,
    });
    res.json({ updated });
  } catch (error) {
    next(error);
  }
});

const respondBody = z.object({
  response: z.enum(['accepted', 'rejected']),
  /**
   * With 'accepted': the student's meetings for the course after the change
   * was applied to their own timetable, saved as their personal timings.
   */
  override: z
    .object({
      meetings: meetingListSchema,
      baseFingerprint: z.string().min(1).max(64),
    })
    .optional(),
});

/**
 * POST /api/notifications/:id/respond
 *
 * Accepts or declines an optional change. Idempotent: repeating an answer
 * returns the stored result without applying anything twice.
 */
notificationsRouter.post('/:id/respond', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid notification id.' });
      return;
    }
    const parsed = respondBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: z.prettifyError(parsed.error) });
      return;
    }

    const result = await changes.respondToNotification(req.session!.sub, id, parsed.data);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error, state: result.state ?? null });
      return;
    }
    res.json({ notification: result.notification, courseOverrides: result.overrides });
  } catch (error) {
    next(error);
  }
});
