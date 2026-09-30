import { Router } from 'express';
import { z } from 'zod';
import { requireSession } from '../middleware/auth';
import * as changes from '../repositories/courseChanges.repository';
import { meetingListSchema } from './schemas';

/**
 * Students suggesting a correction to a course's official timings.
 *
 * Nothing here changes anyone's timetable: a suggestion waits until the
 * developer approves it under /api/admin/course-changes.
 */
export const courseChangesRouter = Router();

courseChangesRouter.use(requireSession);

/** GET /api/course-changes/mine — the signed-in student's suggestions, newest first. */
courseChangesRouter.get('/mine', async (req, res, next) => {
  try {
    res.json(await changes.listRequestsByUser(req.session!.sub));
  } catch (error) {
    next(error);
  }
});

const suggestionBody = z.object({
  courseCode: z.string().trim().min(2).max(20),
  meetings: meetingListSchema.min(
    1,
    'Keep at least one class. To drop a course, remove it from your selection instead.',
  ),
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/course-changes
 *
 * The complete list of meetings the student says the course now has. The
 * current official list is snapshotted alongside it, so the review can show
 * exactly what would change.
 */
courseChangesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = suggestionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: z.prettifyError(parsed.error) });
      return;
    }

    const { courseCode, meetings, note } = parsed.data;
    const official = (await changes.getOfficialSchedules([courseCode])).get(courseCode);
    if (!official) {
      res.status(404).json({ error: `${courseCode} is not in the timetable.` });
      return;
    }
    if (changes.sameMeetings(meetings, official.meetings)) {
      res.status(400).json({ error: 'Those are already the official timings, so there is nothing to suggest.' });
      return;
    }

    const saved = await changes.submitRequest({
      userId: req.session!.sub,
      roll: req.session!.roll,
      courseCode,
      courseName: official.courseName,
      note: note || null,
      baseMeetings: official.meetings,
      proposedMeetings: meetings,
    });
    if (saved === 'too-many') {
      res.status(429).json({
        error: `You already have ${changes.MAX_OPEN_REQUESTS} suggestions waiting for review. Wait for a decision on those first.`,
      });
      return;
    }

    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

/** DELETE /api/course-changes/:id — withdraws the student's own suggestion while it waits. */
courseChangesRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid suggestion id.' });
      return;
    }

    const withdrawn = await changes.withdrawRequest(id, req.session!.sub);
    if (!withdrawn) {
      res.status(404).json({ error: 'No open suggestion of yours with that id.' });
      return;
    }

    res.json(withdrawn);
  } catch (error) {
    next(error);
  }
});
