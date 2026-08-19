import { query } from '../db';

export interface CanteenItem {
  id: number;
  name: string;
  price: number | null;
  variant?: string;
}

export interface CanteenSection {
  id: number;
  title: string;
  timing: string;
  startHour: number;
  endHour: number;
  items: CanteenItem[];
}

export async function getCanteenSections(): Promise<CanteenSection[]> {
  const [sections, items] = await Promise.all([
    query<{ id: number; title: string; timing: string; start_hour: number; end_hour: number }>(
      `select id, title, timing, start_hour, end_hour
         from canteen_sections
        order by sort_order`,
    ),
    query<{ id: number; section_id: number; name: string; price: number | null; variant: string | null }>(
      `select id, section_id, name, price, variant
         from canteen_items
        order by section_id, sort_order`,
    ),
  ]);

  const bySection = new Map<number, CanteenItem[]>();
  for (const item of items) {
    const list = bySection.get(item.section_id) ?? [];
    list.push({
      id: item.id,
      name: item.name,
      price: item.price,
      ...(item.variant ? { variant: item.variant } : {}),
    });
    bySection.set(item.section_id, list);
  }

  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    timing: section.timing,
    startHour: section.start_hour,
    endHour: section.end_hour,
    items: bySection.get(section.id) ?? [],
  }));
}

export async function updateCanteenItem(
  id: number,
  patch: { name?: string; price?: number | null; variant?: string | null },
): Promise<CanteenItem | null> {
  const rows = await query<{ id: number; name: string; price: number | null; variant: string | null }>(
    `update canteen_items
        set name    = coalesce($2, name),
            price   = case when $3::boolean then $4 else price end,
            variant = case when $5::boolean then $6 else variant end
      where id = $1
      returning id, name, price, variant`,
    [
      id,
      patch.name ?? null,
      patch.price !== undefined,
      patch.price ?? null,
      patch.variant !== undefined,
      patch.variant ?? null,
    ],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    price: row.price,
    ...(row.variant ? { variant: row.variant } : {}),
  };
}
