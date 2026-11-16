import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/** Scrolls to `#section` once the page has rendered (React Router does not). */
function useScrollToHash() {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(timer);
  }, [hash, pathname]);
}

/** The column every secondary student page uses: one width, one rhythm. */
export function PageSections({ children }: { children: ReactNode }) {
  useScrollToHash();
  return (
    <div className="max-w-3xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {children}
    </div>
  );
}

interface PageSectionProps {
  /** Anchor for links such as /campus#gym; listed in PAGE_SECTIONS. */
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}

/** A titled group of cards for one thing a student is trying to do. */
export function PageSection({ id, title, description, children }: PageSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-3">
      <div className="px-1">
        <h2 id={`${id}-title`} className="text-sm font-semibold uppercase tracking-wider text-primary/90">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
