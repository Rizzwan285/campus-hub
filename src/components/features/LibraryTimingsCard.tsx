import { BookOpen, Clock, ExternalLink, MapPin, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
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
    <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/8 rounded-xl">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Library Timings</h2>
            <p className="text-sm text-muted-foreground">Nila &amp; Sahyadri libraries</p>
          </div>
        </div>

        <Badge
          variant="outline"
          className={`shrink-0 ${
            open
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {open ? 'Open now' : 'Closed'}
        </Badge>
      </div>

      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-4 w-4 text-primary shrink-0" />
          <p className="font-semibold">{LIBRARY_TIMINGS_LABEL}</p>
        </div>
        <p className="text-xs text-muted-foreground">{LIBRARY_DAYS_LABEL}</p>
        <p className="text-sm mt-2">
          {open ? 'Closes in ' : 'Opens in '}
          <span className="font-semibold text-primary">
            {formatTimeUntil(changesAt, currentTime)}
          </span>
        </p>
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

      <a
        href={LIBRARY_OPAC_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center gap-3 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors"
      >
        <Search className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm">Library Web OPAC</h3>
          <p className="text-xs text-muted-foreground">Browse the catalogue, borrow and renew library books</p>
        </div>
        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
      </a>
    </Card>
  );
}
