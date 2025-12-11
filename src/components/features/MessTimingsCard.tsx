import { Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { weekdayTimings, weekendTimings } from '@/data/messData';
import { getDayType } from '@/utils/dateUtils';

interface MessTimingsCardProps {
  date: Date;
}

export function MessTimingsCard({ date }: MessTimingsCardProps) {
  const dayType = getDayType(date);
  const timings = dayType === 'weekday' ? weekdayTimings : weekendTimings;
  const scheduleType = dayType === 'weekday' ? 'Weekday' : 'Weekend/Holiday';

  const timingsList = [
    { meal: 'Breakfast', time: timings.breakfast },
    { meal: 'Lunch', time: timings.lunch },
    { meal: 'Snacks', time: timings.snacks },
    { meal: 'Dinner', time: timings.dinner }
  ];

  return (
    <Card className="p-6 bg-card hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:scale-[1.02]">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Clock className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Mess Timings</h2>
          <p className="text-sm text-muted-foreground">{scheduleType} schedule</p>
        </div>
      </div>

      <div className="space-y-4">
        {timingsList.map((timing) => (
          <div 
            key={timing.meal}
            className="flex justify-between items-center p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <span className="font-medium">{timing.meal}</span>
            <span className="text-sm text-primary font-mono">{timing.time}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          {dayType === 'weekday' 
            ? 'Weekday timings apply Monday-Friday (excluding holidays)'
            : 'Weekend/Holiday timings apply on Saturdays, Sundays, and Institute holidays'
          }
        </p>
      </div>
    </Card>
  );
}
