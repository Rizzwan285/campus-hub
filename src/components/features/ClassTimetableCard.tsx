import { GraduationCap, BookOpen } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { timetable } from '@/data/timetableData';

interface ClassTimetableCardProps {
  date: Date;
}

export function ClassTimetableCard({ date }: ClassTimetableCardProps) {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const daySchedule = timetable.find((d) => d.day === dayName);
  const hasClasses = daySchedule && daySchedule.slots.length > 0;

  return (
    <Card className="p-5 sm:p-6 bg-card hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:scale-[1.02]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-primary/10 rounded-lg">
          <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-semibold">Class Timetable</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {dayName} • Aug–Dec 2026
          </p>
        </div>
      </div>

      {/* Content */}
      {hasClasses ? (
        <div className="space-y-3">
          {daySchedule.slots.map((slot, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
            >
              <div className="p-1.5 bg-primary/10 rounded-md shrink-0 mt-0.5">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-base font-semibold text-foreground truncate">
                  {slot.subject}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {slot.time}
                  </span>
                  <span className="inline-block text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    Room {slot.room}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="p-3 bg-muted/50 rounded-full mb-3">
            <GraduationCap className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No classes today</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Enjoy your day off!</p>
        </div>
      )}
    </Card>
  );
}
