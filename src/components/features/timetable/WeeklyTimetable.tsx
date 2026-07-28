import { useTimetableStore } from '@/store/useTimetableStore';
import { useUserStore } from '@/store/useUserStore';
import { Card } from '@/components/ui/card';
import { AlertCircle, Calendar } from 'lucide-react';
import { WeeklyGrid } from './WeeklyGrid';
import { CollisionBanner } from './CollisionBanner';
import { CourseSelector } from './CourseSelector';

export function WeeklyTimetable() {
  const { 
    resolvedEvents, 
    collisions, 
    isLoading, 
    error, 
    selectedCourseIds,
    previewDate 
  } = useTimetableStore();

  const profile = useUserStore(state => state.profile);
  const isFirstYearUG = profile?.program === 'UG' && profile?.yearOfStudy === '1';

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

  return (
    <div className="w-full space-y-4">
      {collisions.length > 0 && <CollisionBanner collisions={collisions} />}
      
      <Card className="w-full overflow-hidden bg-card border-border shadow-sm">
        <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Weekly Schedule
            </h2>
            <p className="text-sm text-muted-foreground">
              Week of {new Date(previewDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          {!isFirstYearUG && <CourseSelector />}
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
          <WeeklyGrid events={resolvedEvents} />
        )}
      </Card>
    </div>
  );
}
