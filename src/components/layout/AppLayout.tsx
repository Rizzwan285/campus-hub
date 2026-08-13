import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Home, Calendar, Coffee } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { getCurrentTimeInKolkata } from '@/utils/dateUtils';
import { useUserStore } from '@/store/useUserStore';
import { useTimetableStore } from '@/store/useTimetableStore';
import { Onboarding } from '@/components/features/Onboarding';

export interface AppContextType {
  currentTime: Date;
  selectedDate: Date | null;
  displayDate: Date;
}

export function AppLayout() {
  const [currentTime, setCurrentTime] = useState(getCurrentTimeInKolkata());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const profile = useUserStore((state) => state.profile);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getCurrentTimeInKolkata());
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (profile && profile.program && profile.branch) {
      useTimetableStore.getState().initializeTimetable(profile.program, profile.branch);
    }
  }, [profile]);

  const displayDate = selectedDate || currentTime;

  useEffect(() => {
    useTimetableStore.getState().updatePreviewDate(displayDate);
  }, [displayDate]);

  const handleRefresh = () => {
    setCurrentTime(getCurrentTimeInKolkata());
    setSelectedDate(null);
  };

  if (!profile) {
    return (
      <div className="min-h-screen">
        <Onboarding />
      </div>
    );
  }

  const contextValue: AppContextType = {
    currentTime,
    selectedDate,
    displayDate,
  };

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/timetable', label: 'Timetable', icon: Calendar },
    { path: '/food', label: 'Food & Dining', icon: Coffee },
  ];

  return (
    <div className="min-h-screen pb-24 md:pb-0 flex flex-col bg-background">
      <div className="container mx-auto px-4 py-6 sm:py-8 max-w-7xl flex-1 flex flex-col">
        <Header 
          onRefresh={handleRefresh}
          onDateChange={setSelectedDate}
          selectedDate={selectedDate}
          userName={profile.name}
        />
        
        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-2 mb-6 p-1.5 bg-muted/30 rounded-xl border border-border/50 w-fit">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-background text-primary shadow-sm ring-1 ring-border' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </div>

        <main className="flex-1">
          <Outlet context={contextValue} />
        </main>

        <div className="hidden md:block mt-12">
          <Footer />
        </div>
      </div>

      {/* Bottom Navigation for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/85 backdrop-blur-xl border-t border-border z-50 px-2 py-2 flex justify-around items-center safe-area-bottom pb-4 shadow-[0_-4px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.4)]">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center p-2 min-w-[72px] rounded-xl transition-all duration-200 ${
                isActive 
                  ? 'text-primary scale-105' 
                  : 'text-muted-foreground hover:text-foreground active:scale-95'
              }`
            }
          >
            <div className={`p-1.5 rounded-lg mb-1 transition-colors ${isActive ? 'bg-primary/10' : 'bg-transparent'}`}>
              <item.icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            </div>
            <span className={`text-[10px] tracking-wide transition-all ${isActive ? 'font-bold' : 'font-medium'}`}>
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
