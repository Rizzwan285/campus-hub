import { ExternalLink, FileText, Dumbbell, ClipboardList, Clock, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserStore } from '@/store/useUserStore';

export function ImportantLinksCard() {
  const profile = useUserStore((state) => state.profile);
  const userMess = profile?.mess?.toLowerCase() || 'kedaram';
  
  const leaveFormLink = userMess === 'nila' 
    ? 'https://docs.google.com/forms/d/e/1FAIpQLSeOdQLU5v6K1OGEFU9PtGkGHjCDf_awie4kiAPqMqNBsLzzhA/viewform'
    : 'https://docs.google.com/forms/d/e/1FAIpQLSenga-fgK_f1CaFiOHvKoSJDFV29ygZV17c5KBpYwYjnWfhDQ/viewform';

  return (
    <div className="space-y-6">
      {/* Leave Forms & Rules */}
      <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/8 rounded-xl">
            <ClipboardList className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Leave Forms & Guidelines</h2>
            <p className="text-sm text-muted-foreground">Overnight leaves and campus rules</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <h3 className="font-medium text-foreground mb-1">Overnight / Long Leave Form</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Students who wish to go out of Palakkad town/campus for overnight or longer need to fill this form at least <strong>one day prior</strong> to leave.
                </p>
                <Button asChild className="w-full sm:w-auto">
                  <a href={leaveFormLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2">
                    Open Leave Form ({userMess === 'nila' ? 'Nila' : 'Kedaram'} Mess)
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a 
              href="/mess_bus_details/docs/Hostel Rules.pdf" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="p-2 bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 rounded-lg group-hover:scale-110 transition-transform">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-sm">Hostel Rules</h4>
                <p className="text-xs text-muted-foreground">PDF Document</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </a>

            <a 
              href="/mess_bus_details/docs/Gym Regulations.pdf" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="p-2 bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 rounded-lg group-hover:scale-110 transition-transform">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-sm">Gym Regulations</h4>
                <p className="text-xs text-muted-foreground">PDF Document</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </a>
          </div>
        </div>
      </Card>

      {/* Gym Timings */}
      <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/8 rounded-xl">
            <Dumbbell className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Gym Timings</h2>
            <p className="text-sm text-muted-foreground">Kedaram & Malhar Gyms (2026)</p>
          </div>
        </div>

        <Tabs defaultValue="kedaram" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/50 p-1">
            <TabsTrigger value="kedaram" className="rounded-lg">Kedaram Gym</TabsTrigger>
            <TabsTrigger value="malhar" className="rounded-lg">Malhar Gym</TabsTrigger>
          </TabsList>
          
          <TabsContent value="kedaram" className="space-y-3 mt-4 animate-in fade-in-50 duration-300">
            <div className="text-sm font-medium mb-1 text-muted-foreground px-1">Applicable on all days</div>
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                  <span className="font-medium">5:30 AM - 8:00 AM</span>
                </div>
                <div className="text-sm text-muted-foreground sm:text-right">
                  Institute employees, PhD, MSc & MTech
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                  <span className="font-medium">8:00 AM - 11:00 AM</span>
                </div>
                <div className="text-sm text-muted-foreground sm:text-right">
                  <Badge variant="secondary" className="font-normal">Common (Open to all)</Badge>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                  <span className="font-medium">4:00 PM - 6:00 PM</span>
                </div>
                <div className="text-sm text-muted-foreground sm:text-right">
                  BTech 2nd & 4th year
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                  <span className="font-medium">6:00 PM - 8:00 PM</span>
                </div>
                <div className="text-sm text-muted-foreground sm:text-right leading-relaxed">
                  BTech 1st & 3rd year, Employees, <br className="hidden sm:block" />PhD, MTech, MSc
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                  <span className="font-medium">8:00 PM - 10:00 PM</span>
                </div>
                <div className="text-sm text-muted-foreground sm:text-right">
                  <Badge variant="secondary" className="font-normal">Common (Open to all)</Badge>
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
                    <span className="font-medium">5:30 AM - 8:00 AM</span>
                  </div>
                  <div className="text-sm text-muted-foreground sm:text-right">
                    BTech & Aquatics Team (All days)
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 shadow-sm gap-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                    <span className="font-medium">8:00 AM - 11:00 AM</span>
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
                        <span className="font-semibold text-pink-900 dark:text-pink-200">4:00 PM - 6:00 PM</span>
                        <Badge variant="outline" className="bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/30 text-[10px] h-5 px-1.5">All Days</Badge>
                      </div>
                      <div className="text-xs text-pink-700/80 dark:text-pink-300/80 mt-0.5">Exclusively for women</div>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-pink-900 dark:text-pink-200 sm:text-right">
                    Women Students
                  </div>
                </div>
                
                <div className="p-4 rounded-xl bg-card border border-border/50 shadow-sm">
                  <div className="flex items-center gap-2.5 mb-4 border-b border-border/50 pb-3">
                    <div className="p-1.5 bg-primary/10 rounded-md"><Clock className="h-4 w-4 text-primary" /></div>
                    <span className="font-medium">6:00 PM - 8:00 PM <span className="text-muted-foreground font-normal">(Team Allotments)</span></span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div className="flex justify-between items-center py-1 border-b border-border/30 sm:border-none"><span className="font-medium text-muted-foreground">Monday</span><span className="font-medium text-right">Basketball Team</span></div>
                    <div className="flex justify-between items-center py-1 border-b border-border/30 sm:border-none"><span className="font-medium text-muted-foreground">Tuesday</span><span className="font-medium text-right">Athletics Team</span></div>
                    <div className="flex justify-between items-center py-1 border-b border-border/30 sm:border-none"><span className="font-medium text-muted-foreground">Wednesday</span><span className="font-medium text-right">Football Team</span></div>
                    <div className="flex justify-between items-center py-1 border-b border-border/30 sm:border-none"><span className="font-medium text-muted-foreground">Thursday</span><span className="font-medium text-right">Cricket Team</span></div>
                    <div className="flex justify-between items-center py-1"><span className="font-medium text-muted-foreground">Friday</span><span className="font-medium text-right">Athletics Team</span></div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
