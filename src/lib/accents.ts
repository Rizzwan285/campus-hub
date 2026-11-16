/**
 * One accent colour per section of the secondary pages, so each area of the
 * app has its own personality while sharing one layout.
 *
 * Every class is written out in full: Tailwind only generates classes it can
 * find literally in the source.
 */
export type Accent = 'blue' | 'teal' | 'violet' | 'amber' | 'rose' | 'emerald' | 'sky' | 'orange';

export interface AccentClasses {
  /** Small tinted tile behind an icon. */
  chip: string;
  /** Icon or text in the accent colour, readable in both themes. */
  text: string;
  /** Filled gradient (page and section icons). */
  solid: string;
  /** Soft glow in a card's corner. */
  glow: string;
  /** Hover border for link tiles. */
  hoverBorder: string;
  /** Faint wash used behind highlighted panels. */
  wash: string;
}

export const ACCENTS: Record<Accent, AccentClasses> = {
  blue: {
    chip: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-300',
    solid: 'bg-gradient-to-br from-blue-500 to-indigo-500', glow: 'bg-blue-500/20',
    hoverBorder: 'hover:border-blue-500/50', wash: 'from-blue-500/15',
  },
  teal: {
    chip: 'bg-teal-500/15', text: 'text-teal-600 dark:text-teal-300',
    solid: 'bg-gradient-to-br from-teal-400 to-cyan-600', glow: 'bg-teal-500/20',
    hoverBorder: 'hover:border-teal-500/50', wash: 'from-teal-500/15',
  },
  violet: {
    chip: 'bg-violet-500/15', text: 'text-violet-600 dark:text-violet-300',
    solid: 'bg-gradient-to-br from-violet-500 to-fuchsia-500', glow: 'bg-violet-500/20',
    hoverBorder: 'hover:border-violet-500/50', wash: 'from-violet-500/15',
  },
  amber: {
    chip: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-300',
    solid: 'bg-gradient-to-br from-amber-400 to-orange-500', glow: 'bg-amber-500/20',
    hoverBorder: 'hover:border-amber-500/50', wash: 'from-amber-500/15',
  },
  rose: {
    chip: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-300',
    solid: 'bg-gradient-to-br from-rose-500 to-pink-500', glow: 'bg-rose-500/20',
    hoverBorder: 'hover:border-rose-500/50', wash: 'from-rose-500/15',
  },
  emerald: {
    chip: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-300',
    solid: 'bg-gradient-to-br from-emerald-400 to-teal-600', glow: 'bg-emerald-500/20',
    hoverBorder: 'hover:border-emerald-500/50', wash: 'from-emerald-500/15',
  },
  sky: {
    chip: 'bg-sky-500/15', text: 'text-sky-600 dark:text-sky-300',
    solid: 'bg-gradient-to-br from-sky-400 to-blue-600', glow: 'bg-sky-500/20',
    hoverBorder: 'hover:border-sky-500/50', wash: 'from-sky-500/15',
  },
  orange: {
    chip: 'bg-orange-500/15', text: 'text-orange-600 dark:text-orange-300',
    solid: 'bg-gradient-to-br from-orange-400 to-rose-500', glow: 'bg-orange-500/20',
    hoverBorder: 'hover:border-orange-500/50', wash: 'from-orange-500/15',
  },
};
