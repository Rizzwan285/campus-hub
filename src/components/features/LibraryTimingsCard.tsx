import { BookOpen, MapPin, Search } from 'lucide-react';
import { ExternalLinkRow, FeatureCard, FeatureCardHeader } from './FeatureCard';
import { Badge } from '@/components/ui/badge';
import { formatTimeUntil } from '@/utils/dateUtils';
import {
  libraries,
  getLibraryStatus,
  LIBRARY_DAYS_LABEL,
  LIBRARY_TIMINGS_LABEL,
} from '@/data/libraryData';

/** The library's online catalogue (Web OPAC). */
const LIBRARY_OPAC_URL = 'https://library.iitpkd.ac.in/';

interface LibraryTimingsCardProps {
  currentTime: Date;
}

export function LibraryTimingsCard({ currentTime }: LibraryTimingsCardProps) {
  const { open, changesAt } = getLibraryStatus(currentTime);

  return (
    <FeatureCard id="library-timings">
      <FeatureCardHeader
        icon={BookOpen}
        title="Library Timings"
        subtitle="Nila & Sahyadri libraries"
        aside={
          <Badge
            variant="outline"
            className={`shrink-0 ${
              open
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <span className="relative mr-1.5 flex h-2 w-2" aria-hidden="true">
              {open && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${open ? 'bg-emerald-500' : 'bg-muted-foreground/60'}`} />
            </span>
            {open ? 'Open now' : 'Closed'}
          </Badge>
        }
      />

      {/* Set like a timetable entry: the hours, and how long is left. */}
      <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border/60 bg-muted/30 mb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Hours</p>
          <p className="mt-1 font-semibold tabular-nums">{LIBRARY_TIMINGS_LABEL}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{LIBRARY_DAYS_LABEL}</p>
        </div>
        <div className="shrink-0 text-right pl-4 border-l border-border/60">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {open ? 'Closes in' : 'Opens in'}
          </p>
          <p className="mt-1 text-xl font-semibold leading-tight tabular-nums text-primary">
            {formatTimeUntil(changesAt, currentTime)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {libraries.map((library) => (
          <div
            key={library.name}
            className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <div className="min-w-0">
              <p className="font-medium text-sm">{library.name}</p>
              <p className="text-xs text-muted-foreground">{library.description}</p>
            </div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <MapPin className="h-3 w-3" />
              {library.campus}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <ExternalLinkRow
          href={LIBRARY_OPAC_URL}
          icon={Search}
          title="Library Web OPAC"
          description="Browse the catalogue, borrow and renew library books"
        />
      </div>
    </FeatureCard>
  );
}
