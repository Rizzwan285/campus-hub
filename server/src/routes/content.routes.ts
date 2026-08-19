import { Router } from 'express';
import * as mess from '../repositories/mess.repository';
import * as bus from '../repositories/bus.repository';
import * as canteen from '../repositories/canteen.repository';
import * as calendar from '../repositories/calendar.repository';
import * as timetable from '../repositories/timetable.repository';

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
