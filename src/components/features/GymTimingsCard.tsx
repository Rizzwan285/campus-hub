import { ExternalLink, FileText, Dumbbell, Clock, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { docUrl } from '@/lib/documentUrl';

export function GymTimingsCard() {
  return (
    <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/8 rounded-xl">
            <Dumbbell className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Gym Timings</h2>
            <p className="text-sm text-muted-foreground">Kedaram & Malhar Gyms (2026)</p>
          </div>
        </div>
        <a
          href={docUrl('Gym Timing 2026.pdf')}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium px-3 py-1.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 transition-colors"
        >
          <FileText className="h-3.5 w-3.5 text-primary" />
          <span className="hidden sm:inline">Official Circular</span>
          <span className="sm:hidden">PDF</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="flex items-start gap-3 mb-6 p-4 rounded-xl bg-primary/5 border border-primary/20">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm">
          Gym Instructor is available from <strong>6:00 AM to 8:30 AM</strong>.
        </p>
      </div>

      <Tabs defaultValue="kedaram" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/50 p-1">
          <TabsTrigger value="kedaram" className="rounded-lg">Kedaram Gym</TabsTrigger>
          <TabsTrigger value="malhar" className="rounded-lg">Malhar Gym</TabsTrigger>
        </TabsList>
        
        <TabsContent value="kedaram" className="space-y-3 mt-4 animate-in fade-in-50 duration-300">
          <div className="text-sm font-medium mb-1 text-muted-foreground px-1">The following slots are applicable on all days.</div>
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                <span className="font-medium">5:30 am – 8:00 am</span>
              </div>
              <div className="text-sm text-muted-foreground sm:text-right">
                Institute employees, PhD, MSc and MTech students
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                <span className="font-medium">8:00 am – 11:00 am</span>
              </div>
              <div className="text-sm text-muted-foreground sm:text-right">
                <Badge variant="secondary" className="font-normal">Common (open to all)</Badge>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                <span className="font-medium">4:00 pm – 6:00 pm</span>
              </div>
              <div className="text-sm text-muted-foreground sm:text-right">
                BTech 2nd and 4th year students
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                <span className="font-medium">6:00 pm – 8:00 pm</span>
              </div>
              <div className="text-sm text-muted-foreground sm:text-right leading-relaxed">
                BTech 1st and 3rd year students, institute employees, PhD, MTech and MSc students
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                <span className="font-medium">8:00 pm – 10:00 pm</span>
              </div>
              <div className="text-sm text-muted-foreground sm:text-right">
                <Badge variant="secondary" className="font-normal">Common (open to all)</Badge>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="malhar" className="space-y-5 mt-4 animate-in fade-in-50 duration-300">
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 px-1 text-foreground/80">
              <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
              Morning
            </h3>
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                  <span className="font-medium">5:30 am – 8:00 am</span>
                </div>
                <div className="text-sm text-muted-foreground sm:text-right">
                  BTech students and Aquatics Team (all days)
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                  <span className="font-medium">8:00 am – 11:00 am</span>
                </div>
                <div className="text-sm text-muted-foreground sm:text-right">
                  <Badge variant="secondary" className="font-normal">Common (Students)</Badge>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 px-1 text-foreground/80">
              <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
              Evening
            </h3>
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-pink-500/5 border border-pink-500/20 gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-pink-500/10 rounded-lg"><Clock className="h-4 w-4 text-pink-600 dark:text-pink-400" /></div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-pink-900 dark:text-pink-200">4:00 pm – 6:00 pm</span>
                      <Badge variant="outline" className="bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/30 text-[10px] h-5 px-1.5">All Days</Badge>
                    </div>
                    <div className="text-xs text-pink-700/80 dark:text-pink-300/80 mt-0.5">Exclusively for women</div>
                  </div>
                </div>
                <div className="text-sm font-medium text-pink-900 dark:text-pink-200 sm:text-right">
                  Women students
                </div>
              </div>
              
              <div className="p-4 rounded-xl bg-card border border-border/50 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4 border-b border-border/50 pb-3">
                  <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                  <span className="font-medium">6:00 pm – 8:00 pm <span className="text-muted-foreground font-normal">(Team Allotments)</span></span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div className="flex justify-between items-center py-1 border-b border-border/30 sm:border-none"><span className="font-medium text-muted-foreground">Monday</span><span className="font-medium text-right">Institute Basketball Team</span></div>
                  <div className="flex justify-between items-center py-1 border-b border-border/30 sm:border-none"><span className="font-medium text-muted-foreground">Tuesday</span><span className="font-medium text-right">Institute Athletics Team</span></div>
                  <div className="flex justify-between items-center py-1 border-b border-border/30 sm:border-none"><span className="font-medium text-muted-foreground">Wednesday</span><span className="font-medium text-right">Institute Football Team</span></div>
                  <div className="flex justify-between items-center py-1 border-b border-border/30 sm:border-none"><span className="font-medium text-muted-foreground">Thursday</span><span className="font-medium text-right">Institute Cricket Team</span></div>
                  <div className="flex justify-between items-center py-1"><span className="font-medium text-muted-foreground">Friday</span><span className="font-medium text-right">Institute Athletics Team</span></div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6 pt-4 border-t border-border/50">
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <a href={docUrl('Gym Regulations.pdf')} target="_blank" rel="noopener noreferrer">
            <FileText className="h-4 w-4 mr-2" />
            Gym Regulations
            <ExternalLink className="h-4 w-4 ml-2" />
          </a>
        </Button>
      </div>
    </Card>
  );
}
