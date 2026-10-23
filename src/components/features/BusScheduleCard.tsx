import { useState } from 'react';
import { Bus, CarFront, Clock, ChevronDown, ChevronUp, AlertCircle, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getDayType } from '@/utils/dateUtils';
import { resolveDepartures, formatTimeUntil } from '@/utils/dateUtils';
import { mergeRides, toRides, type Ride } from '@/lib/transitRides';
import { useBusSchedules } from '@/hooks/useApiData';
import { busEffectiveFrom } from '@/data/busData';
import {
  workingDaysBuggy,
  saturdayHolidayBuggy,
  sundayBuggy,
  buggyEffectiveFrom,
  BUGGY_DISCLAIMER,
} from '@/data/buggyData';

interface BusScheduleCardProps {
  currentTime: Date;
  displayDate: Date;
}

type Direction = 'nilaToSahyadri' | 'sahyadriToNila';

export function BusScheduleCard({ currentTime, displayDate }: BusScheduleCardProps) {
  const { workingDaysBus, fridayBus, saturdayHolidayBus, sundayBus } = useBusSchedules();
  const [showExtraRoutes, setShowExtraRoutes] = useState(false);
  const [showBuggies, setShowBuggies] = useState(false);
  const dayType = getDayType(displayDate);

  // Preview dates show every departure; today keeps the live countdown.
  const isPreviewMode = displayDate.toDateString() !== currentTime.toDateString();
  const filterTime = isPreviewMode ? new Date(displayDate) : currentTime;

  const schedule = dayType === 'sunday'
    ? sundayBus
    : dayType === 'saturday'
      ? saturdayHolidayBus
      : dayType === 'friday'
        ? fridayBus
        : workingDaysBus;

  // The buggy circular has no separate Friday sheet — Mon–Fri share one
  // schedule — and strictly no Sunday service. Saturdays and institute
  // holidays use the holiday sheet; Sundays must never fall back to it.
  const buggySchedule =
    dayType === 'sunday'
      ? sundayBuggy
      : dayType === 'saturday'
        ? saturdayHolidayBuggy
        : workingDaysBuggy;

  const noBuggiesToday = dayType === 'sunday';

  /**
   * Both schedules for one direction, resolved to real instants and tagged with
   * their position in their own list.
   *
   * The whole day is resolved first and filtered afterwards: `resolveDepartures`
   * infers am/pm by walking the list, so handing it a tail would reinterpret
   * every time in it.
   */
  const ridesFor = (direction: Direction) => {
    const busRides = toRides(resolveDepartures(schedule[direction], filterTime), 'bus');
    const buggyRides = toRides(resolveDepartures(buggySchedule[direction], filterTime), 'buggy');
    const stillToCome = (ride: Ride) => isPreviewMode || ride.at > filterTime;

    return {
      bus: busRides.filter(stillToCome),
      buggy: buggyRides.filter(stillToCome),
    };
  };

  const scheduleLabel = dayType === 'sunday' ? 'Sunday' : dayType === 'saturday' ? 'Saturday/Holiday' : dayType === 'friday' ? 'Friday' : 'Working Days (Mon–Thu)';

  // Route 8 runs every day, so Sunday is no longer routeless — ask the data.
  const hasSpecialRoutes =
    (schedule.palakkadTown?.length ?? 0) > 0 || (schedule.wisePark?.length ?? 0) > 0;

  /**
   * Whether the bus at `index` of the *full* day's list is a doubled one.
   *
   * Positional, because a display time is ambiguous: "8:30" appears twice in a
   * weekday and only the morning one is doubled, so matching by string badged
   * the 8:30 PM bus too. Falls back to the string list when the API predates
   * `multipleBusPositions`.
   */
  const isMultipleBus = (time: string, index: number, direction: Direction): boolean => {
    const cleanTime = time.replace(/\*$/, '');
    const positions = schedule.multipleBusPositions?.[direction];
    if (positions) return positions.includes(index);
    return schedule.multipleBusTimings?.[direction]?.includes(cleanTime) || false;
  };

  const NextRideHero = ({ ride, direction }: { ride: Ride; direction: Direction }) => {
    const isBuggy = ride.mode === 'buggy';

    return (
      <div
        className={`p-4 rounded-lg border-2 ${
          isBuggy
            ? 'bg-emerald-500/10 border-emerald-500/40'
            : 'bg-primary/10 border-primary'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1.5">
              {isBuggy ? <CarFront className="h-3.5 w-3.5 text-emerald-500" /> : <Bus className="h-3.5 w-3.5 text-primary" />}
              {isBuggy ? 'Next Buggy' : 'Next Bus'}
            </p>
            <div className="flex items-center gap-2">
              <p className={`text-2xl font-bold ${isBuggy ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'}`}>
                {ride.time}
              </p>
              {/* The hero hid this, so a doubled next bus looked ordinary. */}
              {!isBuggy && isMultipleBus(ride.time, ride.index, direction) && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  x2
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">Leaves in</p>
            <p className={`text-xl font-semibold ${isBuggy ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'}`}>
              {formatTimeUntil(ride.at, currentTime)}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const DepartureList = ({ direction }: { direction: Direction }) => {
    const { bus, buggy } = ridesFor(direction);
    const hasNilaParkingBus = schedule[direction].some((t) => t.includes('*'));

    // Live view leads with the next of each kind, so those two are lifted out
    // of the grid below by identity rather than by position.
    const heroes = isPreviewMode
      ? []
      : [bus[0], showBuggies ? buggy[0] : undefined].filter((ride): ride is Ride => Boolean(ride));

    const listed = showBuggies ? mergeRides(bus, buggy) : bus;
    const grid = listed.filter((ride) => !heroes.includes(ride));

    if (listed.length === 0) {
      return (
        <p className="text-center text-muted-foreground py-8">
          No more {showBuggies ? 'buses or buggies' : 'buses'} today. Check another date or see full schedule.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        {heroes.map((ride) => (
          <NextRideHero key={ride.mode} ride={ride} direction={direction} />
        ))}

        {isPreviewMode && (
          <p className="text-sm text-center text-muted-foreground mb-2">
            All scheduled {showBuggies ? 'buses and buggies' : 'buses'} for this day
          </p>
        )}

        {showBuggies && noBuggiesToday && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">No buggy service on Sundays.</span>{' '}
              Buggies run on working days and on Saturdays / institute holidays only.
            </p>
          </div>
        )}

        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mt-4">
          {grid.map((ride) => (
            <div
              key={`${ride.mode}-${ride.index}`}
              className={`p-3 text-center rounded-lg transition-colors relative ${
                ride.mode === 'buggy'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {ride.mode === 'buggy' ? (
                <CarFront className="h-3 w-3 mx-auto mb-1 text-emerald-500" />
              ) : (
                <Clock className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
              )}
              <p
                className={`text-xs sm:text-sm font-medium ${
                  ride.mode === 'buggy' ? 'text-emerald-700 dark:text-emerald-300' : ''
                }`}
              >
                {ride.time}
              </p>
              {ride.mode === 'bus' && isMultipleBus(ride.time, ride.index, direction) && (
                <Badge variant="secondary" className="absolute -top-1 -right-1 h-5 px-1.5 text-[10px]">
                  x2
                </Badge>
              )}
            </div>
          ))}
        </div>

        {hasNilaParkingBus && (
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5 font-medium">
            <span className="text-primary font-bold">*</span>
            <span>This bus goes only up to Nila Parking.</span>
          </p>
        )}
      </div>
    );
  };

  const RouteTimeline = ({ route }: { route: string }) => {
    const steps = route.split('→').map(s => s.trim());

    return (
      <div className="relative pl-4 border-l-2 border-muted py-2 space-y-6">
        {steps.map((step, idx) => {
          // Highlight times in the text (e.g., 8:25 AM)
          const timeMatch = step.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
          const time = timeMatch ? timeMatch[0] : null;
          const text = step.replace(time || '', '').replace(/\(\s*\)/g, '').trim();

          return (
            <div key={idx} className="relative">
              {/* Timeline dot */}
              <div className={`absolute -left-[21px] top-1.5 h-3 w-3 rounded-full border-2 ${idx === 0 || idx === steps.length - 1
                ? 'border-primary bg-primary'
                : 'border-muted-foreground bg-background'
                }`} />

              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                <span className="text-sm font-medium text-foreground">{text}</span>
                {time && (
                  <Badge variant="outline" className="w-fit text-xs font-bold bg-primary/5 border-primary/20">
                    {time}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ... (existing helper functions)

  const extractRouteSummary = (routeDescription: string) => {
    const steps = routeDescription.split('→').map(s => s.trim());
    const startStep = steps[0];
    const endStep = steps[steps.length - 1];

    const timeMatch = startStep.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
    const startTime = timeMatch ? timeMatch[0] : '';

    // Clean up locations by removing times
    const startLoc = startStep.replace(startTime, '').replace(/\(\s*\)/g, '').trim();
    // For end location, removing time if present at the end
    const endTimeMatch = endStep.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
    const endLoc = endStep.replace(endTimeMatch ? endTimeMatch[0] : '', '').replace(/\(\s*\)/g, '').trim();

    return {
      time: startTime,
      startLoc: startLoc
    };
  };

  return (
    <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
      {/* Stacked on a phone: side by side, the title wrapped to three lines. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/8 rounded-xl shrink-0">
            <Bus className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">Bus &amp; Buggy Schedule</h2>
            <p className="text-sm text-muted-foreground">
              {scheduleLabel} timings · from {busEffectiveFrom}
            </p>
          </div>
        </div>

        {/* Buggies are off by default: most people are here for the bus. */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          <Label htmlFor="show-buggies" className="text-sm text-muted-foreground cursor-pointer">
            Show buggies
          </Label>
          <Switch
            id="show-buggies"
            checked={showBuggies}
            onCheckedChange={setShowBuggies}
            className="data-[state=checked]:bg-emerald-500"
          />
        </div>
      </div>

      {showBuggies && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50" />
            Bus
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Buggy (electric shuttle)
          </span>
        </div>
      )}

      <Tabs defaultValue="nila-sahyadri" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="nila-sahyadri">Nila → Sahyadri</TabsTrigger>
          <TabsTrigger value="sahyadri-nila">Sahyadri → Nila</TabsTrigger>
        </TabsList>

        <TabsContent value="nila-sahyadri">
          <DepartureList direction="nilaToSahyadri" />
        </TabsContent>

        <TabsContent value="sahyadri-nila">
          <DepartureList direction="sahyadriToNila" />
        </TabsContent>
      </Tabs>

      {!hasSpecialRoutes ? (
        <div className="mt-6 p-4 rounded-lg bg-muted text-center border-2 border-dashed">
          <p className="text-muted-foreground font-medium">No Palakkad Town or Wise Park bus services on this day.</p>
        </div>
      ) : (
        (
          <Collapsible open={showExtraRoutes} onOpenChange={setShowExtraRoutes} className="mt-6">
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full flex justify-between items-center p-4 h-auto border-2 border-dashed border-muted hover:border-primary/50 hover:bg-muted/50 hover:text-foreground text-foreground transition-all">
                <span className="font-semibold text-lg">Special Routes</span>
                {showExtraRoutes ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 space-y-6 animate-in slide-in-from-top-2">
              {(schedule.palakkadTown?.length ?? 0) > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-1 flex-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                    <h3 className="font-bold text-primary whitespace-nowrap">Palakkad Town</h3>
                    <div className="h-1 flex-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                  </div>
                  <Accordion type="single" collapsible className="w-full space-y-2">
                    {schedule.palakkadTown.map((route, idx) => {
                      const summary = extractRouteSummary(route.description);
                      return (
                        <AccordionItem key={idx} value={`pt-${idx}`} className="border rounded-lg bg-muted/30 px-2">
                          <AccordionTrigger className="hover:no-underline py-3">
                            <div className="flex flex-col items-start gap-1 text-left">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-bold">
                                  {summary.time}
                                </Badge>
                                <span className="text-sm font-medium">From {summary.startLoc}</span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-4 px-2">
                            <Card className="p-4 border-none shadow-sm bg-background/50">
                              <RouteTimeline route={route.description} />
                            </Card>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              )}
              {(schedule.wisePark?.length ?? 0) > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-1 flex-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                    <h3 className="font-bold text-primary whitespace-nowrap">Wise Park Junction</h3>
                    <div className="h-1 flex-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                  </div>
                  <Accordion type="single" collapsible className="w-full space-y-2">
                    {schedule.wisePark.map((route, idx) => {
                      const summary = extractRouteSummary(route.description);
                      return (
                        <AccordionItem key={idx} value={`wp-${idx}`} className="border rounded-lg bg-muted/30 px-2">
                          <AccordionTrigger className="hover:no-underline py-3">
                            <div className="flex flex-col items-start gap-1 text-left">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-bold">
                                  {summary.time}
                                </Badge>
                                <span className="text-sm font-medium">From {summary.startLoc}</span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-4 px-2">
                            <Card className="p-4 border-none shadow-sm bg-background/50">
                              <RouteTimeline route={route.description} />
                            </Card>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )
      )}

      {showBuggies && (
        <div className="mt-6 pt-3 border-t border-border/40 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
          <p>
            <span className="font-semibold text-foreground">Buggy disclaimer: </span>
            {BUGGY_DISCLAIMER} Buggy timings are effective from {buggyEffectiveFrom}.
          </p>
        </div>
      )}
    </Card>
  );
}
