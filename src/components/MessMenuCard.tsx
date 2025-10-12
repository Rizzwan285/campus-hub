import { UtensilsCrossed } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { week1and3Menu, week2and4Menu } from '@/data/messData';
import { getWeekCycle } from '@/utils/dateUtils';

interface MessMenuCardProps {
  date: Date;
}

export function MessMenuCard({ date }: MessMenuCardProps) {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const weekCycle = getWeekCycle(date);
  const menu = weekCycle === 'week13' ? week1and3Menu : week2and4Menu;
  const dayMenu = menu[dayName];

  const weekLabel = weekCycle === 'week13' ? 'Week 1 & 3' : 'Week 2 & 4';

  return (
    <Card className="p-6 bg-card hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 hover:scale-[1.02]">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/10 rounded-lg">
          <UtensilsCrossed className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Mess Menu</h2>
          <p className="text-sm text-muted-foreground">{weekLabel} cycle</p>
        </div>
      </div>

      <div className="space-y-6">
        {dayMenu && Object.entries(dayMenu).map(([mealType, meals]) => (
          <div key={mealType} className="border-l-4 border-primary/30 pl-4">
            <h3 className="font-semibold text-primary mb-2">{mealType}</h3>
            {meals.map((meal, idx) => (
              <div key={idx} className="space-y-2">
                {meal.veg && (
                  <div className="mb-1">
                    <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-2 py-1 rounded">
                      Veg
                    </span>
                    <p className="text-sm mt-1">{meal.veg}</p>
                  </div>
                )}
                {meal.nonVeg && (
                  <div className="mb-1">
                    <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 px-2 py-1 rounded">
                      Non-Veg
                    </span>
                    <p className="text-sm mt-1">{meal.nonVeg}</p>
                  </div>
                )}
                {meal.items.length > 0 && (
                  <p className="text-sm text-foreground/80">
                    {meal.items.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
