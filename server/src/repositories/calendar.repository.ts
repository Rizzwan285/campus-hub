import { query } from '../db';

export interface AcademicDaysResponse {
  /** Shape kept compatible with the old holidays2025 constant. */
  holidays: Array<{ date: string; occasion: string }>;
  /** Shape kept compatible with the old specialDays2025 constant. */
  specialDays: Array<{ date: string; type: string; note: string }>;
}

interface AcademicDayRow {
  date: string;
  name: string;
  kind: 'holiday' | 'instructional';
}

async function allDays(): Promise<AcademicDayRow[]> {
  return query<AcademicDayRow>(
    `select to_char(date, 'YYYY-MM-DD') as date, name, kind
       from academic_days
      order by date`,
  );
}

export async function getAcademicDays(): Promise<AcademicDaysResponse> {
  const rows = await allDays();

  return {
    holidays: rows
      .filter((row) => row.kind === 'holiday')
      .map((row) => ({ date: row.date, occasion: row.name })),
    specialDays: rows
      .filter((row) => row.kind === 'instructional')
      .map((row) => ({ date: row.date, type: 'instructional', note: row.name })),
  };
}

/** The timetable engine's Holiday[] shape: { date, name }. */
export async function getHolidays(): Promise<Array<{ date: string; name: string }>> {
  const rows = await allDays();
  return rows
    .filter((row) => row.kind === 'holiday')
    .map((row) => ({ date: row.date, name: row.name }));
}

export async function upsertAcademicDay(
  date: string,
  name: string,
  kind: 'holiday' | 'instructional',
): Promise<AcademicDayRow> {
  const rows = await query<AcademicDayRow>(
    `insert into academic_days (date, name, kind, source, customized_at)
     values ($1, $2, $3, 'admin', now())
     on conflict (date) do update
        set name = excluded.name, kind = excluded.kind,
            source = 'admin', customized_at = now()
     returning to_char(date, 'YYYY-MM-DD') as date, name, kind`,
    [date, name, kind],
  );

  return rows[0];
}

export async function deleteAcademicDay(date: string): Promise<boolean> {
  const rows = await query<{ date: string }>(
    `delete from academic_days where date = $1 returning to_char(date, 'YYYY-MM-DD') as date`,
    [date],
  );

  return rows.length > 0;
}
