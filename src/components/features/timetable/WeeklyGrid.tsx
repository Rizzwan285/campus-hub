import { useEffect, useRef, useState } from 'react';
import { CalendarEvent, Collision } from '@/engine/types';
import { EventCard } from './EventCard';

interface WeeklyGridProps {
  events: CalendarEvent[];
  collisions?: Collision[];
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const START_HOUR = 8;
const END_HOUR = 18;
const TOTAL_HOURS = END_HOUR - START_HOUR;

export function WeeklyGrid({ events, collisions = [] }: WeeklyGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getTopPercentage = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const minutesFromStart = (hours - START_HOUR) * 60 + minutes;
    const totalMinutes = TOTAL_HOURS * 60;
    return Math.max(0, Math.min(100, (minutesFromStart / totalMinutes) * 100));
  };

  const getHeightPercentage = (start: Date, end: Date) => {
    const startMins = start.getHours() * 60 + start.getMinutes();
    const endMins = end.getHours() * 60 + end.getMinutes();
    const durationMins = endMins - startMins;
    const totalMinutes = TOTAL_HOURS * 60;
    return Math.max(0, Math.min(100, (durationMins / totalMinutes) * 100));
  };

  // Auto-scroll to current time on mount if within working hours
  useEffect(() => {
    if (scrollRef.current) {
      const hours = now.getHours();
      if (hours >= START_HOUR && hours <= END_HOUR) {
        const topPercentage = getTopPercentage(now);
        // Scroll so the current time is roughly in the middle
        const scrollAmount = (scrollRef.current.scrollHeight * topPercentage) / 100;
        scrollRef.current.scrollTo({ top: Math.max(0, scrollAmount - 200), behavior: 'smooth' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hoursList = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

  // Is today a weekday?
  const todayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const isWorkingHours = now.getHours() >= START_HOUR && now.getHours() < END_HOUR;
  const showCurrentTime = DAYS.includes(todayName) && isWorkingHours;
  const currentTimeTop = getTopPercentage(now);

  const isCollision = (event: CalendarEvent) => {
    return collisions.some(c => 
      (c.courseCodeA === event.courseCode || c.courseCodeB === event.courseCode) && 
      c.conflictingDay === event.startTime.toLocaleDateString('en-US', { weekday: 'long' })
    );
  };

  return (
    <div ref={scrollRef} className="flex w-full h-[800px] bg-background relative">
      {/* Time Column (Sticky) */}
      <div className="w-12 sm:w-16 border-r border-border shrink-0 bg-muted/30 sticky left-0 z-20">
        <div className="absolute top-[40px] bottom-0 left-0 right-0">
          {hoursList.map(hour => (
            <div 
              key={hour} 
              className="absolute w-full border-t border-border/50 flex justify-center -translate-y-1/2"
              style={{ top: `${((hour - START_HOUR) / TOTAL_HOURS) * 100}%` }}
            >
              <span className="text-[10px] sm:text-xs text-muted-foreground bg-background px-1">
                {hour}:00
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Days Grid */}
      <div className="flex-1 flex relative overflow-x-auto">
        {/* Horizontal grid lines */}
        <div className="absolute top-[40px] bottom-0 left-0 right-0 pointer-events-none z-0">
          {hoursList.map(hour => (
            <div 
              key={hour} 
              className="absolute w-full border-t border-border/20"
              style={{ top: `${((hour - START_HOUR) / TOTAL_HOURS) * 100}%` }}
            />
          ))}
        </div>

        {/* Current Time Indicator */}
        {showCurrentTime && (
          <div className="absolute top-[40px] bottom-0 left-0 right-0 pointer-events-none z-30">
            <div 
              className="absolute left-0 right-0 border-t-2 border-red-500 flex items-center"
              style={{ top: `${currentTimeTop}%` }}
            >
              <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            </div>
          </div>
        )}

        {/* Day Columns */}
        {DAYS.map(dayName => {
          const isToday = dayName === todayName;
          const dayEvents = events.filter(e => e.startTime.toLocaleDateString('en-US', { weekday: 'long' }) === dayName);
          
          return (
            <div 
              key={dayName} 
              className={`flex-1 min-w-[120px] border-r border-border/50 relative ${isToday ? 'bg-primary/5' : ''}`}
            >
              {/* Day Header */}
              <div className="absolute top-0 w-full h-[40px] bg-muted/80 backdrop-blur-md border-b border-border/50 flex flex-col items-center justify-center z-10 shadow-sm">
                <span className={`text-xs sm:text-sm font-semibold ${isToday ? 'text-primary' : ''}`}>
                  {dayName.slice(0, 3)}
                  {isToday && <span className="ml-1 text-[10px] uppercase bg-primary/20 text-primary px-1 rounded">Today</span>}
                </span>
              </div>

              {/* Events Container */}
              <div className="absolute top-[40px] bottom-0 left-0 right-0 z-10">
                {dayEvents.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    top={getTopPercentage(event.startTime)}
                    height={getHeightPercentage(event.startTime, event.endTime)}
                    isCollision={collisions.some(c => c.courseIdA === event.courseId || c.courseIdB === event.courseId)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
