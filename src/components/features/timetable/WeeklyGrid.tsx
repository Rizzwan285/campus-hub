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

  const getPercentage = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const minutesFromStart = (hours - START_HOUR) * 60 + minutes;
    const totalMinutes = TOTAL_HOURS * 60;
    return Math.max(0, Math.min(100, (minutesFromStart / totalMinutes) * 100));
  };

  const getDurationPercentage = (start: Date, end: Date) => {
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
        const leftPercentage = getPercentage(now);
        // Scroll so the current time is roughly in the middle horizontally
        const scrollAmount = (scrollRef.current.scrollWidth * leftPercentage) / 100;
        scrollRef.current.scrollTo({ left: Math.max(0, scrollAmount - 200), behavior: 'smooth' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hoursList = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

  // Is today a weekday?
  const todayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const isWorkingHours = now.getHours() >= START_HOUR && now.getHours() < END_HOUR;
  const showCurrentTime = DAYS.includes(todayName) && isWorkingHours;
  const currentTimePercentage = getPercentage(now);

  return (
    <div ref={scrollRef} className="w-full h-[600px] overflow-auto relative bg-background border rounded-md shadow-inner flex flex-col">
      <div className="flex flex-col min-w-[800px] w-full h-full relative">
        
        {/* Header Row: Sticky Top */}
        <div className="flex sticky top-0 z-40 bg-muted/80 backdrop-blur-sm border-b h-10 shadow-sm shrink-0">
          {/* Corner */}
          <div className="w-20 shrink-0 border-r sticky left-0 z-50 bg-muted/90" />
          
          {/* Time Axis */}
          <div className="flex-1 relative">
            {hoursList.map(hour => (
              <div 
                key={hour}
                className="absolute h-full border-l border-border/50 flex justify-center -translate-x-1/2"
                style={{ left: `${((hour - START_HOUR) / TOTAL_HOURS) * 100}%` }}
              >
                <span className="text-xs text-muted-foreground pt-1">{hour}:00</span>
              </div>
            ))}
          </div>
        </div>

        {/* Vertical grid lines (background for entire body) */}
        <div className="absolute top-10 bottom-0 left-20 right-0 pointer-events-none z-0">
          {hoursList.map(hour => (
            <div 
              key={hour} 
              className="absolute h-full border-l border-border/20"
              style={{ left: `${((hour - START_HOUR) / TOTAL_HOURS) * 100}%` }}
            />
          ))}
        </div>

        {/* Current Time Line */}
        {showCurrentTime && (
          <div className="absolute top-10 bottom-0 left-20 right-0 pointer-events-none z-20">
            <div 
              className="absolute top-0 bottom-0 border-l-2 border-red-500 flex justify-center"
              style={{ left: `${currentTimePercentage}%` }}
            >
              <div className="w-2 h-2 rounded-full bg-red-500 -mt-1 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            </div>
          </div>
        )}

        {/* Day Rows */}
        <div className="flex-1 flex flex-col z-10">
          {DAYS.map(dayName => {
            const isToday = dayName === todayName;
            const dayEvents = events.filter(e => e.startTime.toLocaleDateString('en-US', { weekday: 'long' }) === dayName);
            
            return (
              <div key={dayName} className="flex-1 flex border-b border-border/50 relative group min-h-[80px]">
                {/* Day Header (Sticky Left) */}
                <div className={`w-20 shrink-0 border-r flex flex-col justify-center items-center sticky left-0 z-30 transition-colors ${isToday ? 'bg-primary/10' : 'bg-background group-hover:bg-muted/30'}`}>
                  <span className={`text-sm font-semibold ${isToday ? 'text-primary' : ''}`}>
                    {dayName.slice(0, 3)}
                  </span>
                  {isToday && <span className="text-[9px] uppercase bg-primary/20 text-primary px-1 mt-1 rounded">Today</span>}
                </div>

                {/* Events Row */}
                <div className={`flex-1 relative ${isToday ? 'bg-primary/5' : ''}`}>
                  {dayEvents.map(event => (
                    <EventCard 
                      key={event.id}
                      event={event}
                      left={getPercentage(event.startTime)}
                      width={getDurationPercentage(event.startTime, event.endTime)}
                      isCollision={collisions.some(c => c.courseIdA === event.courseId || c.courseIdB === event.courseId)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
