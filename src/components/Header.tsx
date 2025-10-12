import { useState, useEffect } from 'react';
import { Calendar, RefreshCw, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTime, formatDate, getCurrentTimeInKolkata } from '@/utils/dateUtils';

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

  return (
    <header className="mb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            IIT Palakkad Mess & Bus Info
          </h1>
          <p className="text-muted-foreground">
            {formatDate(selectedDate || currentTime)} • {formatTime(currentTime)}
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={toggleDarkMode}
            className="transition-transform hover:scale-105"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => onDateChange(null)}
            className="transition-transform hover:scale-105"
            title="Pick Date"
          >
            <Calendar className="h-4 w-4" />
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
