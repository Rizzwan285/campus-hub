import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/adminAuth';
import * as mess from '../repositories/mess.repository';
import * as canteen from '../repositories/canteen.repository';
import * as calendar from '../repositories/calendar.repository';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const MEALS = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'] as const;

const menuEntryParams = z.object({
  messSlug: z.string().min(1),
  weekCycle: z.enum(['week13', 'week24', 'all']),
  day: z.enum(DAYS),
  meal: z.enum(MEALS),
});

const menuEntryBody = z
  .object({
    items: z.array(z.string().min(1)).optional(),
    veg: z.string().nullable().optional(),
    nonVeg: z.string().nullable().optional(),
  })
  .refine((body) => body.items !== undefined || body.veg !== undefined || body.nonVeg !== undefined, {
    message: 'Provide at least one of: items, veg, nonVeg.',
  });

/** PUT /api/admin/mess/:messSlug/:weekCycle/:day/:meal */
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
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

const timingBody = z.object({ timing: z.string().min(1) });

/** PUT /api/admin/mess-timings/:dayType/:meal */
adminRouter.put('/mess-timings/:dayType/:meal', async (req, res, next) => {
  try {
    const params = z
      .object({ dayType: z.enum(['weekday', 'weekend']), meal: z.enum(MEALS) })
      .safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: z.prettifyError(params.error) });
      return;
    }

    const body = timingBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.prettifyError(body.error) });
      return;
    }

    const updated = await mess.updateTiming(params.data.dayType, params.data.meal, body.data.timing);
    if (!updated) {
      res.status(404).json({ error: 'No matching timing row.' });
      return;
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

const canteenItemBody = z
  .object({
    name: z.string().min(1).optional(),
    price: z.number().nonnegative().nullable().optional(),
    variant: z.string().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Empty patch.' });

/** PATCH /api/admin/canteen/items/:id */
adminRouter.patch('/canteen/items/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid item id.' });
      return;
    }

    const body = canteenItemBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.prettifyError(body.error) });
      return;
    }

    const updated = await canteen.updateCanteenItem(id, body.data);
    if (!updated) {
      res.status(404).json({ error: 'No such canteen item.' });
      return;
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

const academicDayBody = z.object({
  name: z.string().min(1),
  kind: z.enum(['holiday', 'instructional']),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD.');

/** PUT /api/admin/academic-days/:date */
adminRouter.put('/academic-days/:date', async (req, res, next) => {
  try {
    const date = isoDate.safeParse(req.params.date);
    if (!date.success) {
      res.status(400).json({ error: z.prettifyError(date.error) });
      return;
    }

    const body = academicDayBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.prettifyError(body.error) });
      return;
    }

    res.json(await calendar.upsertAcademicDay(date.data, body.data.name, body.data.kind));
  } catch (error) {
    next(error);
  }
});

/** DELETE /api/admin/academic-days/:date */
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
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
