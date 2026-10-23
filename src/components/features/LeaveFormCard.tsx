import { ExternalLink, Info, ClipboardList } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUserStore } from '@/store/useUserStore';

// Each mess collects its own leave requests, so the form follows the profile.
const LEAVE_FORMS = {
  nila: 'https://docs.google.com/forms/d/e/1FAIpQLSeOdQLU5v6K1OGEFU9PtGkGHjCDf_awie4kiAPqMqNBsLzzhA/viewform',
  kedaram: 'https://docs.google.com/forms/d/e/1FAIpQLSenga-fgK_f1CaFiOHvKoSJDFV29ygZV17c5KBpYwYjnWfhDQ/viewform',
};

export function LeaveFormCard() {
  const profile = useUserStore((state) => state.profile);
  const userMess = profile?.mess?.toLowerCase() === 'nila' ? 'nila' : 'kedaram';

  return (
    <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/8 rounded-xl">
          <ClipboardList className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Leave Form</h2>
          <p className="text-sm text-muted-foreground">Overnight and long leaves</p>
        </div>
      </div>

      <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-foreground mb-1">Overnight / Long Leave Form</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Students who wish to go out of Palakkad town/campus for overnight or longer need to fill this form at least <strong>one day prior</strong> to leave.
            </p>
            <Button asChild className="w-full sm:w-auto h-auto min-h-10 whitespace-normal">
              <a href={LEAVE_FORMS[userMess]} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2">
                Open Leave Form ({userMess === 'nila' ? 'Nila' : 'Kedaram'} Mess)
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
