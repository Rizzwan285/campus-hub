import { CalendarDays, PartyPopper, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAcademicDays } from '@/hooks/useApiData';
import {
  formatDaysAway,
  groupHolidays,
  type HolidayEntry,
} from '@/lib/semesterHolidays';

interface HolidaysCardProps {
  /** The day being viewed, so a previewed date lists holidays from its term. */
  date: Date;
}

const weekdayOf = (entry: HolidayEntry) =>
  entry.at.toLocaleDateString('en-IN', { weekday: 'short' });

const dateOf = (entry: HolidayEntry) =>
  entry.at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function HolidayRow({ entry, isNext }: { entry: HolidayEntry; isNext: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        isNext
          ? 'bg-primary/10 border-primary/40'
          : entry.past
            ? 'bg-muted/30 border-transparent opacity-60'
            : 'bg-muted/50 border-transparent hover:bg-muted'
      }`}
    >
      <div
        className={`w-14 shrink-0 text-center rounded-md py-1 ${
          isNext ? 'bg-primary/15 text-primary' : 'bg-background/60'
        }`}
      >
        <p className="text-xs font-semibold leading-tight">{dateOf(entry)}</p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {weekdayOf(entry)}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${entry.past ? 'line-through' : ''}`}>
          {entry.occasion}
        </p>
        {/* A holiday on a weekend costs no teaching day — worth saying so. */}
        {entry.onWeekend && !entry.past && (
          <p className="text-xs text-muted-foreground">Falls on a {weekdayOf(entry) === 'Sun' ? 'Sunday' : 'Saturday'}</p>
        )}
      </div>

      {!entry.past && (
        <Badge
          variant={isNext ? 'default' : 'secondary'}
          className="shrink-0 text-[10px] font-medium"
        >
          {formatDaysAway(entry.daysAway)}
        </Badge>
      )}
    </div>
  );
}

export function HolidaysCard({ date }: HolidaysCardProps) {
  const { holidays } = useAcademicDays();
  const { semester, thisSemester, next, afterSemester } = groupHolidays(holidays, date);

  return (
    <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/8 rounded-xl">
          <CalendarDays className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Institute Holidays</h2>
          <p className="text-sm text-muted-foreground">This semester · {semester.label}</p>
        </div>
      </div>

      {next && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20 mb-4">
          <PartyPopper className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Next holiday</p>
            <p className="font-semibold truncate">{next.occasion}</p>
            <p className="text-xs text-muted-foreground">
              {next.at.toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}{' '}
              · {formatDaysAway(next.daysAway)}
            </p>
          </div>
        </div>
      )}

      {thisSemester.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No institute holidays listed for {semester.label}.
        </p>
      ) : (
        <div className="space-y-2">
          {thisSemester.map((entry) => (
            <HolidayRow key={entry.date} entry={entry} isNext={entry.date === next?.date} />
          ))}
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-border/50">
        <div className="flex items-center gap-2 mb-2">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Next holidays after this semester</h3>
        </div>
        {afterSemester.length > 0 ? (
          <div className="space-y-2">
            {afterSemester.map((entry) => (
              <HolidayRow key={entry.date} entry={entry} isNext={entry.date === next?.date} />
            ))}
          </div>
        ) : (
          // Says why it is empty rather than hiding: the institute publishes the
          // next year's gazetted list late, and a missing section reads as a bug.
          <p className="text-sm text-muted-foreground">
            They appear here as soon as the institute publishes the calendar for
            the next semester.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border/40">
        Gazetted institute holidays. Mess, bus and buggy schedules follow the
        Saturday / holiday timings on these days, and classes are not held.
      </p>
    </Card>
  );
}
