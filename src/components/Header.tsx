import { useState, useEffect } from 'react';
import { RefreshCw, Moon, Sun, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTime, formatDate, getCurrentTimeInKolkata } from '@/utils/dateUtils';
import { addDays } from 'date-fns';

interface HeaderProps {
  onRefresh: () => void;
  onDateChange: (date: Date | null) => void;
  selectedDate: Date | null;
}

export function Header({ onRefresh, onDateChange, selectedDate }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(getCurrentTimeInKolkata());
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getCurrentTimeInKolkata());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(!isDark);
  };

  const displayDate = selectedDate || currentTime;
  const isToday = !selectedDate;

  const handleNextDay = () => {
    const nextDate = addDays(displayDate, 1);
    onDateChange(nextDate);
  };

  const handleToday = () => {
    onDateChange(null);
  };

  return (
    <header className="mb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            IIT Palakkad Mess & Bus Info
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground">
              {formatDate(displayDate)} • {formatTime(currentTime)}
            </p>
            {!isToday && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                Preview Mode
              </span>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={toggleDarkMode}
            className="transition-transform hover:scale-105"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          
          {!isToday && (
            <Button
              variant="outline"
              onClick={handleToday}
              className="transition-transform hover:scale-105"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Today
            </Button>
          )}
          
          <Button
            variant="outline"
            onClick={handleNextDay}
            className="transition-transform hover:scale-105"
          >
            Next Day
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            className="transition-transform hover:scale-105"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
