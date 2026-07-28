import { useState, useEffect, useMemo } from 'react';
import { UtensilsCrossed, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  kedaramMessMenu, commonItems,
  nilaMessMenu, nilaCommonItems,
  weekdayTimings, weekendTimings,
  type WeekMenu,
} from '@/data/messData';
import { useUserStore } from '@/store/useUserStore';

interface MessMenuCardProps {
  date: Date;
}

const MEAL_ORDER = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'] as const;
type MealType = typeof MEAL_ORDER[number];

type Campus = 'kedaram' | 'nila';

interface CampusConfig {
  label: string;
  subtitle: string;
  menu: WeekMenu;
  commonItems: Record<string, string>;
}

const CAMPUS_CONFIG: Record<Campus, CampusConfig> = {
  kedaram: {
    label: 'Kedaram',
    subtitle: 'Ideal Catering',
    menu: kedaramMessMenu,
    commonItems: {
      Breakfast: commonItems.breakfast,
      Lunch: commonItems.lunch,
      Snacks: commonItems.snacks,
      Dinner: commonItems.dinner,
    },
  },
  nila: {
    label: 'Nila',
    subtitle: 'Manu Catering',
    menu: nilaMessMenu,
    commonItems: {
      Breakfast: nilaCommonItems.breakfast,
      Lunch: nilaCommonItems.lunch,
      Snacks: nilaCommonItems.snacks,
      Dinner: nilaCommonItems.dinner,
    },
  },
};

/**
 * Parse a time string like "7:15am", "12pm", "9:30am" into { hours, minutes } in 24h format.
 */
function parseTimePart(timeStr: string): { hours: number; minutes: number } {
  const clean = timeStr.trim().toLowerCase();
  const isAM = clean.includes('am');
  const isPM = clean.includes('pm');
  const match = clean.match(/(\d+):?(\d+)?/);
  if (!match) return { hours: 0, minutes: 0 };

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  if (isAM && hours === 12) hours = 0;
  if (isPM && hours !== 12) hours += 12;

  return { hours, minutes };
}

/**
 * Returns the index of the meal that is currently being served or is next up.
 */
function getCurrentMealIndex(date: Date): number {
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;
  const timings = isWeekend ? weekendTimings : weekdayTimings;

  const nowMinutes = date.getHours() * 60 + date.getMinutes();

  const mealKeys: (keyof typeof timings)[] = ['breakfast', 'lunch', 'snacks', 'dinner'];

  const mealWindows = mealKeys.map((key) => {
    const range = timings[key];
    const [startStr, endStr] = range.split('-').map(s => s.trim());
    const start = parseTimePart(startStr);
    const end = parseTimePart(endStr);
    return {
      startMin: start.hours * 60 + start.minutes,
      endMin: end.hours * 60 + end.minutes,
    };
  });

  for (let i = 0; i < mealWindows.length; i++) {
    if (nowMinutes >= mealWindows[i].startMin && nowMinutes <= mealWindows[i].endMin) {
      return i;
    }
  }

  if (nowMinutes < mealWindows[0].startMin) {
    return 0;
  }

  for (let i = 0; i < mealWindows.length; i++) {
    if (nowMinutes < mealWindows[i].startMin) {
      return i;
    }
  }

  return 3;
}

