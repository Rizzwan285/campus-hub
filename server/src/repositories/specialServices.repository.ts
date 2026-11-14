import { query } from '../db';

/** Matches `SpecialService` in src/data/specialServiceData.ts. */
export interface SpecialService {
  id: number;
  title: string;
  note: string | null;
  /** YYYY-MM-DD, inclusive on both ends. */
  startDate: string;
  endDate: string;
  skipSundays: boolean;
  skipDates: string[];
  /** Display strings with AM/PM, e.g. "9:05 AM". */
  nilaToSahyadri: string[];
  sahyadriToNila: string[];
}

export type SpecialServiceInput = Omit<SpecialService, 'id'>;

// Dates are formatted in SQL: node-pg would otherwise hand back Date objects
// at local midnight, which serialise to the previous day once they pass
// through UTC.
const COLUMNS = `
  id,
  title,
  note,
  to_char(start_date, 'YYYY-MM-DD') as "startDate",
  to_char(end_date, 'YYYY-MM-DD')   as "endDate",
  skip_sundays as "skipSundays",
  coalesce(
    (select array_agg(to_char(d, 'YYYY-MM-DD') order by d) from unnest(skip_dates) as d),
    '{}'
  ) as "skipDates",
  nila_to_sahyadri as "nilaToSahyadri",
  sahyadri_to_nila as "sahyadriToNila"`;

/**
 * Every service, soonest first. Ended ones are included: the client decides
 * what runs on the date it is showing, and the admin list needs them to offer
 * a delete button.
 */
export async function listSpecialServices(): Promise<SpecialService[]> {
  return query<SpecialService>(
    `select ${COLUMNS} from bus_special_services order by start_date, id`,
  );
}

function values(input: SpecialServiceInput): unknown[] {
  return [
    input.title,
    input.note,
    input.startDate,
    input.endDate,
    input.skipSundays,
    input.skipDates,
    input.nilaToSahyadri,
    input.sahyadriToNila,
  ];
}

export async function createSpecialService(input: SpecialServiceInput): Promise<SpecialService> {
  const rows = await query<SpecialService>(
    `insert into bus_special_services
       (title, note, start_date, end_date, skip_sundays, skip_dates, nila_to_sahyadri, sahyadri_to_nila)
     values ($1, $2, $3, $4, $5, $6::date[], $7::text[], $8::text[])
     returning ${COLUMNS}`,
    values(input),
  );

  return rows[0];
}

export async function updateSpecialService(
  id: number,
  input: SpecialServiceInput,
): Promise<SpecialService | null> {
  const rows = await query<SpecialService>(
    `update bus_special_services
        set title = $1, note = $2, start_date = $3, end_date = $4, skip_sundays = $5,
            skip_dates = $6::date[], nila_to_sahyadri = $7::text[], sahyadri_to_nila = $8::text[],
            updated_at = now()
      where id = $9
      returning ${COLUMNS}`,
    [...values(input), id],
  );

  return rows[0] ?? null;
}

export async function deleteSpecialService(id: number): Promise<SpecialService | null> {
  const rows = await query<SpecialService>(
    `delete from bus_special_services where id = $1 returning ${COLUMNS}`,
    [id],
  );

  return rows[0] ?? null;
}
