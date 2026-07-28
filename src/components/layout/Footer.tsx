import { AlertCircle } from 'lucide-react';

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
