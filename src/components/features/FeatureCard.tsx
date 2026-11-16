import { createContext, useContext, type ReactNode } from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ACCENTS, type Accent } from '@/lib/accents';

/**
 * The card shell, header and link tile shared by every card on the secondary
 * student pages (Academics, Campus, Leave), so their padding, corners, shadows
 * and titles match. Each card carries its section's accent colour: a soft glow
 * in the corner, the icon tile and its link tiles. Home's cards keep their own look.
 */

const AccentContext = createContext<Accent>('blue');

interface FeatureCardProps {
  id?: string;
  accent?: Accent;
  className?: string;
  children: ReactNode;
}

export function FeatureCard({ id, accent = 'blue', className, children }: FeatureCardProps) {
  return (
    <AccentContext.Provider value={accent}>
      <Card
        id={id}
        className={cn(
          'relative overflow-hidden scroll-mt-6 p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow duration-300 rounded-2xl',
          className,
        )}
      >
        <div
          aria-hidden="true"
          className={cn('pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full blur-3xl', ACCENTS[accent].glow)}
        />
        <div className="relative">{children}</div>
      </Card>
    </AccentContext.Provider>
  );
}

interface FeatureCardHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  /** Something small on the right, such as an "Open now" badge or a PDF link. */
  aside?: ReactNode;
}

export function FeatureCardHeader({ icon: Icon, title, subtitle, aside }: FeatureCardHeaderProps) {
  const accent = ACCENTS[useContext(AccentContext)];
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn('p-2 rounded-xl shrink-0', accent.chip)}>
          <Icon className={cn('h-6 w-6', accent.text)} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {aside}
    </div>
  );
}

interface ExternalLinkRowProps {
  href: string;
  title: string;
  description: string;
  icon?: LucideIcon;
}

/** One document or website as a tile, opened in a new tab. */
export function ExternalLinkRow({ href, title, description, icon: Icon }: ExternalLinkRowProps) {
  const accent = ACCENTS[useContext(AccentContext)];
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex h-full items-center gap-3 p-3 rounded-xl border border-border/60 bg-background/40 transition-all duration-200 hover:bg-muted/40 hover:shadow-md motion-safe:hover:-translate-y-0.5',
        accent.hoverBorder,
      )}
    >
      {Icon && (
        <span className={cn('grid place-items-center h-10 w-10 shrink-0 rounded-lg', accent.chip)}>
          <Icon className={cn('h-5 w-5', accent.text)} aria-hidden="true" />
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block font-medium text-sm">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <ArrowUpRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5"
        aria-hidden="true"
      />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
