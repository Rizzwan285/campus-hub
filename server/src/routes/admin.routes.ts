import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';
import { invalidate } from '../middleware/cache';
import * as mess from '../repositories/mess.repository';
import * as canteen from '../repositories/canteen.repository';
import * as calendar from '../repositories/calendar.repository';
import * as admin from '../repositories/admin.repository';
import * as profiles from '../repositories/profile.repository';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const MEALS = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'] as const;

/** Records who changed what, then drops the cached copy so readers see it. */
async function audit(
  req: import('express').Request,
  action: string,
  target: string,
  before: unknown,
  after: unknown,
  cachePrefix?: string,
) {
  await profiles.recordAudit({
    actorId: req.session?.sub ?? null,
    actorRoll: req.session?.roll ?? 'api-key',
    action,
    target,
    before,
    after,
  });
  invalidate(cachePrefix);
}

// ---------------------------------------------------------------- mess menu

const menuEntryParams = z.object({
  messSlug: z.string().min(1),
  weekCycle: z.enum(['week13', 'week24', 'all']),
  day: z.enum(DAYS),
  meal: z.enum(MEALS),
});

const menuEntryBody = z
  .object({
    items: z.array(z.string().min(1)).max(30).optional(),
    veg: z.string().max(300).nullable().optional(),
    nonVeg: z.string().max(300).nullable().optional(),
  })
  .refine((body) => body.items !== undefined || body.veg !== undefined || body.nonVeg !== undefined, {
    message: 'Provide at least one of: items, veg, nonVeg.',
  });

adminRouter.put('/mess/:messSlug/:weekCycle/:day/:meal', async (req, res, next) => {
  try {
    const params = menuEntryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: z.prettifyError(params.error) });
      return;
    }
    const body = menuEntryBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.prettifyError(body.error) });
      return;
    }

    const { messSlug, weekCycle, day, meal } = params.data;
    const updated = await mess.updateMenuEntry(messSlug, weekCycle, day, meal, body.data);
    if (!updated) {
      res.status(404).json({ error: 'No matching menu entry.' });
      return;
    }

    await audit(req, 'mess.menu.update', `${messSlug}/${weekCycle}/${day}/${meal}`, null, updated, '/api/mess');
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

adminRouter.put('/mess-timings/:dayType/:meal', async (req, res, next) => {
  try {
    const params = z
      .object({ dayType: z.enum(['weekday', 'weekend']), meal: z.enum(MEALS) })
      .safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: z.prettifyError(params.error) });
      return;
    }
    const body = z.object({ timing: z.string().min(1).max(60) }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.prettifyError(body.error) });
      return;
    }

    const updated = await mess.updateTiming(params.data.dayType, params.data.meal, body.data.timing);
    if (!updated) {
      res.status(404).json({ error: 'No matching timing row.' });
      return;
    }

    await audit(req, 'mess.timing.update', `${params.data.dayType}/${params.data.meal}`, null, updated, '/api/mess');
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------- canteen

adminRouter.patch('/canteen/items/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid item id.' });
      return;
    }

    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        price: z.number().nonnegative().nullable().optional(),
        variant: z.string().max(60).nullable().optional(),
      })
      .refine((patch) => Object.keys(patch).length > 0, { message: 'Empty patch.' })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.prettifyError(body.error) });
      return;
    }

    const updated = await canteen.updateCanteenItem(id, body.data);
    if (!updated) {
      res.status(404).json({ error: 'No such canteen item.' });
      return;
    }

    await audit(req, 'canteen.item.update', String(id), null, updated, '/api/canteen');
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------- calendar

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD.');

