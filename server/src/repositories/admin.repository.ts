import { pool, query } from '../db';

export type MeetingDay =
  | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface MeetingInput {
  type: 'lecture' | 'lab' | 'tutorial';
  day: MeetingDay;
  startTime: string;
  endTime: string;
  room?: string | null;
  instructors?: string[];
  recurrence?: string;
}

export interface SlotDefinition {
  code: string;
  type: string;
  timings: Array<{ day: string; startTime: string; endTime: string }>;
}

/**
 * Slot definitions live in the frontend's slots.json rather than the database,
 * so the admin UI reads them from here after the seed loads them into metadata.
 */
export async function getSlotDefinitions(): Promise<SlotDefinition[]> {
  const rows = await query<{ value: unknown }>(
    "select value from timetable_metadata where key = 'slots'",
  );
  const raw = (rows[0]?.value ?? {}) as Record<string, {
    type: string;
    timings: Array<{ day: string; startTime: string; endTime: string }>;
  }>;

  return Object.entries(raw)
    .map(([code, def]) => ({ code, type: def.type, timings: def.timings }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function getOffering(offeringId: string) {
  const rows = await query<{
    id: string; program: string; branch: string; course_code: string;
    course_name: string; credits: string | null; category: string | null;
    raw_slot: string | null;
  }>(
    `select id, program, branch, course_code, course_name, credits, category, raw_slot
       from course_offerings where id = $1`,
    [offeringId],
  );
  return rows[0] ?? null;
}

export async function getMeetings(offeringId: string) {
  return query<{
    type: string; day: string; start_time: string; end_time: string;
    room: string | null; instructors: string[]; recurrence: string;
  }>(
    `select type, day,
            to_char(start_time, 'HH24:MI') as start_time,
            to_char(end_time,   'HH24:MI') as end_time,
            room, instructors, recurrence
       from course_meetings where offering_id = $1 order by sort_order`,
    [offeringId],
  );
}

/**
 * Replaces a course's meetings wholesale, inside a transaction so a failure
 * cannot leave a course with no schedule at all.
 */
export async function replaceMeetings(
  offeringId: string,
  rawSlot: string | null,
  meetings: MeetingInput[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');

    if (rawSlot !== null) {
      await client.query('update course_offerings set raw_slot = $2 where id = $1', [
        offeringId,
        rawSlot,
      ]);
    }

    await client.query('delete from course_meetings where offering_id = $1', [offeringId]);

    for (const [index, meeting] of meetings.entries()) {
      await client.query(
        `insert into course_meetings
           (offering_id, type, day, start_time, end_time, room, instructors, recurrence, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          offeringId,
          meeting.type,
          meeting.day,
          meeting.startTime,
          meeting.endTime,
          meeting.room ?? null,
          meeting.instructors ?? [],
          meeting.recurrence ?? 'weekly',
          index,
        ],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Expands a slot expression such as "D [Mon,Wed] + PA5" into meetings. */
export function expandSlotExpression(
  expression: string,
  slots: SlotDefinition[],
): { meetings: Omit<MeetingInput, 'room' | 'instructors'>[]; notes: string[]; unknown: string[] } {
  const byCode = new Map(slots.map((s) => [s.code.toUpperCase(), s]));
  const DAYS: Record<string, string> = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
    thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
  };

  // Split on + and , outside brackets, so "[Mon,Wed]" survives intact.
  const tokens: string[] = [];
  let buffer = '';
  let depth = 0;
  for (const ch of expression) {
    if (ch === '[' || ch === '(') depth += 1;
    else if (ch === ']' || ch === ')') depth = Math.max(0, depth - 1);

    if ((ch === '+' || ch === ',') && depth === 0) {
      tokens.push(buffer);
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  tokens.push(buffer);

  const meetings: Omit<MeetingInput, 'room' | 'instructors'>[] = [];
  const notes: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens.map((t) => t.trim()).filter(Boolean)) {
    const match = token.match(/^([A-Za-z0-9-]+)\s*(?:[[(]([^\])]*)[\])])?$/);
    if (!match) {
      notes.push(token);
      continue;
    }

    const slot = byCode.get(match[1].toUpperCase());
    if (!slot) {
      unknown.push(match[1]);
      continue;
    }

    let allowed: Set<string> | null = null;
    if (match[2]?.trim()) {
      const parsed = match[2]
        .split(/[+,]/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
        .map((part) => (/^[a-z]+$/.test(part) ? DAYS[part.slice(0, 3)] : undefined));

      if (parsed.every(Boolean) && parsed.length > 0) {
        allowed = new Set(parsed as string[]);
      } else {
        // Free text such as "Tue swapped to Thu" — keep the slot whole.
        notes.push(match[2].trim());
      }
    }

    for (const timing of slot.timings) {
      if (allowed && !allowed.has(timing.day)) continue;

      const key = `${slot.type}|${timing.day}|${timing.startTime}`;
      if (seen.has(key)) continue;
      seen.add(key);

      meetings.push({
        type: slot.type as MeetingInput['type'],
        day: timing.day as MeetingDay,
        startTime: timing.startTime,
        endTime: timing.endTime,
      });
    }
  }

  return { meetings, notes, unknown };
}

export async function searchOfferings(term: string, limit = 25) {
  return query<{
    id: string; course_code: string; course_name: string;
    program: string; branch: string; raw_slot: string | null;
  }>(
    `select id, course_code, course_name, program, branch, raw_slot
       from course_offerings
      where course_code ilike $1 or course_name ilike $1
      order by course_code
      limit $2`,
    [`%${term}%`, limit],
  );
}
