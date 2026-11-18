import { useEffect, type MouseEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

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

/** "01", "02": the same number marks a section in the page's index and its heading. */
const sectionNumber = (number: number) => String(number).padStart(2, '0');

/** The column every secondary student page uses: one width, one rhythm. */
export function PageSections({ children }: { children: ReactNode }) {
  useScrollToHash();
  return (
    <div className="max-w-3xl mx-auto w-full space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {children}
    </div>
  );
}

export interface PageIndexEntry {
  id: string;
  /** Position on the page, shown as 01, 02… in the index and the section heading. */
  number: number;
  label: string;
}

interface PageHeroProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** The page's sections, in order; ids must match its PageSection ids. */
  sections: PageIndexEntry[];
}

/** Smooth-scrolls to a section and keeps the address shareable (#gym). */
function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  window.history.replaceState(window.history.state, '', `#${id}`);
}

/**
 * The top of a page, set like the opening of a printed guide: the title, one
 * line on what the page is for, and a numbered index of its sections. Open
 * rather than boxed, so it reads as the page's heading, not as another card.
 */
export function PageHero({ icon: Icon, title, description, sections }: PageHeroProps) {
  return (
    <header className="border-b border-border pb-6">
      <div className="flex items-center gap-4">
        <div className="grid place-items-center h-12 w-12 shrink-0 rounded-xl border border-border bg-card text-primary shadow-[var(--shadow-card)]">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">{title}</h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">{description}</p>
        </div>
      </div>

      <nav aria-label="On this page" className="mt-5">
        <ol className="flex flex-wrap gap-x-6 gap-y-1">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={(event) => jumpTo(event, section.id)}
                className="group inline-flex items-baseline gap-2 rounded-sm py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden="true" className="text-xs font-semibold tabular-nums text-primary">
                  {sectionNumber(section.number)}
                </span>
                <span className="underline-offset-4 decoration-primary/60 group-hover:underline">{section.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </header>
  );
}

interface PageSectionProps {
  /** Anchor for links such as /campus#gym; listed in PAGE_SECTIONS. */
  id: string;
  number: number;
  title: string;
  description?: string;
  children: ReactNode;
}

/** A titled group of cards for one thing a student is trying to do. */
export function PageSection({ id, number, title, description, children }: PageSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-4">
      <div className="flex items-baseline gap-3 px-1">
        <span aria-hidden="true" className="text-xs font-semibold tabular-nums text-primary">
          {sectionNumber(number)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight leading-tight">{title}</h2>
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
