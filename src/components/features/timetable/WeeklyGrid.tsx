import { useEffect, useRef, useState } from 'react';
import { PencilLine } from 'lucide-react';
import { CalendarEvent, Collision } from '@/engine/types';
import { EventCard } from './EventCard';

interface WeeklyGridProps {
  events: CalendarEvent[];
  collisions?: Collision[];
  /** Tapping a class opens it for editing. */
  onEventClick?: (event: CalendarEvent) => void;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const WEEKEND = ['Saturday', 'Sunday'];
// The published timetable fits 8:00–18:00; students' own timings can fall
// outside it (an evening or Saturday class), and the grid widens to show them.
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 18;

const weekdayOf = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'long' });

import { stringToColorClass } from '@/utils/colorUtils';

export function WeeklyGrid({ events, collisions = [], onEventClick }: WeeklyGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());

  const days = [...WEEKDAYS, ...WEEKEND.filter(day => events.some(e => weekdayOf(e.startTime) === day))];
  const startHour = Math.min(DEFAULT_START_HOUR, ...events.map(e => e.startTime.getHours()));
  const endHour = Math.min(24, Math.max(
    DEFAULT_END_HOUR,
    ...events.map(e => e.endTime.getHours() + (e.endTime.getMinutes() > 0 ? 1 : 0)),
  ));
  const totalHours = endHour - startHour;

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const PADDING_PCT = 2.5;
  const SCALE_PCT = 100 - (PADDING_PCT * 2);

  const getPercentage = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const minutesFromStart = (hours - startHour) * 60 + minutes;
    const totalMinutes = totalHours * 60;
    const raw = Math.max(0, Math.min(100, (minutesFromStart / totalMinutes) * 100));
    return PADDING_PCT + (raw * (SCALE_PCT / 100));
  };

  const getDurationPercentage = (start: Date, end: Date) => {
    const startMins = start.getHours() * 60 + start.getMinutes();
    const endMins = end.getHours() * 60 + end.getMinutes();
    const durationMins = endMins - startMins;
    const totalMinutes = totalHours * 60;
    const raw = Math.max(0, Math.min(100, (durationMins / totalMinutes) * 100));
    return raw * (SCALE_PCT / 100);
  };

  const isCollision = (event: CalendarEvent) => {
    return collisions.some(c => c.courseIdA === event.courseId || c.courseIdB === event.courseId);
  };

  // Auto-scroll to current time on mount if within working hours
  useEffect(() => {
    if (scrollRef.current) {
      const hours = now.getHours();
      if (hours >= startHour && hours <= endHour) {
        const leftPercentage = getPercentage(now);
        // Scroll so the current time is roughly in the middle horizontally
        const scrollAmount = (scrollRef.current.scrollWidth * leftPercentage) / 100;
        scrollRef.current.scrollTo({ left: Math.max(0, scrollAmount - 200), behavior: 'smooth' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hoursList = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);

  // Is today a weekday?
  const todayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const isWorkingHours = now.getHours() >= startHour && now.getHours() < endHour;
  const showCurrentTime = days.includes(todayName) && isWorkingHours;
  const currentTimePercentage = getPercentage(now);

  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <>
    {/* Mobile Agenda View */}
    <div className="md:hidden flex flex-col w-full max-h-[600px] overflow-y-auto space-y-6 px-1">
      {days.map(dayName => {
        const dayEvents = events
          .filter(e => e.startTime.toLocaleDateString('en-US', { weekday: 'long' }) === dayName)
          .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
          
        const isToday = dayName === todayName;
        
        if (dayEvents.length === 0) return null;
        
        return (
          <div key={dayName} className="flex flex-col space-y-3">
            <div className="flex items-center gap-2 border-b border-border/50 pb-1">
              <h3 className={`font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>{dayName}</h3>
              {isToday && <span className="text-[10px] uppercase bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">Today</span>}
            </div>
            
            <div className="flex flex-col space-y-2">
              {dayEvents.map(event => {
                const baseColor = stringToColorClass(event.courseCode);
                const hasCollision = isCollision(event);
                return (
                  <div
                    key={event.id}
                    role={onEventClick ? 'button' : undefined}
                    tabIndex={onEventClick ? 0 : undefined}
                    aria-label={onEventClick ? `Edit ${event.courseCode} timings` : undefined}
                    onClick={onEventClick ? () => onEventClick(event) : undefined}
                    onKeyDown={onEventClick ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onEventClick(event);
                      }
                    } : undefined}
                    className={`relative flex flex-col rounded-md border shadow-sm overflow-hidden bg-background ${onEventClick ? 'cursor-pointer active:scale-[0.99] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-ring' : ''} ${hasCollision ? 'border-destructive ring-1 ring-destructive' : 'border-primary/15'}`}
                  >
                    {/* Tint overlay */}
                    <div className={`absolute inset-0 pointer-events-none ${baseColor.split(' ').filter(c => c.startsWith('bg-')).join(' ')}`} />

                    <div className={`flex flex-col p-3 relative ${baseColor.split(' ').filter(c => !c.startsWith('bg-') && !c.startsWith('border-')).join(' ')}`}>
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-sm flex items-center gap-1.5">
                          {event.courseCode}
                          {event.isPersonal && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-background/60 border border-border/30 px-1.5 py-0.5 rounded">
                              <PencilLine className="h-2.5 w-2.5" /> Your timing
                            </span>
                          )}
                        </span>
                        <span className="text-xs font-semibold bg-background/50 backdrop-blur-sm px-2 py-0.5 rounded-md border border-border/20">
                          {formatTime(event.startTime)} - {formatTime(event.endTime)}
                        </span>
                      </div>
                      <span className="text-xs opacity-90 mb-2 line-clamp-1">{event.courseName}</span>
                      <div className="flex items-center justify-between text-[11px] mt-auto pt-2 border-t border-border/30 opacity-90">
                        <span className="capitalize font-semibold">{event.type}</span>
                        <span className="font-semibold">{event.room}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>

    {/* Desktop Grid View */}
    <div ref={scrollRef} className="hidden md:flex w-full h-[600px] overflow-auto relative bg-background border rounded-md shadow-inner flex-col">
      {/* 140px an hour, as the fixed 8:00–18:00 grid always had. */}
      <div className="flex flex-col w-full h-full relative" style={{ minWidth: `${Math.max(1400, totalHours * 140)}px` }}>
        
        {/* Header Row: Sticky Top */}
        <div className="flex sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b h-10 shadow-sm shrink-0">
          {/* Corner */}
          <div className="w-20 shrink-0 border-r sticky left-0 z-20 bg-muted/90" />
          
          {/* Time Axis */}
          <div className="flex-1 relative">
            {hoursList.map(hour => (
              <div 
                key={hour}
                className="absolute h-full border-l border-border/50 flex justify-center -translate-x-1/2"
                style={{ left: `${PADDING_PCT + (((hour - startHour) / totalHours) * 100) * (SCALE_PCT / 100)}%` }}
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
              style={{ left: `${PADDING_PCT + (((hour - startHour) / totalHours) * 100) * (SCALE_PCT / 100)}%` }}
            />
          ))}
        </div>

        {/* Current Time Line */}
        {showCurrentTime && (
          <div className="absolute top-10 bottom-0 left-20 right-0 pointer-events-none z-0">
            <div 
              className="absolute top-0 bottom-0 border-l-2 border-dashed border-primary/50 flex justify-center"
              style={{ left: `${currentTimePercentage}%` }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-primary/80 -mt-1 shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
            </div>
          </div>
        )}

        {/* Day Rows */}
        <div className="flex-1 flex flex-col z-10">
          {days.map(dayName => {
            const isToday = dayName === todayName;
            const dayEvents = events.filter(e => e.startTime.toLocaleDateString('en-US', { weekday: 'long' }) === dayName);
            
            return (
              <div key={dayName} className="flex-1 flex border-b border-border/50 relative group min-h-[80px]">
                {/* Day Header (Sticky Left) */}
                <div className="w-20 shrink-0 border-r sticky left-0 z-30 bg-background">
                  <div className={`absolute inset-0 transition-colors ${isToday ? 'bg-primary/10' : 'group-hover:bg-muted/30'}`} />
                  <div className="relative h-full w-full flex flex-col justify-center items-center">
                    <span className={`text-sm font-semibold ${isToday ? 'text-primary' : ''}`}>
                      {dayName.slice(0, 3)}
                    </span>
                    {isToday && <span className="text-[9px] uppercase bg-primary/20 text-primary px-1 mt-1 rounded">Today</span>}
                  </div>
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
                      onClick={onEventClick ? () => onEventClick(event) : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </>
  );
}
