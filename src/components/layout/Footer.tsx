import { AlertCircle, MessageSquarePlus } from 'lucide-react';
import { FEEDBACK_FORM_URL } from '@/lib/feedbackForm';

export function Footer() {
  return (
    <footer className="mt-12 text-center space-y-6">
      <div className="inline-flex items-center gap-2 px-4 py-3 bg-muted/50 rounded-lg text-sm text-muted-foreground max-w-3xl text-left sm:text-center">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <p>
          <strong>Disclaimer:</strong> The displayed information is subject to change. 
          Please check your institute email and official updates for the latest menu and bus timings.
        </p>
      </div>
      
      <div className="flex justify-center">
        <a
          href={FEEDBACK_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 bg-card text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <MessageSquarePlus className="h-4 w-4 text-primary" />
          Share feedback or report a problem
        </a>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground pb-8">
        <p className="font-medium text-foreground/80">
          Created by Muhamed Rizwan (142301026)
        </p>
        <p>
          Contact me for queries or any issues on the email <a href="mailto:142301026@smail.iitpkd.ac.in" className="text-primary hover:underline">142301026@smail.iitpkd.ac.in</a> and Mobile <a href="tel:+919207267393" className="text-primary hover:underline">9207267393</a>.
        </p>
      </div>
    </footer>
  );
}
