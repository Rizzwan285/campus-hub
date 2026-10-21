import { ExternalLink, FileText, ClipboardList, Info, Link } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUserStore } from '@/store/useUserStore';
import { docUrl } from '@/lib/documentUrl';

const campusLinks = [
  { title: 'SAC Website', description: 'Student Affairs Council', href: 'https://saciitpkd.github.io/website/' },
  { title: 'Moodle', description: 'Learning Management System', href: 'https://lms.iitpkd.ac.in/' },
  { title: 'Fedena', description: 'Records Portal', href: 'https://records.iitpkd.ac.in/' },
  { title: 'Institute Dashboard', description: 'IIT Palakkad Dashboard', href: 'https://dashboard.iitpkd.ac.in/' },
];

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
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-foreground mb-1">Overnight / Long Leave Form</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Students who wish to go out of Palakkad town/campus for overnight or longer need to fill this form at least <strong>one day prior</strong> to leave.
                </p>
                <Button asChild className="w-full sm:w-auto h-auto min-h-10 whitespace-normal">
                  <a href={leaveFormLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2">
                    Open Leave Form ({userMess === 'nila' ? 'Nila' : 'Kedaram'} Mess)
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <div>
            <a 
              href={docUrl('Hostel Rules.pdf')}
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="p-2 bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 rounded-lg group-hover:scale-110 transition-transform">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm truncate">Hostel Rules</h4>
                <p className="text-xs text-muted-foreground">PDF Document</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            </a>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] rounded-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/8 rounded-xl">
            <Link className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Campus Resources</h2>
            <p className="text-sm text-muted-foreground">Academic calendar and institute portals</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href={docUrl('Academic_Calender2026.pdf')}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors sm:col-span-2"
          >
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm">Academic Calendar (2026)</h3>
              <p className="text-xs text-muted-foreground">PDF Document</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          </a>
          {campusLinks.map(({ title, description, href }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm">{title}</h3>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
