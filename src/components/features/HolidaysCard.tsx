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
const month = (entry: HolidayEntry) => entry.at.toLocaleDateString('en-IN', { month: 'short' });
const weekday = (entry: HolidayEntry) => entry.at.toLocaleDateString('en-IN', { weekday: 'long' });

/** A little tear-off calendar page: month band, big day, and the year (the list crosses years). */
function CalendarTile({ entry, isNext }: { entry: HolidayEntry; isNext: boolean }) {
  return (
    <div
      className={`w-12 shrink-0 overflow-hidden rounded-lg border text-center shadow-sm bg-background ${
        isNext ? 'border-orange-500/50' : 'border-border/60'
      }`}
    >
      <p
        className={`text-[10px] font-bold uppercase tracking-wider leading-4 ${
          isNext
            ? 'bg-gradient-to-r from-orange-400 to-rose-500 text-white'
            : entry.past
              ? 'bg-muted text-muted-foreground'
              : 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
        }`}
      >
        {month(entry)}
      </p>
      <p className="text-lg font-bold leading-6 tabular-nums">{entry.at.getDate()}</p>
      <p className="text-[9px] font-medium leading-3 pb-0.5 text-muted-foreground tabular-nums">{entry.year}</p>
    </div>
  );
}

function HolidayRow({ entry, isNext }: { entry: HolidayEntry; isNext: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 p-2 rounded-xl border ${
        isNext
          ? 'bg-gradient-to-r from-orange-500/15 to-rose-500/5 border-orange-500/40'
          : entry.past
            ? 'bg-muted/20 border-transparent opacity-60'
            : 'bg-muted/40 border-transparent'
      }`}
    >
      <CalendarTile entry={entry} isNext={isNext} />

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium break-words ${entry.past ? 'line-through' : ''}`}>{entry.occasion}</p>
        <p className="text-xs text-muted-foreground">
          {weekday(entry)}
          {entry.past ? ' · past' : entry.onWeekend ? ' · weekend' : ''}
        </p>
      </div>

      {!entry.past && (
        <Badge
          variant="secondary"
          className={`shrink-0 text-[10px] font-medium ${isNext ? 'bg-gradient-to-r from-orange-400 to-rose-500 text-white border-transparent hover:from-orange-400' : ''}`}
        >
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
    <FeatureCard id="holiday-list" accent="orange">
      <FeatureCardHeader
        icon={CalendarDays}
        title="Institute holidays"
        subtitle={`Gazetted holidays${years.length ? ` · ${years[0]}${years.length > 1 ? `–${years[years.length - 1]}` : ''}` : ''}`}
      />

      {next ? (
        <>
          <div className="relative overflow-hidden flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-orange-500/20 via-rose-500/10 to-transparent border border-orange-500/30 mb-4">
            <div className="grid place-items-center h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-orange-400 to-rose-500 text-white shadow-md">
              <PartyPopper className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">Next holiday</p>
              <p className="font-semibold break-words leading-snug">{next.occasion}</p>
              <p className="text-xs text-muted-foreground">
                {next.at.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            {/* The countdown is the point of the banner, so it gets the big type. */}
            <div className="shrink-0 text-right">
              {next.daysAway > 1 ? (
                <>
                  <p className="text-3xl font-bold leading-none tabular-nums bg-gradient-to-br from-orange-500 to-rose-500 bg-clip-text text-transparent">
                    {next.daysAway}
                  </p>
                  <p className="text-[11px] font-medium text-muted-foreground mt-1">days to go</p>
                </>
              ) : (
                <p className="text-lg font-bold bg-gradient-to-br from-orange-500 to-rose-500 bg-clip-text text-transparent">
                  {formatDaysAway(next.daysAway)}
                </p>
              )}
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
