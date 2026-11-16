import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronsDown, PartyPopper } from 'lucide-react';
import { FeatureCard, FeatureCardHeader } from './FeatureCard';
import { Badge } from '@/components/ui/badge';
import { useAcademicDays } from '@/hooks/useApiData';
import { formatDaysAway, holidayWindow, type HolidayEntry } from '@/lib/holidayList';

interface HolidaysCardProps {
  /** The campus date being viewed: today, or the day previewed in the header. */
  date: Date;
}

/** The list is exactly this many rows tall; the rest is a scroll away. */
const VISIBLE_ROWS = 5;

const keyOf = (entry: HolidayEntry) => `${entry.date}|${entry.occasion}`;
const dayMonth = (entry: HolidayEntry) => entry.at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const weekday = (entry: HolidayEntry) => entry.at.toLocaleDateString('en-IN', { weekday: 'long' });

function HolidayRow({ entry, isNext }: { entry: HolidayEntry; isNext: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 p-2.5 rounded-lg border ${
        isNext
          ? 'bg-primary/10 border-primary/40'
          : entry.past
            ? 'bg-muted/30 border-transparent opacity-60'
            : 'bg-muted/50 border-transparent'
      }`}
    >
      {/* The list runs across a new year, so every row carries its year. */}
      <div className={`w-14 shrink-0 text-center rounded-md py-1 ${isNext ? 'bg-primary/15 text-primary' : 'bg-background/60'}`}>
        <p className="text-xs font-semibold leading-tight">{dayMonth(entry)}</p>
        <p className="text-[11px] font-medium text-muted-foreground tabular-nums">{entry.year}</p>
      </div>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium break-words ${entry.past ? 'line-through' : ''}`}>{entry.occasion}</p>
        <p className="text-xs text-muted-foreground">
          {weekday(entry)}
          {entry.past ? ' · past' : entry.onWeekend ? ' · weekend' : ''}
        </p>
      </div>

      {!entry.past && (
        <Badge variant={isNext ? 'default' : 'secondary'} className="shrink-0 text-[10px] font-medium">
          {formatDaysAway(entry.daysAway)}
        </Badge>
      )}
    </li>
  );
}

/**
 * The holidays in a box exactly VISIBLE_ROWS rows tall that scrolls by touch,
 * wheel or keyboard. Rows can wrap to two lines on a phone, so the height is
 * measured from the rows themselves rather than assumed. Scroll chaining is
 * left on, so reaching either end hands the gesture back to the page.
 */
function HolidayScroller({ rows, nextIndex }: { rows: HolidayEntry[]; nextIndex: number }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [maxHeight, setMaxHeight] = useState<number>();
  const overflows = rows.length > VISIBLE_ROWS;

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const list = listRef.current;
    if (!scroller || !list) return;
    const measure = () => {
      if (list.children.length <= VISIBLE_ROWS) {
        setMaxHeight(undefined); // Fewer rows: the box shrinks to fit, no blank rows.
        return;
      }
      // offsetTop counts from inside the top border and includes the top padding.
      const last = list.children[VISIBLE_ROWS - 1] as HTMLElement;
      const style = getComputedStyle(scroller);
      const px = (value: string) => parseFloat(value) || 0;
      const frame = px(style.paddingBottom) + px(style.borderTopWidth) + px(style.borderBottomWidth);
      setMaxHeight(Math.ceil(last.offsetTop + last.offsetHeight + frame));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [rows.length]);

  // Opens on the two past holidays, the next one and the two after it.
  const firstKey = rows[0] ? keyOf(rows[0]) : '';
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [firstKey]);

  return (
    <div>
      <div
        ref={scrollerRef}
        role="region"
        aria-label={overflows ? `Holidays, ${rows.length} listed; scroll for more` : 'Holidays'}
        tabIndex={overflows ? 0 : undefined}
        style={{ maxHeight }}
        className="relative overflow-y-auto rounded-xl border border-border/50 p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <ol ref={listRef} className="space-y-1.5">
          {rows.map((entry, index) => (
            <HolidayRow key={keyOf(entry)} entry={entry} isNext={index === nextIndex} />
          ))}
        </ol>
      </div>
      {overflows && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
          <ChevronsDown className="h-3.5 w-3.5" aria-hidden="true" />
          Scroll the list for {rows.length - VISIBLE_ROWS} more
        </p>
      )}
    </div>
  );
}

export function HolidaysCard({ date }: HolidaysCardProps) {
  const { holidays } = useAcademicDays();
  const { rows, next, nextIndex } = holidayWindow(holidays, date);
  const years = [...new Set(rows.map((entry) => entry.year))];
  const tentativeShown = rows.some((entry) => entry.tentative && !entry.past);

  return (
    <FeatureCard id="holiday-list">
      <FeatureCardHeader
        icon={CalendarDays}
        title="Institute holidays"
        subtitle={`Gazetted holidays${years.length ? ` · ${years[0]}${years.length > 1 ? `–${years[years.length - 1]}` : ''}` : ''}`}
      />

      {next ? (
        <>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20 mb-4">
            <PartyPopper className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Next holiday</p>
              <p className="font-semibold break-words">{next.occasion}</p>
              <p className="text-xs text-muted-foreground">
                {next.at.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}
                {formatDaysAway(next.daysAway)}
              </p>
            </div>
          </div>
          <HolidayScroller rows={rows} nextIndex={nextIndex} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground py-4">
          No upcoming holidays are listed yet. They appear here once the institute publishes the next holiday list.
        </p>
      )}

      <div className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border/40 space-y-1">
        {tentativeShown && <p>* The date depends on the sighting of the moon and may change.</p>}
        <p>
          Mess, bus and buggy schedules follow the Saturday / holiday timings on these days, and classes are not held.
        </p>
      </div>
    </FeatureCard>
  );
}
