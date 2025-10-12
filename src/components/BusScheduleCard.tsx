import { useState } from 'react';
import { Bus, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

  const BusTimesList = ({ times, nextBus }: { times: string[]; nextBus: string | null }) => (
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
                    {getTimeUntil(nextBus, currentTime)}
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
                className="p-3 text-center rounded-lg bg-muted hover:bg-muted/80 transition-colors"
              >
                <Clock className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-medium">{time}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

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
          <BusTimesList times={upcomingNilaToSahyadri} nextBus={nextNilaToSahyadri} />
        </TabsContent>
        
        <TabsContent value="sahyadri-nila">
          <BusTimesList times={upcomingSahyadriToNila} nextBus={nextSahyadriToNila} />
        </TabsContent>
      </Tabs>

      {(schedule.palakkadTown || schedule.wisePark) && (
        <Collapsible open={showExtraRoutes} onOpenChange={setShowExtraRoutes} className="mt-6">
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full">
              {showExtraRoutes ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
              Palakkad Town & Wise Park Routes
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-4">
            {schedule.palakkadTown && (
              <div>
                <h3 className="font-semibold mb-2 text-primary">Palakkad Town</h3>
                <div className="space-y-2">
                  {schedule.palakkadTown.map((route, idx) => (
                    <div key={idx} className="p-3 bg-muted/50 rounded-lg text-sm">
                      {route.description}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {schedule.wisePark && (
              <div>
                <h3 className="font-semibold mb-2 text-primary">Wise Park Junction</h3>
                <div className="space-y-2">
                  {schedule.wisePark.map((route, idx) => (
                    <div key={idx} className="p-3 bg-muted/50 rounded-lg text-sm">
                      {route.description}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
}
