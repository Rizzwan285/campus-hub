import { ExternalLink, MessageSquarePlus } from 'lucide-react';
import { FeatureCard, FeatureCardHeader } from './FeatureCard';
import { Button } from '@/components/ui/button';
import { FEEDBACK_FORM_URL } from '@/lib/feedbackForm';

export function FeedbackCard() {
  return (
    <FeatureCard id="feedback" accent="emerald">
      <FeatureCardHeader icon={MessageSquarePlus} title="Feedback" subtitle="Tell me what to fix or add" />

      <p className="text-sm text-muted-foreground mb-4">
        Spotted a wrong timing, a missing course or a menu that does not match
        the mess? Have an idea for something this app should show? Send it
        through the feedback form — it reaches me directly.
      </p>

      <Button asChild className="w-full sm:w-auto h-auto min-h-10 whitespace-normal">
        <a
          href={FEEDBACK_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2"
        >
          Open Feedback Form
          <ExternalLink className="h-4 w-4" />
        </a>
      </Button>
    </FeatureCard>
  );
}
