import { query } from '../db';

export interface MenuItem {
  meal: string;
  items: string[];
  veg?: string;
  nonVeg?: string;
}

export type WeekMenu = Record<string, Record<string, MenuItem[]>>;

export interface MessPayload {
  slug: string;
  name: string;
  caterer: string | null;
  hasWeekCycle: boolean;
  commonItems: Record<string, string>;
  menus: Record<string, WeekMenu>;
}

export interface MessResponse {
  messes: Record<string, MessPayload>;
  timings: Record<string, Record<string, string>>;
}

interface MessRow {
  id: number;
  slug: string;
  name: string;
  caterer: string | null;
  has_week_cycle: boolean;
}

interface MenuRow {
  mess_id: number;
  week_cycle: string;
  day_of_week: string;
  meal: string;
  items: string[];
  veg: string | null;
  non_veg: string | null;
}

/**
 * Returns every mess, its daily extras and its full menu, plus the shared
 * meal timings — the shape the dashboard needs in a single request.
 */
export async function getMessData(): Promise<MessResponse> {
  const [messRows, commonRows, menuRows, timingRows] = await Promise.all([
    query<MessRow>('select id, slug, name, caterer, has_week_cycle from messes order by sort_order'),
    query<{ mess_id: number; meal: string; items: string }>(
      'select mess_id, meal, items from mess_common_items',
    ),
    query<MenuRow>(
      `select mess_id, week_cycle, day_of_week, meal, items, veg, non_veg
       from mess_menu_entries`,
    ),
    query<{ day_type: string; meal: string; timing: string }>(
      'select day_type, meal, timing from mess_timings order by day_type, sort_order',
    ),
  ]);

  const messes: Record<string, MessPayload> = {};
  const byId = new Map<number, MessPayload>();

  for (const row of messRows) {
    const payload: MessPayload = {
      slug: row.slug,
      name: row.name,
      caterer: row.caterer,
      hasWeekCycle: row.has_week_cycle,
      commonItems: {},
      menus: {},
    };
    messes[row.slug] = payload;
    byId.set(row.id, payload);
  }

  for (const row of commonRows) {
    const mess = byId.get(row.mess_id);
    if (mess) mess.commonItems[row.meal] = row.items;
  }

  for (const row of menuRows) {
    const mess = byId.get(row.mess_id);
    if (!mess) continue;

    const cycle = (mess.menus[row.week_cycle] ??= {});
    const day = (cycle[row.day_of_week] ??= {});
    (day[row.meal] ??= []).push({
      meal: row.meal,
      items: row.items ?? [],
      ...(row.veg ? { veg: row.veg } : {}),
      ...(row.non_veg ? { nonVeg: row.non_veg } : {}),
    });
  }

  const timings: Record<string, Record<string, string>> = {};
  for (const row of timingRows) {
    (timings[row.day_type] ??= {})[row.meal.toLowerCase()] = row.timing;
  }

  return { messes, timings };
}

export async function updateMenuEntry(
  messSlug: string,
  weekCycle: string,
  day: string,
  meal: string,
  patch: { items?: string[]; veg?: string | null; nonVeg?: string | null },
): Promise<MenuRow | null> {
  const rows = await query<MenuRow>(
    `update mess_menu_entries as m
        set items   = coalesce($5, m.items),
            veg     = case when $6::boolean then $7 else m.veg end,
            non_veg = case when $8::boolean then $9 else m.non_veg end,
            -- Marks the row as hand-edited so a reseed will not overwrite it.
            source        = 'admin',
            customized_at = now()
       from messes
      where messes.id = m.mess_id
        and messes.slug = $1
        and m.week_cycle = $2
        and m.day_of_week = $3
        and m.meal = $4
      returning m.mess_id, m.week_cycle, m.day_of_week, m.meal, m.items, m.veg, m.non_veg`,
    [
      messSlug,
      weekCycle,
      day,
      meal,
      patch.items ?? null,
      patch.veg !== undefined,
      patch.veg ?? null,
      patch.nonVeg !== undefined,
      patch.nonVeg ?? null,
    ],
  );

  return rows[0] ?? null;
}

export async function updateTiming(
  dayType: string,
  meal: string,
  timing: string,
): Promise<{ day_type: string; meal: string; timing: string } | null> {
  const rows = await query<{ day_type: string; meal: string; timing: string }>(
    `update mess_timings
        set timing = $3, source = 'admin', customized_at = now()
      where day_type = $1 and meal = $2
      returning day_type, meal, timing`,
    [dayType, meal, timing],
  );

  return rows[0] ?? null;
}
