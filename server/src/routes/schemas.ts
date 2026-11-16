import { z } from 'zod';
import { weekdayOfDate } from '../../../src/engine/courseTimings';

export const WEEKDAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

// 24-hour and zero-padded, so two times also compare correctly as strings.
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One class, in the shape the timetable API serves and the client edits:
 * students' own corrections, their requests, the developer's approvals and
 * the semester editor all pass through here.
 */
export const timetableMeetingSchema = z
  .object({
    type: z.enum(['lecture', 'lab', 'tutorial']),
    day: z.enum(WEEKDAYS),
    startTime: z.string().regex(CLOCK_TIME, 'Use 24-hour HH:MM.'),
    endTime: z.string().regex(CLOCK_TIME, 'Use 24-hour HH:MM.'),
    room: z.string().trim().max(120).default(''),
    instructors: z.array(z.string().max(160)).max(10).default([]),
    recurrence: z
      .object({ type: z.enum(['weekly', 'biweekly_odd', 'biweekly_even', 'custom', 'once']) })
      .default({ type: 'weekly' }),
    slot: z.string().trim().max(12).optional(),
    batches: z.string().trim().max(60).optional(),
    /** The date of a one-time class. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  })
  // course_meetings has the same check; failing here gives a 400 instead of a 500.
  .refine((meeting) => meeting.endTime > meeting.startTime, {
    message: 'A class must end after it starts.',
    path: ['endTime'],
  })
  .refine((meeting) => meeting.recurrence.type !== 'once' || (meeting.date && weekdayOfDate(meeting.date) !== null), {
    message: 'A one-time class needs a real date.',
    path: ['date'],
  })
  .transform((meeting) => {
    // The weekday of a dated class is a fact about the date, not a second input.
    const { slot, batches, date, ...rest } = meeting;
    const once = meeting.recurrence.type === 'once';
    return {
      ...rest,
      day: once && date ? weekdayOfDate(date)! : meeting.day,
      ...(slot ? { slot } : {}),
      ...(batches ? { batches } : {}),
      ...(once && date ? { date } : {}),
    };
  });

export const meetingListSchema = z.array(timetableMeetingSchema).max(60);
