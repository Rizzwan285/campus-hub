import type { ReactNode } from 'react';
import { ExternalLink, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The card shell and header shared by every card on the secondary student
 * pages (Academics, Campus, Leave), so their padding, corners, shadows and
 * titles match. Home's cards keep their own look.
 */
export function FeatureCard({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <Card
      id={id}
      className={cn(
        'scroll-mt-6 p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow duration-300 rounded-2xl',
        className,
      )}
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
        <div className="p-2 bg-primary/8 rounded-xl shrink-0">
          <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-xl font-semibold leading-tight">{title}</h3>
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

/** One document or website, opened in a new tab. */
export function ExternalLinkRow({ href, title, description, icon: Icon }: ExternalLinkRowProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3.5 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors"
    >
      {Icon && <Icon className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
