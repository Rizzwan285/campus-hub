import { CalendarEvent } from '@/engine/types';
import { stringToColorClass } from '@/utils/colorUtils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface EventCardProps {
  event: CalendarEvent;
  top: number;    // percentage
  height: number; // percentage
  isCollision?: boolean;
}

export function EventCard({ event, top, height, isCollision }: EventCardProps) {
  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  
  const baseColor = stringToColorClass(event.courseCode);
  
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(event.courseCode);
    toast.success(`Copied ${event.courseCode} to clipboard`);
  };

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div 
          className={`absolute w-[calc(100%-8px)] mx-[4px] rounded-md border p-1.5 sm:p-2 overflow-hidden shadow-sm transition-all hover:z-20 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer group
            ${baseColor}
            ${isCollision ? 'ring-2 ring-destructive ring-offset-1 border-destructive' : ''}
          `}
          style={{
            top: `${top}%`,
            height: `${height}%`,
            minHeight: '24px' // even shorter classes need to be clickable
          }}
          tabIndex={0}
          aria-label={`${event.courseCode} ${event.type} from ${formatTime(event.startTime)} to ${formatTime(event.endTime)} in ${event.room}`}
        >
          <div className="flex flex-col h-full text-xs relative">
            <div className="flex items-center justify-between gap-1">
              <span className="font-bold truncate">{event.courseCode}</span>
              {isCollision && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
            </div>
            
            {/* Show name if height > 5% (~30 mins) */}
            {height > 5 && (
              <span className="hidden sm:inline opacity-80 truncate text-[10px] leading-tight mt-0.5">{event.courseName}</span>
            )}
            
            {/* Bottom metadata */}
            {height > 7 && (
              <div className="mt-auto pt-0.5 flex flex-wrap items-center gap-x-1.5 opacity-90 text-[10px]">
                <span className="uppercase text-[9px] font-bold opacity-75">{event.type.slice(0, 3)}</span>
                <span>• {event.room}</span>
              </div>
            )}
            
            <button 
              onClick={handleCopy}
              className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded"
              title="Copy Course Code"
              aria-label="Copy course code"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs p-3">
        <div className="space-y-1.5">
          <p className="font-semibold">{event.courseCode}: {event.courseName}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="capitalize">{event.type}</span>
            <span>•</span>
            <span>Room {event.room}</span>
          </div>
          <p className="text-xs font-medium">
            {formatTime(event.startTime)} - {formatTime(event.endTime)}
          </p>
          {isCollision && (
            <p className="text-xs text-destructive font-medium mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Conflicts with another class
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
