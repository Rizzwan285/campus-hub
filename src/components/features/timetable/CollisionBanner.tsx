import { AlertTriangle } from 'lucide-react';
import { Collision } from '@/engine/types';

interface CollisionBannerProps {
  collisions: Collision[];
}

export function CollisionBanner({ collisions }: CollisionBannerProps) {
  const handleScrollToCollision = (courseId: string) => {
    // We can find the DOM element using aria-label or just data-attributes.
    // The easiest way is to look for elements containing the course code.
    const code = courseId.split('_').pop();
    if (!code) return;
    
    // Find all elements with this text
    const elements = document.querySelectorAll(`[aria-label*="${code}"]`);
    if (elements.length > 0) {
      elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a quick flash effect
      (elements[0] as HTMLElement).classList.add('ring-4', 'ring-destructive');
      setTimeout(() => {
        (elements[0] as HTMLElement).classList.remove('ring-4', 'ring-destructive');
      }, 2000);
    }
  };

  return (
    <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 shadow-sm animate-in fade-in slide-in-from-top-2">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-destructive">Schedule Conflicts Detected</h4>
          <p className="text-sm text-destructive/80 mt-1 mb-3">
            You have overlapping courses. Please update your selections:
          </p>
          <ul className="space-y-2">
            {collisions.map((c, idx) => {
              const codeA = c.courseIdA.split('_').pop();
              const codeB = c.courseIdB.split('_').pop();
              
              return (
                <li key={idx} className="text-sm bg-background/50 p-2 rounded border border-destructive/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold cursor-pointer hover:underline" onClick={() => handleScrollToCollision(c.courseIdA)}>{codeA}</span>
                    <span className="mx-1.5 text-muted-foreground">overlaps with</span>
                    <span className="font-semibold cursor-pointer hover:underline" onClick={() => handleScrollToCollision(c.courseIdB)}>{codeB}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium bg-destructive/5 text-destructive px-2 py-1 rounded">
                    <span>{c.conflictingDay}</span>
                    <span>•</span>
                    <span>{c.timeWindow.replace(' - ', '–')}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
