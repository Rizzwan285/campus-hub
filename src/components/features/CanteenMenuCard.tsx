import { useState, useEffect, useMemo } from 'react';
import { Coffee, ChevronLeft, ChevronRight, Clock, IndianRupee } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { type CanteenSection } from '@/data/canteenData';
import { useCanteenSections } from '@/hooks/useApiData';

interface CanteenMenuCardProps {
  date: Date;
}

/**
 * Returns the index of the canteen section that best matches the current time.
 * Priority: currently-active section with narrowest window → next upcoming → last section.
 */
function getCurrentSectionIndex(date: Date, canteenSections: CanteenSection[]): number {
  const hour = date.getHours();

  // Find sections that are currently active
  const activeIndices = canteenSections
    .map((s, i) => ({ i, span: s.endHour - s.startHour, start: s.startHour, end: s.endHour }))
    .filter(({ start, end }) => hour >= start && hour < end);

  if (activeIndices.length > 0) {
    // Prefer the narrowest active window (more specific section)
    activeIndices.sort((a, b) => a.span - b.span);
    return activeIndices[0].i;
  }

  // Before the canteen opens → show first section
  if (hour < canteenSections[0].startHour) {
    return 0;
  }

  // Find next upcoming section
  for (let i = 0; i < canteenSections.length; i++) {
    if (hour < canteenSections[i].startHour) {
      return i;
    }
  }

  // All sections are over → show last section
  return canteenSections.length - 1;
}

export function CanteenMenuCard({ date }: CanteenMenuCardProps) {
  const canteenSections = useCanteenSections();
  const autoIndex = useMemo(
    () => getCurrentSectionIndex(date, canteenSections),
    [date, canteenSections],
  );
  const [activeIndex, setActiveIndex] = useState(autoIndex);

  useEffect(() => {
    setActiveIndex(autoIndex);
  }, [autoIndex]);

  const section = canteenSections[Math.min(activeIndex, canteenSections.length - 1)];

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + canteenSections.length) % canteenSections.length);
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % canteenSections.length);
  };

  // Determine if section is currently active
  const hour = date.getHours();
  const isActive = hour >= section.startHour && hour < section.endHour;

  return (
    <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-primary/8 rounded-xl">
          <Coffee className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-semibold">Canteen Menu</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Cafe 11:11 • Kedaram</p>
        </div>
      </div>

      {/* Section Navigation */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <button
          onClick={handlePrev}
          className="p-2 rounded-lg bg-muted/50 hover:bg-muted active:scale-95 transition-all duration-150 touch-manipulation"
          aria-label="Previous section"
        >
          <ChevronLeft className="h-5 w-5 text-foreground/70" />
        </button>

        <div className="flex-1 flex items-center justify-center min-w-0">
          <div className="text-center min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-primary truncate">
              {section.title}
            </h3>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="text-xs text-muted-foreground truncate">{section.timing}</span>
              {isActive && (
                <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400">
                  Open
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleNext}
          className="p-2 rounded-lg bg-muted/50 hover:bg-muted active:scale-95 transition-all duration-150 touch-manipulation"
          aria-label="Next section"
        >
          <ChevronRight className="h-5 w-5 text-foreground/70" />
        </button>
      </div>

      {/* Section Dots */}
      <div className="flex justify-center gap-1.5 mb-5">
        {canteenSections.map((s, idx) => (
          <button
            key={s.title}
            onClick={() => setActiveIndex(idx)}
            className={`h-2 rounded-full transition-all duration-300 touch-manipulation ${
              idx === activeIndex
                ? 'w-6 bg-primary'
                : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
            aria-label={`Go to ${s.title}`}
          />
        ))}
      </div>

      {/* Items List */}
      <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
        {section.items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm text-foreground/85 min-w-0 truncate">{item.name}</span>
            {item.price !== null && (
              <span className="flex items-center gap-0.5 text-sm font-semibold text-primary shrink-0">
                <IndianRupee className="h-3 w-3" />
                {item.price}
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
