import { useState } from 'react';
import { Bus, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getDayType } from '@/utils/dateUtils';
import { getUpcomingBuses, getNextBus, getTimeUntil } from '@/utils/dateUtils';
import { workingDaysBus, saturdayHolidayBus, sundayBus } from '@/data/busData';

interface BusScheduleCardProps {
  currentTime: Date;
  displayDate: Date;
}

export function BusScheduleCard({ currentTime, displayDate }: BusScheduleCardProps) {
  const [showExtraRoutes, setShowExtraRoutes] = useState(false);
  const dayType = getDayType(displayDate);

  // Use displayDate for filtering if it's different from currentTime
  const isPreviewMode = displayDate.toDateString() !== currentTime.toDateString();
  const filterTime = isPreviewMode ? new Date(displayDate) : currentTime;

  const schedule = dayType === 'sunday'
    ? sundayBus
    : dayType === 'saturday'
      ? saturdayHolidayBus
      : workingDaysBus;

  // For preview mode, show all buses. For current time, show only upcoming
  const upcomingNilaToSahyadri = isPreviewMode
    ? schedule.nilaToSahyadri
    : getUpcomingBuses(schedule.nilaToSahyadri, filterTime);
  const upcomingSahyadriToNila = isPreviewMode
    ? schedule.sahyadriToNila
    : getUpcomingBuses(schedule.sahyadriToNila, filterTime);

  const nextNilaToSahyadri = getNextBus(schedule.nilaToSahyadri, filterTime);
  const nextSahyadriToNila = getNextBus(schedule.sahyadriToNila, filterTime);

  const scheduleLabel = dayType === 'sunday' ? 'Sunday' : dayType === 'saturday' ? 'Saturday/Holiday' : 'Weekday';

  const isMultipleBus = (time: string, direction: 'nilaToSahyadri' | 'sahyadriToNila'): boolean => {
    return schedule.multipleBusTimings?.[direction]?.includes(time) || false;
  };

  const BusTimesList = ({ times, nextBus, direction }: { times: string[]; nextBus: string | null; direction: 'nilaToSahyadri' | 'sahyadriToNila' }) => {
    // Determine if we're in afternoon context for the next bus
    const isAfternoonContext = currentTime.getHours() >= 12;

    return (
      <div className="space-y-3">
        {times.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No more buses today. Check another date or see full schedule.
          </p>
        ) : (
          <>
            {nextBus && !isPreviewMode && (
              <div className="p-4 bg-primary/10 rounded-lg border-2 border-primary">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Next Bus</p>
                    <p className="text-2xl font-bold text-primary">{nextBus}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1">Leaves in</p>
                    <p className="text-xl font-semibold text-primary">
                      {getTimeUntil(nextBus, currentTime, isAfternoonContext)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isPreviewMode && (
              <p className="text-sm text-center text-muted-foreground mb-2">
                All scheduled buses for this day
              </p>
            )}

            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mt-4">
              {times.slice(!isPreviewMode && nextBus ? 1 : 0).map((time, idx) => (
                <div
                  key={idx}
                  className="p-3 text-center rounded-lg bg-muted hover:bg-muted/80 transition-colors relative"
                >
                  <Clock className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-sm font-medium">{time}</p>
                  {isMultipleBus(time, direction) && (
                    <Badge variant="secondary" className="absolute -top-1 -right-1 h-5 px-1.5 text-[10px]">
                      x2
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </>
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
          const text = step.replace(time || '', '').trim();

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
    const startLoc = startStep.replace(startTime, '').trim();
    // For end location, removing time if present at the end
    const endTimeMatch = endStep.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
    const endLoc = endStep.replace(endTimeMatch ? endTimeMatch[0] : '', '').trim();

    return {
      time: startTime,
      title: `${startLoc} → ${endLoc}`
    };
  };

  return (
    <Card className="p-6 bg-card hover:shadow-[var(--shadow-card-hover)] transition-all duration-300">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Bus className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Bus Schedule</h2>
          <p className="text-sm text-muted-foreground">{scheduleLabel} timings</p>
        </div>
      </div>

      <Tabs defaultValue="nila-sahyadri" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="nila-sahyadri">Nila → Sahyadri</TabsTrigger>
          <TabsTrigger value="sahyadri-nila">Sahyadri → Nila</TabsTrigger>
        </TabsList>

        <TabsContent value="nila-sahyadri">
          <BusTimesList times={upcomingNilaToSahyadri} nextBus={nextNilaToSahyadri} direction="nilaToSahyadri" />
        </TabsContent>

        <TabsContent value="sahyadri-nila">
          <BusTimesList times={upcomingSahyadriToNila} nextBus={nextSahyadriToNila} direction="sahyadriToNila" />
        </TabsContent>
      </Tabs>

      {(schedule.palakkadTown || schedule.wisePark) && (
        <Collapsible open={showExtraRoutes} onOpenChange={setShowExtraRoutes} className="mt-6">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full flex justify-between items-center p-4 h-auto border-2 border-dashed border-muted hover:border-primary/50 hover:bg-muted/50 transition-all">
              <span className="font-semibold text-lg">Special Routes</span>
              {showExtraRoutes ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-6 animate-in slide-in-from-top-2">
            {schedule.palakkadTown && (
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
                              <span className="text-sm font-medium">{summary.title}</span>
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
            {schedule.wisePark && (
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
                              <span className="text-sm font-medium">{summary.title}</span>
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
      )}
    </Card>
  );
}
