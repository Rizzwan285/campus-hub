import { ExternalLink, MessageSquarePlus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FEEDBACK_FORM_URL } from '@/lib/feedbackForm';

export function FeedbackCard() {
  return (
    <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/8 rounded-xl">
          <MessageSquarePlus className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Feedback</h2>
          <p className="text-sm text-muted-foreground">Tell me what to fix or add</p>
        </div>
      </div>

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
    </Card>
  );
}
