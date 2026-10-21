import { useState } from 'react';
import { CarFront, Clock, AlertCircle, Info, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getDayType } from '@/utils/dateUtils';
import { resolveDepartures, getUpcomingDepartures, formatTimeUntil, type Departure } from '@/utils/dateUtils';
import {
  workingDaysBuggy,
  saturdayHolidayBuggy,
  sundayBuggy,
  buggyEffectiveFrom,
  BUGGY_DISCLAIMER,
  type BuggySchedule,
} from '@/data/buggyData';

interface BuggyScheduleCardProps {
  currentTime: Date;
  displayDate: Date;
}

type ViewMode = 'auto' | 'workingDays' | 'saturdaysHolidays' | 'sundays';

export function BuggyScheduleCard({ currentTime, displayDate }: BuggyScheduleCardProps) {
  const [selectedView, setSelectedView] = useState<ViewMode>('auto');
  const dayType = getDayType(displayDate);

  // If user hasn't overridden the view, follow the calendar dayType
  const effectiveDayType =
    selectedView === 'auto'
      ? dayType
      : selectedView === 'workingDays'
        ? 'weekday'
        : selectedView === 'saturdaysHolidays'
          ? 'saturday'
          : 'sunday';

  // Use displayDate for filtering if it's different from currentTime
  const isPreviewMode =
    displayDate.toDateString() !== currentTime.toDateString() || selectedView !== 'auto';
  const filterTime = isPreviewMode ? new Date(displayDate) : currentTime;

  // IMPORTANT: Sundays strictly have NO buggy services.
  // Holiday buggy schedule applies ONLY to Saturdays and institute holidays, NOT Sundays.
  const schedule: BuggySchedule =
    effectiveDayType === 'sunday'
      ? sundayBuggy
      : effectiveDayType === 'saturday'
        ? saturdayHolidayBuggy
        : workingDaysBuggy;

  const isSunday = effectiveDayType === 'sunday';

  const upcomingNilaToSahyadri = isPreviewMode
    ? resolveDepartures(schedule.nilaToSahyadri, filterTime)
    : getUpcomingDepartures(schedule.nilaToSahyadri, filterTime);
  const upcomingSahyadriToNila = isPreviewMode
    ? resolveDepartures(schedule.sahyadriToNila, filterTime)
    : getUpcomingDepartures(schedule.sahyadriToNila, filterTime);

  const nextNilaToSahyadri = upcomingNilaToSahyadri[0] ?? null;
  const nextSahyadriToNila = upcomingSahyadriToNila[0] ?? null;

  const scheduleLabel = isSunday
    ? 'Sunday (No Service)'
    : effectiveDayType === 'saturday'
      ? 'Saturday / Holiday'
      : 'Working Days';

  const BuggyTimesList = ({
    times,
    nextBuggy,
  }: {
    times: Departure[];
    nextBuggy: Departure | null;
  }) => {
    if (isSunday) {
      return (
        <div className="p-6 rounded-xl bg-muted/40 border border-border/60 text-center my-3">
          <div className="p-3 bg-amber-500/10 text-amber-500 rounded-full w-fit mx-auto mb-3">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            No Buggy Service on Sundays
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            There are no buggy services on Sundays. Buggy shuttles operate only on Working Days (Mon–Fri)
            and Saturdays / Institute Holidays. Please check the regular Bus Schedule for Sunday campus travel.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {times.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No more buggies today. Check another date or schedule.
          </p>
        ) : (
          <>
            {nextBuggy && !isPreviewMode && (
              <div className="p-4 bg-emerald-500/10 rounded-lg border-2 border-emerald-500/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Next Buggy</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {nextBuggy.time}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1">Leaves in</p>
                    <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatTimeUntil(nextBuggy.at, currentTime)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isPreviewMode && (
              <p className="text-sm text-center text-muted-foreground mb-2">
                All scheduled buggies for this day ({times.length} departures)
              </p>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mt-4">
              {times.slice(!isPreviewMode && nextBuggy ? 1 : 0).map((departure, idx) => (
                <div
                  key={idx}
                  className="p-3 text-center rounded-lg bg-muted hover:bg-muted/80 transition-colors relative"
                >
                  <Clock className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs sm:text-sm font-medium">{departure.time}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-xl">
              <CarFront className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Buggy Schedule</h2>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Electric Shuttle
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {scheduleLabel} · from {buggyEffectiveFrom}
              </p>
            </div>
          </div>

          {/* Quick Schedule Selector */}
          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg text-xs self-start sm:self-center border border-border/40">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground ml-1.5 mr-0.5 hidden xs:inline" />
            <button
              onClick={() => setSelectedView(selectedView === 'workingDays' ? 'auto' : 'workingDays')}
              className={`px-2 py-1 rounded-md transition-all ${
                effectiveDayType === 'weekday' && selectedView !== 'sundays' && selectedView !== 'saturdaysHolidays'
                  ? 'bg-background text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Working Days
            </button>
            <button
              onClick={() => setSelectedView(selectedView === 'saturdaysHolidays' ? 'auto' : 'saturdaysHolidays')}
              className={`px-2 py-1 rounded-md transition-all ${
                effectiveDayType === 'saturday'
                  ? 'bg-background text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sat / Holidays
            </button>
            <button
              onClick={() => setSelectedView(selectedView === 'sundays' ? 'auto' : 'sundays')}
              className={`px-2 py-1 rounded-md transition-all ${
                isSunday
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sundays
            </button>
          </div>
        </div>

        {/* Direction Tabs */}
        <Tabs defaultValue="nila-sahyadri" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="nila-sahyadri">Nila → Sahyadri</TabsTrigger>
            <TabsTrigger value="sahyadri-nila">Sahyadri → Nila</TabsTrigger>
          </TabsList>

          <TabsContent value="nila-sahyadri">
            <BuggyTimesList times={upcomingNilaToSahyadri} nextBuggy={nextNilaToSahyadri} />
          </TabsContent>

          <TabsContent value="sahyadri-nila">
            <BuggyTimesList times={upcomingSahyadriToNila} nextBuggy={nextSahyadriToNila} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Mandatory Disclaimer Footer */}
      <div className="mt-6 pt-3 border-t border-border/40 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
        <p>
          <span className="font-semibold text-foreground">Disclaimer: </span>
          {BUGGY_DISCLAIMER}
        </p>
      </div>
    </Card>
  );
}
