import { AlertCircle } from 'lucide-react';

export function Footer() {
  return (
    <footer className="mt-12 text-center">
      <div className="inline-flex items-center gap-2 px-4 py-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <p>
          <strong>Disclaimer:</strong> The displayed information is subject to change. 
          Please check your institute email and official updates for the latest menu and bus timings.
        </p>
      </div>
    </footer>
  );
}
