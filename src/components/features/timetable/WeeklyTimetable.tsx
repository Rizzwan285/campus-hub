import { useState } from 'react';
import { useTimetableStore } from '@/store/useTimetableStore';
import { useUserStore } from '@/store/useUserStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Calendar, PencilLine } from 'lucide-react';
import { overrideStatus } from '@/engine/courseTimings';
import { WeeklyGrid } from './WeeklyGrid';
import { CollisionBanner } from './CollisionBanner';
import { CourseSelector } from './CourseSelector';
import { CourseTimingsEditor } from './CourseTimingsEditor';
import { TimetableDownload } from './TimetableDownload';

export function WeeklyTimetable() {
  const {
    resolvedEvents,
    collisions,
    isLoading,
    error,
    selectedCourseIds,
    previewDate,
    loadedCourses,
    courseOverrides,
    coursesAuthoritative,
    keepCourseOverride,
    removeCourseOverride,
    semester,
    timetableSource,
    timetableOutdated,
    snapshotSavedAt,
    refreshCourses
  } = useTimetableStore();

  const profile = useUserStore(state => state.profile);
  const isFirstYearUG = profile?.program === 'UG' && profile?.yearOfStudy === '1';

  // `session` remounts the editor on every open, so it starts from what the
  // timetable shows at that moment rather than from a stale draft.
  const [editor, setEditor] = useState({ open: false, courseCode: null as string | null, session: 0 });
  const openEditor = (courseCode: string | null) =>
    setEditor(current => ({ open: true, courseCode, session: current.session + 1 }));

  // Students whose own timings were overtaken by a change to the official ones.
  const superseded = loadedCourses.filter(course => {
    const own = courseOverrides[course.courseCode];
    return (
      own !== undefined &&
      selectedCourseIds.includes(course.courseCode) &&
      overrideStatus(own, course.meetings, coursesAuthoritative) === 'superseded'
    );
  });

  if (isLoading) {
    return (
      <Card className="w-full h-[600px] flex flex-col items-center justify-center bg-card">
        <Calendar className="h-10 w-10 text-muted-foreground animate-pulse mb-4" />
        <p className="text-muted-foreground animate-pulse">Computing timetable...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full h-[600px] flex flex-col items-center justify-center bg-card text-destructive">
        <AlertCircle className="h-10 w-10 mb-4" />
        <p className="text-lg font-semibold">{error}</p>
        <p className="text-sm opacity-80 mt-2">Please try reloading the page or updating your profile.</p>
      </Card>
    );
  }

  if (timetableOutdated) {
    // The only timetable this device holds is for a semester that has ended.
    // Showing it would send a student to last semester's classes.
    return (
      <Card className="w-full p-8 flex flex-col items-center text-center gap-3 bg-card">
        <AlertCircle className="h-10 w-10 text-amber-500" />
        <h2 className="text-lg font-semibold">This semester&rsquo;s timetable could not be loaded</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          The server is not answering, and the copy on this device is for {semester?.name ?? 'an earlier semester'},
          which is over. Nothing is shown rather than last semester&rsquo;s classes.
        </p>
        <Button onClick={() => void refreshCourses()} className="rounded-xl">Try again</Button>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-4">
      {timetableSource === 'cache' && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>
            Showing the saved copy of {semester?.name ?? 'your timetable'}
            {snapshotSavedAt
              ? ` from ${new Date(snapshotSavedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`
              : ''}
            {' '}— the server is not answering, so changes since then are missing.
          </span>
          <Button size="sm" variant="outline" onClick={() => void refreshCourses()} className="h-7 rounded-lg">Retry</Button>
        </div>
      )}

      {collisions.length > 0 && <CollisionBanner collisions={collisions} />}

      {superseded.map(course => (
        <div
          key={course.courseCode}
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <p>
            <span className="font-semibold">{course.courseCode}</span>: the official timings changed after you
            saved your own, so your timetable now shows the new official ones.
          </p>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => keepCourseOverride(course.courseCode)}>
              Use my timings
            </Button>
            <Button size="sm" onClick={() => removeCourseOverride(course.courseCode)}>
              Keep official
            </Button>
          </div>
        </div>
      ))}

      <Card className="w-full overflow-hidden bg-card border-border shadow-sm">
        <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center gap-2">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Weekly Schedule
            </h2>
            <p className="text-sm text-muted-foreground">
              Week of {new Date(previewDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {semester?.name ? ` · ${semester.name}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            {selectedCourseIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => openEditor(null)}
                title="A class moved, was added or was cancelled? Fix it here."
              >
                <PencilLine className="h-4 w-4" />
                <span className="hidden sm:inline">Edit timings</span>
              </Button>
            )}
            {selectedCourseIds.length > 0 && <TimetableDownload />}
            <CourseSelector />
          </div>
        </div>

        {selectedCourseIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[500px] bg-muted/10">
            <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-medium text-foreground">No Courses Selected</h3>
            <p className="text-muted-foreground mt-2 max-w-sm text-center">
              Click "Manage Courses" above to choose your electives and build your timetable.
            </p>
          </div>
        ) : (
          <WeeklyGrid events={resolvedEvents} onEventClick={event => openEditor(event.courseCode)} />
        )}
      </Card>

      <CourseTimingsEditor
        key={editor.session}
        open={editor.open}
        onOpenChange={open => setEditor(current => ({ ...current, open }))}
        courseCode={editor.courseCode}
      />
    </div>
  );
}
