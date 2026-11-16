import { ExternalLink, FileText, Dumbbell, Clock, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { docUrl } from '@/lib/documentUrl';
import { FeatureCard, FeatureCardHeader } from './FeatureCard';

/** From the 2026 gym timing circular (public/docs/Gym Timing 2026.pdf). */
interface Slot {
  time: string;
  who: string;
  /** Open to everyone in that group: shown as a badge rather than a list of people. */
  common?: boolean;
}

const KEDARAM: Slot[] = [
  { time: '5:30 am – 8:00 am', who: 'Institute employees, PhD, MSc and MTech students' },
  { time: '8:00 am – 11:00 am', who: 'Common (open to all)', common: true },
  { time: '4:00 pm – 6:00 pm', who: 'BTech 2nd and 4th year students' },
  { time: '6:00 pm – 8:00 pm', who: 'BTech 1st and 3rd year students, institute employees, PhD, MTech and MSc students' },
  { time: '8:00 pm – 10:00 pm', who: 'Common (open to all)', common: true },
];

const MALHAR_MORNING: Slot[] = [
  { time: '5:30 am – 8:00 am', who: 'BTech students and Aquatics Team (all days)' },
  { time: '8:00 am – 11:00 am', who: 'Common (Students)', common: true },
];

const MALHAR_TEAMS: Array<[string, string]> = [
  ['Monday', 'Institute Basketball Team'],
  ['Tuesday', 'Institute Athletics Team'],
  ['Wednesday', 'Institute Football Team'],
  ['Thursday', 'Institute Cricket Team'],
  ['Friday', 'Institute Athletics Team'],
];

function SlotList({ slots }: { slots: Slot[] }) {
  return (
    <ul className="divide-y divide-border/50 rounded-xl border border-border/50 px-3.5">
      {slots.map((slot) => (
        <li key={slot.time} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4 py-3">
          <span className="flex items-center gap-2 font-medium tabular-nums shrink-0">
            <Clock className="h-4 w-4 text-rose-500 dark:text-rose-300" aria-hidden="true" />
            {slot.time}
          </span>
          {slot.common ? (
            <Badge variant="secondary" className="font-normal w-fit">{slot.who}</Badge>
          ) : (
            <span className="text-sm text-muted-foreground sm:text-right">{slot.who}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

const subheading = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1';

export function GymTimingsCard() {
  return (
    <FeatureCard id="gym-timings" accent="rose">
      <FeatureCardHeader
        icon={Dumbbell}
        title="Gym Timings"
        subtitle="Kedaram & Malhar Gyms (2026)"
        aside={
          <a
            href={docUrl('Gym Timing 2026.pdf')}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium px-3 py-1.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 transition-colors shrink-0"
          >
            <FileText className="h-3.5 w-3.5 text-rose-500 dark:text-rose-300" aria-hidden="true" />
            <span className="hidden sm:inline">Official Circular</span>
            <span className="sm:hidden">PDF</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        }
      />

      <p className="flex items-start gap-2 text-sm mb-4 p-3 rounded-xl bg-gradient-to-br from-rose-500/15 to-transparent border border-rose-500/30">
        <Info className="h-4 w-4 text-rose-600 dark:text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Gym Instructor is available from <strong>6:00 AM to 8:30 AM</strong>.
        </span>
      </p>

      <Tabs defaultValue="kedaram" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/50 p-1">
          <TabsTrigger value="kedaram" className="rounded-lg">Kedaram Gym</TabsTrigger>
          <TabsTrigger value="malhar" className="rounded-lg">Malhar Gym</TabsTrigger>
        </TabsList>

        <TabsContent value="kedaram" className="mt-0 animate-in fade-in-50 duration-300">
          <p className={subheading}>Every day</p>
          <SlotList slots={KEDARAM} />
        </TabsContent>

        <TabsContent value="malhar" className="mt-0 space-y-4 animate-in fade-in-50 duration-300">
          <div>
            <p className={subheading}>Morning</p>
            <SlotList slots={MALHAR_MORNING} />
          </div>

          <div>
            <p className={subheading}>Evening</p>
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4 p-3.5 rounded-xl bg-pink-500/5 border border-pink-500/20">
                <div>
                  <span className="flex items-center gap-2 font-semibold text-pink-900 dark:text-pink-200 tabular-nums">
                    <Clock className="h-4 w-4 text-pink-600 dark:text-pink-400" aria-hidden="true" />
                    4:00 pm – 6:00 pm
                    <Badge variant="outline" className="bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/30 text-[10px] h-5 px-1.5">
                      All Days
                    </Badge>
                  </span>
                  <span className="block text-xs text-pink-700/80 dark:text-pink-300/80 mt-0.5">Exclusively for women</span>
                </div>
                <span className="text-sm font-medium text-pink-900 dark:text-pink-200">Women students</span>
              </div>

              <div className="rounded-xl border border-border/50 px-3.5 py-3">
                <p className="flex items-center gap-2 font-medium mb-2 tabular-nums">
                  <Clock className="h-4 w-4 text-rose-500 dark:text-rose-300" aria-hidden="true" />
                  6:00 pm – 8:00 pm <span className="text-muted-foreground font-normal">(Team Allotments)</span>
                </p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 text-sm divide-y divide-border/30 sm:divide-y-0">
                  {MALHAR_TEAMS.map(([day, team]) => (
                    <div key={day} className="flex justify-between gap-3 py-1.5">
                      <dt className="text-muted-foreground">{day}</dt>
                      <dd className="font-medium text-right">{team}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-4 pt-4 border-t border-border/50">
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <a href={docUrl('Gym Regulations.pdf')} target="_blank" rel="noopener noreferrer">
            <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
            Gym Regulations
            <ExternalLink className="h-4 w-4 ml-2" aria-hidden="true" />
          </a>
        </Button>
      </div>
    </FeatureCard>
  );
}
