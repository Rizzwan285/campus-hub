import { Router } from 'express';
import * as mess from '../repositories/mess.repository';
import * as bus from '../repositories/bus.repository';
import * as canteen from '../repositories/canteen.repository';
import * as calendar from '../repositories/calendar.repository';
import * as timetable from '../repositories/timetable.repository';
import * as specials from '../repositories/specialServices.repository';
import * as semesters from '../repositories/semesters.repository';

export const contentRouter = Router();

/** Everything the dashboard's food cards need in one round trip. */
contentRouter.get('/mess', async (_req, res, next) => {
  try {
    res.json(await mess.getMessData());
  } catch (error) {
    next(error);
  }
});

contentRouter.get('/bus', async (_req, res, next) => {
  try {
    res.json(await bus.getBusSchedules());
  } catch (error) {
    next(error);
  }
});

contentRouter.get('/bus/:dayType', async (req, res, next) => {
  try {
    const schedule = await bus.getBusSchedule(req.params.dayType);
    if (!schedule) {
      res.status(404).json({ error: `Unknown day type '${req.params.dayType}'.` });
      return;
    }
    res.json(schedule);
  } catch (error) {
    next(error);
  }
});

/**
 * Next departures, e.g. /bus/weekday/upcoming?direction=nila_to_sahyadri&after=13:45
 * `after` defaults to the current time in IST.
 */
contentRouter.get('/bus/:dayType/upcoming', async (req, res, next) => {
  try {
    const direction = req.query.direction === 'sahyadri_to_nila' ? 'sahyadri_to_nila' : 'nila_to_sahyadri';

    let afterMinutes: number;
    const after = typeof req.query.after === 'string' ? req.query.after : '';
    const match = after.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      afterMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    } else {
      const now = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata',
      });
      const [h, m] = now.split(':').map(Number);
      afterMinutes = h * 60 + m;
    }

    const limit = Math.min(parseInt(String(req.query.limit ?? '5'), 10) || 5, 50);
    res.json(await bus.getUpcomingDepartures(req.params.dayType, direction, afterMinutes, limit));
  } catch (error) {
    next(error);
  }
});

/**
 * Temporary bus services (exam shuttles and the like).
 *
 * Errors are passed on untouched, including the undefined-table one from a
 * database migration 011 has not reached yet. Answering `[]` there would tell
 * the client "no services", and the client trusts an empty list over its
 * bundled copy; a failure makes it fall back to that copy instead.
 */
contentRouter.get('/special-services', async (_req, res, next) => {
  try {
    res.json(await specials.listSpecialServices());
  } catch (error) {
    next(error);
  }
});

contentRouter.get('/canteen', async (_req, res, next) => {
  try {
    res.json(await canteen.getCanteenSections());
  } catch (error) {
    next(error);
  }
});

contentRouter.get('/academic-days', async (_req, res, next) => {
  try {
    res.json(await calendar.getAcademicDays());
  } catch (error) {
    next(error);
  }
});

contentRouter.get('/holidays', async (_req, res, next) => {
  try {
    res.json(await calendar.getHolidays());
  } catch (error) {
    next(error);
  }
});

contentRouter.get('/timetable/branches', async (_req, res, next) => {
  try {
    res.json(await timetable.getBranches());
  } catch (error) {
    next(error);
  }
});

contentRouter.get('/timetable/metadata', async (_req, res, next) => {
  try {
    res.json(await timetable.getMetadata());
  } catch (error) {
    next(error);
  }
});

/** The current semester and any published ahead of it. */
contentRouter.get('/timetable/semesters', async (_req, res, next) => {
  try {
    res.json(await semesters.listPublicSemesters());
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/timetable/snapshot[?semester=<code>]
 *
 * One published semester, whole: which semester and version it is, its slot
 * table and rules, and every course. The client keeps the last snapshot it
 * received, so a published semester survives an API outage without the app
 * having to be rebuilt - and because the snapshot names its semester, a
 * client that cannot reach the API can tell stale data from current.
 *
 * Without `semester` this is the current one. Drafts are never served.
 */
contentRouter.get('/timetable/snapshot', async (req, res, next) => {
  try {
    const code = typeof req.query.semester === 'string' ? req.query.semester : null;
    const semester = code ? await semesters.getSemesterByCode(code) : await semesters.getActiveSemester();
    if (!semester || (semester.status !== 'active' && semester.status !== 'published')) {
      res.status(404).json({ error: code ? `No published semester "${code}".` : 'No semester is current yet.' });
      return;
    }
    res.json({
      semester: semesters.toPublicSemester(semester),
      slots: semester.slotDefinitions,
      config: semester.config,
      courses: await timetable.getAllCourses(semester.id),
    });
  } catch (error) {
    next(error);
  }
});

contentRouter.get('/timetable/courses', async (_req, res, next) => {
  try {
    res.json(await timetable.getAllCourses());
  } catch (error) {
    next(error);
  }
});

contentRouter.get('/timetable/venue-overrides', async (_req, res, next) => {
  try {
    res.json(await timetable.getVenueOverrides());
  } catch (error) {
    next(error);
  }
});

contentRouter.get('/timetable/:program/:branch', async (req, res, next) => {
  try {
    const program = req.params.program.toUpperCase();
    if (program !== 'UG' && program !== 'PG') {
      res.status(400).json({ error: "Program must be 'UG' or 'PG'." });
      return;
    }

    const courses = await timetable.getCoursesByBranch(program, req.params.branch);
    if (courses.length === 0) {
      res.status(404).json({ error: `No courses found for ${program}/${req.params.branch}.` });
      return;
    }
    res.json(courses);
  } catch (error) {
    next(error);
  }
});
