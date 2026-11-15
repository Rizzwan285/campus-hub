import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, ChevronDown, Loader2, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { isApiConfigured } from '@/services/api';
import { TimetableLoader, type SemesterInfo } from '@/services/timetableLoader';
import { compareMeetings } from '@/engine/courseTimings';
import type { CourseOffering } from '@/engine/types';

const summary = (course: CourseOffering) =>
  [...course.meetings]
    .sort(compareMeetings)
    .map((meeting) => `${meeting.day.slice(0, 3)} ${meeting.startTime}`)
    .join(', ') || 'No class times';

/**
 * A look at a semester that has been published but has not started.
 *
 * Read-only: browsing it changes nothing in the student's timetable or course
 * selection, which stay on the current semester until the developer makes the
 * new one current. Renders nothing when no semester is upcoming.
 */
export function UpcomingSemesterCard() {
  const { data: semesters } = useQuery({
    queryKey: ['timetable-semesters'],
    queryFn: () => TimetableLoader.listSemesters(),
    enabled: isApiConfigured(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const upcoming = (semesters ?? []).filter((semester) => semester.status === 'published');
  if (upcoming.length === 0) return null;

  return (
    <div className="space-y-3 mt-4">
      {upcoming.map((semester) => (
        <UpcomingSemester key={semester.code} semester={semester} />
      ))}
    </div>
  );
}

function UpcomingSemester({ semester }: { semester: SemesterInfo }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['timetable-upcoming', semester.code, semester.version],
    queryFn: () => TimetableLoader.loadUpcoming(semester.code),
    enabled: open,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const courses = useMemo(() => {
    const needle = term.trim().toLowerCase();
    // One line per course code: several branches often list the same course.
    const seen = new Map<string, CourseOffering>();
    for (const course of data?.courses ?? []) {
      const current = seen.get(course.courseCode);
      if (!current || course.meetings.length > current.meetings.length) seen.set(course.courseCode, course);
    }
    return [...seen.values()]
      .filter((course) => !needle || `${course.courseCode} ${course.courseName}`.toLowerCase().includes(needle))
      .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  }, [data, term]);

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <CalendarPlus className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Coming up: {semester.name}</p>
            <p className="text-xs text-muted-foreground">
              Its courses are out. Your timetable stays on the current semester until the new one starts.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)} className="rounded-lg">
          {open ? 'Hide' : 'Browse courses'}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : isError ? (
            <p className="text-sm text-muted-foreground">Could not load the courses right now. Try again in a minute.</p>
          ) : (
            <>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder={`Search ${data?.courses.length ? `${courses.length} courses` : 'courses'}…`}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-sm"
                />
              </div>
              <ul className="divide-y divide-border/50 max-h-80 overflow-y-auto">
                {courses.map((course) => (
                  <li key={course.courseCode} className="py-2 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold">{course.courseCode}</span>
                    <span className="text-sm text-muted-foreground min-w-0 truncate">{course.courseName}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{summary(course)}</span>
                  </li>
                ))}
                {courses.length === 0 && <li className="py-3 text-sm text-muted-foreground">No courses match.</li>}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
