import { ExternalLink, Info, ClipboardList, Settings } from 'lucide-react';
import { FeatureCard, FeatureCardHeader } from './FeatureCard';
import { Button } from '@/components/ui/button';
import { useUserStore } from '@/store/useUserStore';

// Each mess collects its own leave requests, so the form follows the profile.
const LEAVE_FORMS = {
  nila: 'https://docs.google.com/forms/d/e/1FAIpQLSeOdQLU5v6K1OGEFU9PtGkGHjCDf_awie4kiAPqMqNBsLzzhA/viewform',
  kedaram: 'https://docs.google.com/forms/d/e/1FAIpQLSenga-fgK_f1CaFiOHvKoSJDFV29ygZV17c5KBpYwYjnWfhDQ/viewform',
};

interface LeaveFormCardProps {
  /** Opens Account & settings, where the mess is changed. Absent in local-only mode. */
  onChangeMess?: () => void;
}

export function LeaveFormCard({ onChangeMess }: LeaveFormCardProps) {
  const profile = useUserStore((state) => state.profile);
  const userMess = profile?.mess?.toLowerCase() === 'nila' ? 'nila' : 'kedaram';

  return (
    <FeatureCard accent="sky">
      <FeatureCardHeader icon={ClipboardList} title="Leave Form" subtitle="Overnight and long leaves" />

      <div className="rounded-xl p-4 bg-gradient-to-br from-sky-500/15 to-transparent border border-sky-500/30">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-sky-600 dark:text-sky-300 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-foreground mb-1">Overnight / Long Leave Form</h4>
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

      {/* The form follows the mess in the profile, so a stale mess opens the wrong form. */}
      <p className="flex items-start gap-2 text-xs text-muted-foreground mt-3">
        <Settings className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        {onChangeMess ? (
          <span>
            Has your mess changed?{' '}
            <button type="button" onClick={onChangeMess} className="font-medium text-primary underline underline-offset-2 hover:no-underline">
              Update it in Settings
            </button>{' '}
            so this opens your current mess's form.
          </span>
        ) : (
          <span>
            Has your mess changed? Sign out (top right) and choose your current mess again, so this opens its form.
          </span>
        )}
      </p>
    </FeatureCard>
  );
}
