import { z } from 'zod';

export const WEEKDAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

// 24-hour and zero-padded, so two times also compare correctly as strings.
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One class, in the shape the timetable API serves and the client edits:
 * students' own corrections, their suggestions, and the developer's approvals
 * all pass through here.
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
      .object({ type: z.enum(['weekly', 'biweekly_odd', 'biweekly_even', 'custom']) })
      .default({ type: 'weekly' }),
  })
  // course_meetings has the same check; failing here gives a 400 instead of a 500.
  .refine((meeting) => meeting.endTime > meeting.startTime, {
    message: 'A class must end after it starts.',
    path: ['endTime'],
  });

export const meetingListSchema = z.array(timetableMeetingSchema).max(40);
