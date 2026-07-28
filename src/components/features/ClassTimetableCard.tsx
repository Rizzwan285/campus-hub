import { useEffect, useState } from 'react';
import { GraduationCap, BookOpen, AlertCircle, Clock, Play, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useTimetableStore } from '@/store/useTimetableStore';
import { CalendarEvent } from '@/engine/types';
import metadata from '@/data/timetable/metadata.json';

interface ClassTimetableCardProps {
  date: Date;
}

export function ClassTimetableCard({ date }: ClassTimetableCardProps) {
  const { resolvedEvents, isLoading, error, holidaysEncountered, selectedCourseIds } = useTimetableStore();
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000); // update every minute
    return () => clearInterval(timer);
  }, []);

  const dayEvents = resolvedEvents.filter(event => 
    event.startTime.toLocaleDateString('en-US', { weekday: 'long' }) === dayName
  ).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const isoDate = date.toISOString().split('T')[0];
  const holiday = holidaysEncountered.find(h => h.date === isoDate);
  const hasClasses = dayEvents.length > 0;
  const isToday = now.toISOString().split('T')[0] === isoDate;

  // Determine current/next class logic only if the card is showing "today"
  let currentEvent: CalendarEvent | null = null;
  let nextEvent: CalendarEvent | null = null;
  let timeRemainingText = '';

  if (isToday && hasClasses) {
    const nowTime = now.getTime();
    for (const event of dayEvents) {
      // Create fresh dates for today matching the event hours/mins
      const eStart = new Date(now);
      eStart.setHours(event.startTime.getHours(), event.startTime.getMinutes(), 0, 0);
      
      const eEnd = new Date(now);
      eEnd.setHours(event.endTime.getHours(), event.endTime.getMinutes(), 0, 0);

      const st = eStart.getTime();
      const ed = eEnd.getTime();

      if (nowTime >= st && nowTime < ed) {
        currentEvent = event;
        const diffMins = Math.floor((ed - nowTime) / 60000);
        timeRemainingText = `Ends in ${diffMins} min`;
      } else if (nowTime < st && !currentEvent && !nextEvent) {
        nextEvent = event;
        const diffMins = Math.floor((st - nowTime) / 60000);
        if (diffMins > 60) {
          timeRemainingText = `Starts in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
        } else {
          timeRemainingText = `Starts in ${diffMins} min`;
        }
      }
    }
  }

  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  if (isLoading) {
    return (
      <Card className="p-5 sm:p-6 bg-card flex flex-col min-h-[200px]">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-muted animate-pulse rounded-lg" />
          <div className="space-y-2 flex-1">
            <div className="h-5 w-1/3 bg-muted animate-pulse rounded" />
            <div className="h-3 w-1/4 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 w-full bg-muted/50 animate-pulse rounded-lg" />
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-5 sm:p-6 bg-card flex flex-col items-center justify-center min-h-[200px] text-red-500">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p className="text-sm font-medium">{error}</p>
      </Card>
    );
  }

  if (selectedCourseIds.length === 0) {
    return (
      <Card className="p-5 sm:p-6 bg-card flex flex-col items-center justify-center min-h-[200px]">
        <GraduationCap className="h-8 w-8 text-muted-foreground/50 mb-3" />
        <p className="text-sm font-medium text-foreground">No courses selected</p>
        <p className="text-xs text-muted-foreground/70 mt-1 max-w-[200px] text-center">
          Choose your courses in the weekly timetable view.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6 bg-card transition-all duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-primary/10 rounded-lg">
          <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1 flex justify-between items-start">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">Today's Classes</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {dayName} • {isToday && <span className="font-medium text-primary mr-1">Live</span>} 
              <span className="opacity-70">({metadata.semester})</span>
            </p>
          </div>
          {isToday && (currentEvent || nextEvent) && (
            <div className="text-right flex flex-col items-end">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full animate-in fade-in">
                {currentEvent ? <Play className="w-3 h-3 fill-primary" /> : <Clock className="w-3 h-3" />}
                {currentEvent ? 'NOW RUNNING' : 'UP NEXT'}
              </span>
              <span className="text-[10px] sm:text-xs text-muted-foreground mt-1 font-medium">
                {timeRemainingText}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {holiday ? (
        <div className="flex flex-col items-center justify-center py-8 text-center bg-primary/5 rounded-lg border border-primary/20">
          <div className="p-3 bg-primary/10 rounded-full mb-3 shadow-[0_0_15px_rgba(var(--primary),0.2)]">
            <span className="text-2xl" role="img" aria-label="party popper">🎉</span>
          </div>
          <p className="text-sm font-semibold text-primary">{holiday.name}</p>
          <p className="text-xs text-primary/80 mt-1 font-medium">Enjoy your day off!</p>
        </div>
      ) : hasClasses ? (
        <div className="space-y-3">
          {dayEvents.map((event, idx) => {
            const isCurrent = currentEvent?.id === event.id;
            const isNext = nextEvent?.id === event.id;
            const isPast = !isCurrent && isToday && (new Date().getHours() * 60 + new Date().getMinutes()) > (event.endTime.getHours() * 60 + event.endTime.getMinutes());
            
            return (
              <div
                key={event.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                  isCurrent 
                    ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20' 
                    : isNext 
                    ? 'bg-card border-border/80 shadow-sm'
                    : isPast 
                    ? 'bg-muted/20 border-transparent opacity-60'
                    : 'bg-card border-border/50 hover:bg-muted/30'
                }`}
                tabIndex={0}
                aria-label={`${event.courseCode} at ${formatTime(event.startTime)}`}
              >
                <div className={`p-1.5 rounded-md shrink-0 mt-0.5 ${
                  isCurrent ? 'bg-primary text-primary-foreground' : isPast ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
                }`}>
                  {isPast ? <CheckCircle2 className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm sm:text-base font-semibold truncate ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
                    {event.courseCode}: {event.courseName}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                    <span className={`text-xs sm:text-sm font-medium ${isCurrent ? 'text-primary/80' : 'text-muted-foreground'}`}>
                      {formatTime(event.startTime)} - {formatTime(event.endTime)}
                    </span>
                    <span className="inline-flex items-center text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                      Room {event.room}
                    </span>
                    <span className="inline-flex items-center text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase">
                      {event.type}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center bg-muted/20 rounded-lg border border-dashed border-border">
          <div className="p-3 bg-background rounded-full mb-3 shadow-sm">
            <CheckCircle2 className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <p className="text-sm font-medium text-foreground">No classes today</p>
          <p className="text-xs text-muted-foreground mt-1">You have a clear schedule.</p>
        </div>
      )}
    </Card>
  );
}
