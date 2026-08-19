import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Home, Calendar, Coffee, Info } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { getCurrentTimeInKolkata } from '@/utils/dateUtils';
import { useUserStore } from '@/store/useUserStore';
import { useTimetableStore } from '@/store/useTimetableStore';
import { useAcademicDaysSync } from '@/hooks/useApiData';
import { useAccountBridge } from '@/hooks/useAccountBridge';
import { useAuthStore, isProfileComplete } from '@/store/useAuthStore';
import { isApiConfigured } from '@/services/api';
import { Onboarding } from '@/components/features/Onboarding';
import { Login } from '@/components/features/Login';
import { AccountSettings } from '@/components/features/AccountSettings';

export interface AppContextType {
  currentTime: Date;
  selectedDate: Date | null;
  displayDate: Date;
}

export function AppLayout() {
  // Keeps holiday/instructional-day data fresh from the API for getDayType().
  useAcademicDaysSync();
  // Mirrors the signed-in account into the profile and timetable stores.
  useAccountBridge();

  const [currentTime, setCurrentTime] = useState(getCurrentTimeInKolkata());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const profile = useUserStore((state) => state.profile);

  const token = useAuthStore((state) => state.token);
  const account = useAuthStore((state) => state.account);
  const isRestoring = useAuthStore((state) => state.isRestoring);
  const restore = useAuthStore((state) => state.restore);

  // Revalidate a stored session once on boot.
  useEffect(() => {
    void restore();
  }, [restore]);
  
  const initializeTimetable = useTimetableStore((state) => state.initializeTimetable);
  const updatePreviewDate = useTimetableStore((state) => state.updatePreviewDate);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getCurrentTimeInKolkata());
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (profile && profile.program && profile.branch) {
      initializeTimetable(profile.program, profile.branch);
    }
  }, [profile, initializeTimetable]);

  const displayDate = selectedDate || currentTime;

  useEffect(() => {
    updatePreviewDate(displayDate);
  }, [displayDate, updatePreviewDate]);

  const handleRefresh = () => {
    setCurrentTime(getCurrentTimeInKolkata());
    setSelectedDate(null);
  };

  // Accounts need the API. Without it the app still works from bundled data,
  // so fall back to the original local-only onboarding rather than locking
  // everyone out.
  const accountsEnabled = isApiConfigured();

  if (accountsEnabled) {
    if (isRestoring) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      );
    }

    if (!token) {
      return <Login />;
    }

    if (!isProfileComplete(account)) {
      return (
        <div className="min-h-screen">
          <Onboarding />
        </div>
      );
    }
  } else if (!profile) {
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
    { path: '/food', label: 'Food', icon: Coffee },
    { path: '/campus', label: 'Campus', icon: Info },
  ];

  return (
    <div className="min-h-screen pb-24 md:pb-0 flex flex-col bg-background">
      <div className="container mx-auto px-4 py-6 sm:py-8 max-w-7xl flex-1 flex flex-col">
        <Header 
          onRefresh={handleRefresh}
          onDateChange={setSelectedDate}
          selectedDate={selectedDate}
          userName={account?.name ?? profile?.name ?? ''}
          onOpenSettings={accountsEnabled ? () => setSettingsOpen(true) : undefined}
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

      {accountsEnabled && (
        <AccountSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
      )}

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
            {({ isActive }) => (
              <>
                <div className={`p-1.5 rounded-lg mb-1 transition-colors ${isActive ? 'bg-primary/10' : 'bg-transparent'}`}>
                  <item.icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                </div>
                <span className={`text-[10px] tracking-wide transition-all ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
