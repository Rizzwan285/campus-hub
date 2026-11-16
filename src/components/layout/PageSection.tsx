import { useEffect, type MouseEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACCENTS, type Accent } from '@/lib/accents';

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

export interface PageHeroSection {
  id: string;
  label: string;
  icon: LucideIcon;
  accent: Accent;
}

interface PageHeroProps {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: Accent;
  /** Shown as "jump to" chips; ids must match the page's PageSection ids. */
  sections: PageHeroSection[];
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

/** The top of a page: what it is for, and a chip for each section on it. */
export function PageHero({ icon: Icon, title, description, accent, sections }: PageHeroProps) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-border/50 bg-card p-5 sm:p-7 shadow-[var(--shadow-card)]">
      <div aria-hidden="true" className={cn('pointer-events-none absolute -top-28 -right-16 h-64 w-64 rounded-full blur-3xl', ACCENTS[accent].glow)} />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-16 h-56 w-56 rounded-full blur-3xl bg-primary/10" />

      <div className="relative flex items-center gap-4">
        <div className={cn('grid place-items-center h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-2xl text-white shadow-lg', ACCENTS[accent].solid)}>
          <Icon className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      <nav aria-label="On this page" className="relative mt-5 flex flex-wrap gap-2">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={(event) => jumpTo(event, section.id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-muted"
          >
            <section.icon className={cn('h-3.5 w-3.5', ACCENTS[section.accent].text)} aria-hidden="true" />
            {section.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

interface PageSectionProps {
  /** Anchor for links such as /campus#gym; listed in PAGE_SECTIONS. */
  id: string;
  title: string;
  description?: string;
  accent: Accent;
  children: ReactNode;
}

/** A titled group of cards for one thing a student is trying to do. */
export function PageSection({ id, title, description, accent, children }: PageSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-3">
      {/* An accent bar, not another icon: the hero chip and the card already carry one. */}
      <div className="flex items-stretch gap-3 px-1">
        <span aria-hidden="true" className={cn('w-1.5 shrink-0 rounded-full', ACCENTS[accent].solid)} />
        <div className="min-w-0 py-0.5">
          <h2 id={`${id}-title`} className="text-lg font-semibold leading-tight">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
