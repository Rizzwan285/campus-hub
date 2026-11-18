import type { ReactNode } from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The card shell, header and link tile shared by every card on the secondary
 * student pages (Academics, Campus, Leave), so their padding, corners, shadows
 * and titles match each other and the cards on Home.
 *
 * Deliberately flat: the app's one accent colour (primary) for icons and
 * highlights, hairline borders, no gradients or glows. Colour elsewhere means
 * something (green for open, amber for a warning), never decoration.
 */

interface FeatureCardProps {
  id?: string;
  className?: string;
  children: ReactNode;
}

export function FeatureCard({ id, className, children }: FeatureCardProps) {
  return (
    <Card
      id={id}
      className={cn('scroll-mt-6 p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] rounded-2xl', className)}
    >
      {children}
    </Card>
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
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-xl shrink-0 bg-primary/8">
          <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
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
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full items-center gap-3 p-3 rounded-xl border border-border/60 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {Icon && (
        <span className="grid place-items-center h-10 w-10 shrink-0 rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block font-medium text-sm">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <ArrowUpRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
        aria-hidden="true"
      />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
