import { useState, useEffect } from 'react';
import { Moon, Sun, ChevronRight, RotateCcw, LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTime, formatDate, getCurrentTimeInKolkata } from '@/utils/dateUtils';
import { addDays } from 'date-fns';
import { useUserStore } from '@/store/useUserStore';

interface HeaderProps {
  onRefresh: () => void;
  onDateChange: (date: Date | null) => void;
  selectedDate: Date | null;
  userName?: string;
  /** Present once accounts are enabled; opens the profile sheet. */
  onOpenSettings?: () => void;
  /** The notifications bell, when accounts are enabled. */
  notifications?: React.ReactNode;
}

export function Header({ onRefresh, onDateChange, selectedDate, userName, onOpenSettings, notifications }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(getCurrentTimeInKolkata());
  // index.html has already applied the saved (or default dark) theme.
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const logout = useUserStore((state) => state.logout);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getCurrentTimeInKolkata());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleDarkMode = () => {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('mess-bus-theme', next ? 'dark' : 'light');
    } catch {
      // Storage unavailable (private mode): the choice lasts for this visit.
    }
    setIsDark(next);
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

  const handleLogout = () => {
    logout();
  };

  const firstName = userName ? userName.split(' ')[0] : '';

  return (
    <header className="mb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <img src={`${import.meta.env.BASE_URL}favicon.svg?v=transparent-cc`} alt="Campus Companion" className="h-6 w-6" />
            <span className="text-sm font-semibold text-primary/80 tracking-wide uppercase">Campus Companion</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {firstName ? `Hey, ${firstName} 👋` : 'Your Dashboard'}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">
              {formatDate(displayDate)} • {formatTime(currentTime)}
            </p>
            {!isToday && (
              <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-wider">
                Preview
              </span>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={toggleDarkMode}
            className="rounded-xl h-9 w-9 border-border/60 hover:bg-muted hover:text-foreground"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          
          {!isToday && (
            <Button
              variant="outline"
              onClick={handleToday}
              className="rounded-xl h-9 border-border/60 hover:bg-muted hover:text-foreground text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Today
            </Button>
          )}
          
          <Button
            variant="outline"
            onClick={handleNextDay}
            className="rounded-xl h-9 border-border/60 hover:bg-muted hover:text-foreground text-xs"
          >
            Next Day
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>

          {notifications}

          {onOpenSettings ? (
            <Button
              variant="outline"
              size="icon"
              onClick={onOpenSettings}
              className="rounded-xl h-9 w-9 border-border/60 hover:bg-muted hover:text-foreground"
              title="Account & settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          ) : (
            userName && (
              <Button
                variant="outline"
                size="icon"
                onClick={handleLogout}
                className="rounded-xl h-9 w-9 border-border/60 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )
          )}
        </div>
      </div>
    </header>
  );
}
