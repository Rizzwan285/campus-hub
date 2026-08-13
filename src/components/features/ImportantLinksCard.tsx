import { ExternalLink, FileText, Dumbbell, ClipboardList, Clock, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
            <p className="text-sm text-muted-foreground">Kedaram & Malhar Gyms</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 p-4 rounded-xl bg-muted/30 border border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-primary" />
                <h3 className="font-medium">Morning Slot</h3>
              </div>
              <p className="text-2xl font-bold text-foreground">5:00 AM</p>
              <p className="text-sm text-muted-foreground font-medium">to 12:00 PM</p>
            </div>
            
            <div className="flex-1 p-4 rounded-xl bg-muted/30 border border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-primary" />
                <h3 className="font-medium">Evening Slot</h3>
              </div>
              <p className="text-2xl font-bold text-foreground">3:00 PM</p>
              <p className="text-sm text-muted-foreground font-medium">to 10:00 PM</p>
            </div>
          </div>

          <div className="mt-4 p-4 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-900 dark:text-pink-200">
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30 shrink-0 mt-0.5">
                Women Only
              </Badge>
              <div>
                <p className="font-medium">5:00 PM to 6:00 PM</p>
                <p className="text-sm mt-1 opacity-90">
                  This slot is exclusively for women in the <strong>Malhar Gym</strong>. 
                  Boys entry is strictly prohibited during this time.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