export function MessMenuCard({ date }: MessMenuCardProps) {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const profile = useUserStore((state) => state.profile);

  // Initialize with profile's mess if available, otherwise 'kedaram'
  const initialCampus = profile?.mess ? (profile.mess.toLowerCase() as Campus) : 'kedaram';
  const [campus, setCampus] = useState<Campus>(initialCampus);
  const config = CAMPUS_CONFIG[campus];
  const dayMenu = config.menu[dayName];

  const autoMealIndex = useMemo(() => getCurrentMealIndex(date), [date]);
  const [activeMealIndex, setActiveMealIndex] = useState(autoMealIndex);

  useEffect(() => {
    setActiveMealIndex(autoMealIndex);
  }, [autoMealIndex]);

  const activeMealType: MealType = MEAL_ORDER[activeMealIndex];
  const meals = dayMenu?.[activeMealType];

  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;
  const timings = isWeekend ? weekendTimings : weekdayTimings;
  const timingKey = activeMealType.toLowerCase() as keyof typeof timings;
  const timingStr = timings[timingKey];

  const handlePrev = () => {
    setActiveMealIndex((prev) => (prev - 1 + MEAL_ORDER.length) % MEAL_ORDER.length);
  };

  const handleNext = () => {
    setActiveMealIndex((prev) => (prev + 1) % MEAL_ORDER.length);
  };

  return (
    <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/8 rounded-xl">
          <UtensilsCrossed className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-semibold">Mess Menu</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">{config.subtitle} • {dayName}</p>
        </div>
      </div>

      {/* Campus Toggle */}
      <div className="flex rounded-lg bg-muted/50 p-1 mb-5">
        {(Object.keys(CAMPUS_CONFIG) as Campus[]).map((key) => (
          <button
            key={key}
            onClick={() => setCampus(key)}
            className={`flex-1 text-xs sm:text-sm font-medium py-1.5 px-3 rounded-md transition-all duration-200 touch-manipulation ${
              campus === key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {CAMPUS_CONFIG[key].label}
          </button>
        ))}
      </div>

      {/* Meal Navigation */}
      <div className="flex items-center justify-between gap-2 mb-5">
        <button
          onClick={handlePrev}
          className="p-2 rounded-lg bg-muted/50 hover:bg-muted active:scale-95 transition-all duration-150 touch-manipulation"
          aria-label="Previous meal"
        >
          <ChevronLeft className="h-5 w-5 text-foreground/70" />
        </button>

        <div className="flex-1 flex items-center justify-center min-w-0">
          <div className="text-center min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-primary truncate">
              {activeMealType}
            </h3>
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="truncate">{timingStr}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleNext}
          className="p-2 rounded-lg bg-muted/50 hover:bg-muted active:scale-95 transition-all duration-150 touch-manipulation"
          aria-label="Next meal"
        >
          <ChevronRight className="h-5 w-5 text-foreground/70" />
        </button>
      </div>

      {/* Meal Dots Indicator */}
      <div className="flex justify-center gap-1.5 mb-5">
        {MEAL_ORDER.map((meal, idx) => (
          <button
            key={meal}
            onClick={() => setActiveMealIndex(idx)}
            className={`h-2 rounded-full transition-all duration-300 touch-manipulation ${
              idx === activeMealIndex
                ? 'w-6 bg-primary'
                : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
            aria-label={`Go to ${meal}`}
          />
        ))}
      </div>

      {/* Meal Content */}
      <div className="space-y-3 min-h-[140px]">
        {meals && meals.map((meal, idx) => (
          <div key={idx} className="space-y-2.5">
            {/* Veg / Non-Veg tags */}
            {(meal.veg || meal.nonVeg) && (
              <div className="flex flex-wrap gap-2">
                {meal.veg && (
                  <div className="flex-1 min-w-[120px] p-2.5 rounded-lg bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800/50">
                    <span className="text-[10px] sm:text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">
                      🟢 Veg
                    </span>
                    <p className="text-sm mt-1 text-green-900 dark:text-green-200">{meal.veg}</p>
                  </div>
                )}
                {meal.nonVeg && (
                  <div className="flex-1 min-w-[120px] p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/50">
                    <span className="text-[10px] sm:text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
                      🔴 Non-Veg
                    </span>
                    <p className="text-sm mt-1 text-red-900 dark:text-red-200">{meal.nonVeg}</p>
                  </div>
                )}
              </div>
            )}

            {/* Main items */}
            {meal.items.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {meal.items.map((item, i) => (
                  <span
                    key={i}
                    className="inline-block text-xs sm:text-sm px-2.5 py-1 rounded-full bg-primary/5 text-foreground/80 border border-primary/10"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}

            {/* Common / Daily Extras */}
            {config.commonItems[activeMealType] && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-muted-foreground/80">Daily extras:</span>{' '}
                  {config.commonItems[activeMealType]}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