adminRouter.put('/academic-days/:date', async (req, res, next) => {
  try {
    const date = isoDate.safeParse(req.params.date);
    if (!date.success) {
      res.status(400).json({ error: z.prettifyError(date.error) });
      return;
    }
    const body = z
      .object({ name: z.string().min(1).max(120), kind: z.enum(['holiday', 'instructional']) })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.prettifyError(body.error) });
      return;
    }

    const saved = await calendar.upsertAcademicDay(date.data, body.data.name, body.data.kind);
    await audit(req, 'calendar.upsert', date.data, null, saved, '/api/');
    res.json(saved);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/academic-days/:date', async (req, res, next) => {
  try {
    const date = isoDate.safeParse(req.params.date);
    if (!date.success) {
      res.status(400).json({ error: z.prettifyError(date.error) });
      return;
    }

    const deleted = await calendar.deleteAcademicDay(date.data);
    if (!deleted) {
      res.status(404).json({ error: 'No academic day on that date.' });
      return;
    }

    await audit(req, 'calendar.delete', date.data, null, null, '/api/');
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------- timetable

adminRouter.get('/slots', async (_req, res, next) => {
  try {
    res.json(await admin.getSlotDefinitions());
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/courses', async (req, res, next) => {
  try {
    const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (term.length < 2) {
      res.status(400).json({ error: 'Search for at least 2 characters.' });
      return;
    }
    res.json(await admin.searchOfferings(term));
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/courses/:offeringId', async (req, res, next) => {
  try {
    const offering = await admin.getOffering(req.params.offeringId);
    if (!offering) {
      res.status(404).json({ error: 'No such course offering.' });
      return;
    }
    res.json({ offering, meetings: await admin.getMeetings(req.params.offeringId) });
  } catch (error) {
    next(error);
  }
});

/** Previews what a slot expression expands to, before saving it. */
adminRouter.post('/slots/preview', async (req, res, next) => {
  try {
    const body = z.object({ expression: z.string().min(1).max(200) }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.prettifyError(body.error) });
      return;
    }
    const slots = await admin.getSlotDefinitions();
    res.json(admin.expandSlotExpression(body.data.expression, slots));
  } catch (error) {
    next(error);
  }
});

const meetingSchema = z.object({
  type: z.enum(['lecture', 'lab', 'tutorial']),
  day: z.enum(DAYS),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  room: z.string().max(120).nullable().optional(),
  instructors: z.array(z.string().max(160)).max(10).optional(),
  recurrence: z.enum(['weekly', 'biweekly_odd', 'biweekly_even', 'custom']).optional(),
});

const courseSlotBody = z.object({
  /** When given, meetings are derived from it unless `meetings` is also sent. */
  rawSlot: z.string().max(200).nullable().optional(),
  meetings: z.array(meetingSchema).max(40).optional(),
  room: z.string().max(120).optional(),
  instructors: z.array(z.string().max(160)).max(10).optional(),
});

/**
 * PUT /api/admin/courses/:offeringId/schedule
 *
 * Either send explicit `meetings`, or send a `rawSlot` expression and let the
 * server expand it against the slot table.
 */
adminRouter.put('/courses/:offeringId/schedule', async (req, res, next) => {
  try {
    const body = courseSlotBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.prettifyError(body.error) });
      return;
    }

    const offeringId = req.params.offeringId;
    const offering = await admin.getOffering(offeringId);
    if (!offering) {
      res.status(404).json({ error: 'No such course offering.' });
      return;
    }

    const before = await admin.getMeetings(offeringId);
    let meetings: admin.MeetingInput[] | undefined = body.data.meetings;

    if (!meetings) {
      if (!body.data.rawSlot) {
        res.status(400).json({ error: 'Provide either meetings or rawSlot.' });
        return;
      }

      const slots = await admin.getSlotDefinitions();
      const expanded = admin.expandSlotExpression(body.data.rawSlot, slots);
      if (expanded.meetings.length === 0) {
        res.status(400).json({
          error: 'That slot expression produced no meetings.',
          unknownSlots: expanded.unknown,
          notes: expanded.notes,
        });
        return;
      }

      // Inherit presentation details from what the course already had.
      const donor = before[0];
      meetings = expanded.meetings.map((m) => ({
        ...m,
        room: body.data.room ?? donor?.room ?? null,
        instructors: body.data.instructors ?? donor?.instructors ?? [],
      }));
    }

    await admin.replaceMeetings(offeringId, body.data.rawSlot ?? null, meetings);
    const after = await admin.getMeetings(offeringId);

    await audit(req, 'course.schedule.update', offeringId, before, after, '/api/timetable');
    // A course appears in several cached responses; clear the whole set.
    invalidate('/api/timetable');

    res.json({ offering: await admin.getOffering(offeringId), meetings: after });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------- ops

adminRouter.get('/audit', async (_req, res, next) => {
  try {
    res.json(await profiles.recentAudit());
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/cache/clear', async (req, res, next) => {
  try {
    const cleared = invalidate();
    await audit(req, 'cache.clear', 'all', null, { cleared });
    res.json({ cleared });
  } catch (error) {
    next(error);
  }
});
