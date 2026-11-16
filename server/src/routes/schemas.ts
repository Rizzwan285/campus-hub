import { z } from 'zod';
import { weekdayOfDate } from '../../../src/engine/courseTimings';
import { MAX_LINK_LENGTH, MAX_PHONE_LENGTH, dialableNumber, isHttpsLink } from '../../../src/lib/contactPhone';

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

// ---------------------------------------------------------------- contacts

/**
 * The messages of a failed parse, once each, without paths or symbols — for
 * forms where the developer reads the reply as a sentence.
 */
export function plainError(error: z.ZodError): string {
  return [...new Set(error.issues.map((issue) => issue.message))].join(' ');
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} can be at most ${max} characters.`)
    .nullable()
    .optional()
    .transform((value) => value || null);

export const contactCategoryBody = z.object({
  name: z
    .string({ error: 'Enter a name for the category.' })
    .trim()
    .min(1, 'Enter a name for the category.')
    .max(60, 'A category name can be at most 60 characters.'),
});

export const contactBody = z.object({
  categoryId: z.number({ error: 'Choose a category.' }).int().positive('Choose a category.'),
  name: z
    .string({ error: 'Enter a name.' })
    .trim()
    .min(1, 'Enter a name.')
    .max(80, 'A name can be at most 80 characters.'),
  phones: z
    .array(z.string().trim(), { error: 'Add at least one phone number.' })
    .transform((phones) => phones.filter(Boolean))
    .superRefine((phones, ctx) => {
      if (phones.length === 0) ctx.addIssue({ code: 'custom', message: 'Add at least one phone number.' });
      if (phones.length > 5) ctx.addIssue({ code: 'custom', message: 'A contact can have at most five numbers.' });
      const seen = new Set<string>();
      for (const phone of phones) {
        const dialable = dialableNumber(phone);
        if (!dialable) {
          ctx.addIssue({
            code: 'custom',
            message: `“${phone.slice(0, MAX_PHONE_LENGTH)}” does not look like a phone number. Use a 10-digit number, or include the country code (+91…).`,
          });
        } else if (seen.has(dialable)) {
          ctx.addIssue({ code: 'custom', message: `${phone} is listed twice.` });
        } else {
          seen.add(dialable);
        }
      }
    }),
  location: optionalText(160, 'A location'),
  link: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value || null)
    .refine((value) => value === null || isHttpsLink(value), {
      message: `A link must be a full address starting with https:// (at most ${MAX_LINK_LENGTH} characters).`,
    }),
  note: optionalText(200, 'A note'),
});

/** A new order for a list: every id in it, once, first to last. */
export const contactOrderBody = z.object({
  ids: z
    .array(z.number().int().positive(), { error: 'Send the new order as a list of ids.' })
    .min(1, 'Send the new order as a list of ids.')
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Each item can appear only once.' }),
});
