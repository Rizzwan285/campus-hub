import { WEEK_DAYS } from '@/engine/courseTimings';
import type { MeetingDay, TimetableMeeting } from '@/engine/types';

export interface PreviewMeeting extends TimetableMeeting {
  /** Shown on the block: a course code in a branch preview, nothing for one course. */
  label?: string;
}

const HOUR_PX = 34;
const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const TYPE_STYLE: Record<string, string> = {
  lecture: 'bg-primary/15 border-primary/50 text-foreground',
  lab: 'bg-emerald-500/15 border-emerald-500/50 text-foreground',
  tutorial: 'bg-amber-500/15 border-amber-500/50 text-foreground',
};

/** Places overlapping classes side by side instead of on top of each other. */
function layout(meetings: PreviewMeeting[]) {
  const sorted = [...meetings].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const columns: PreviewMeeting[][] = [];
  const placed = sorted.map((meeting) => {
    let column = columns.findIndex(
      (existing) => toMinutes(existing[existing.length - 1].endTime) <= toMinutes(meeting.startTime),
    );
    if (column === -1) {
      column = columns.length;
      columns.push([]);
    }
    columns[column].push(meeting);
    return { meeting, column };
  });
  return placed.map((entry) => ({ ...entry, columns: columns.length }));
}

/**
 * A week at a glance: one column per day, classes as blocks at their times.
 * Purely a picture of the meetings it is given, so it redraws the moment a
 * slot, day, time or room changes in the editor beside it.
 */
export function WeekPreview({ meetings, emptyText = 'No classes yet.' }: { meetings: PreviewMeeting[]; emptyText?: string }) {
  if (meetings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-3 py-8 text-center">
        {emptyText}
      </p>
    );
  }

  const usesWeekend = meetings.some((meeting) => meeting.day === 'Saturday' || meeting.day === 'Sunday');
  const days: MeetingDay[] = WEEK_DAYS.filter(
    (day) => (day !== 'Saturday' && day !== 'Sunday') || (usesWeekend && meetings.some((m) => m.day === day)),
  );
  const first = Math.min(8 * 60, ...meetings.map((meeting) => toMinutes(meeting.startTime)));
  const last = Math.max(18 * 60, ...meetings.map((meeting) => toMinutes(meeting.endTime)));
  const startHour = Math.floor(first / 60);
  const endHour = Math.ceil(last / 60);
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
  const top = (time: string) => ((toMinutes(time) - startHour * 60) / 60) * HOUR_PX;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
      <div className="min-w-[30rem]">
        <div className="grid border-b border-border/60 text-[11px] font-semibold text-muted-foreground" style={{ gridTemplateColumns: `2.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
          <div />
          {days.map((day) => (
            <div key={day} className="px-1 py-1.5 text-center border-l border-border/40">{day.slice(0, 3)}</div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `2.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((hour, index) => (
              <span key={hour} className="absolute right-1 text-[10px] text-muted-foreground -translate-y-1/2" style={{ top: index * HOUR_PX }}>
                {index === 0 ? '' : `${hour}:00`}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div key={day} className="relative border-l border-border/40" style={{ height: hours.length * HOUR_PX }}>
              {hours.map((hour, index) => (
                <div key={hour} className="absolute inset-x-0 border-t border-border/30" style={{ top: index * HOUR_PX }} />
              ))}
              {layout(meetings.filter((meeting) => meeting.day === day)).map(({ meeting, column, columns }, index) => (
                <div
                  key={index}
                  title={`${meeting.label ? `${meeting.label} · ` : ''}${meeting.type} ${meeting.startTime}–${meeting.endTime}${meeting.room ? ` · ${meeting.room}` : ''}${meeting.batches ? ` · ${meeting.batches}` : ''}`}
                  className={`absolute rounded-md border px-1 py-0.5 overflow-hidden text-[10px] leading-tight ${TYPE_STYLE[meeting.type] ?? TYPE_STYLE.lecture} ${meeting.recurrence?.type === 'once' ? 'border-dashed' : ''}`}
                  style={{
                    top: top(meeting.startTime) + 1,
                    height: Math.max(16, top(meeting.endTime) - top(meeting.startTime) - 2),
                    left: `calc(${(column / columns) * 100}% + 1px)`,
                    width: `calc(${100 / columns}% - 2px)`,
                  }}
                >
                  <div className="font-semibold truncate">
                    {meeting.label ?? (meeting.slot || meeting.type)}
                    {meeting.batches ? ` · ${meeting.batches}` : ''}
                  </div>
                  <div className="truncate opacity-80">{meeting.room || 'no room'}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
