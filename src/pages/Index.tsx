import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { MessMenuCard } from '@/components/features/MessMenuCard';
import { CanteenMenuCard } from '@/components/features/CanteenMenuCard';
import { ClassTimetableCard } from '@/components/features/ClassTimetableCard';
import { BusScheduleCard } from '@/components/features/BusScheduleCard';
import { MessTimingsCard } from '@/components/features/MessTimingsCard';
import { Footer } from '@/components/layout/Footer';
import { getCurrentTimeInKolkata } from '@/utils/dateUtils';
import { useUserStore } from '@/store/useUserStore';
import { Onboarding } from '@/components/features/Onboarding';
import { WeeklyTimetable } from '@/components/features/timetable/WeeklyTimetable';

const Index = () => {
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
      import('@/store/useTimetableStore').then(({ useTimetableStore }) => {
        useTimetableStore.getState().initializeTimetable(profile.program, profile.branch);
      });
    }
  }, [profile]);

  const handleRefresh = () => {
    setCurrentTime(getCurrentTimeInKolkata());
    setSelectedDate(null);
  };

  const displayDate = selectedDate || currentTime;

  useEffect(() => {
    import('@/store/useTimetableStore').then(({ useTimetableStore }) => {
      useTimetableStore.getState().updatePreviewDate(displayDate);
    });
  }, [displayDate]);

  if (!profile) {
    return (
      <div className="min-h-screen">
        <Onboarding />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Header 
          onRefresh={handleRefresh}
          onDateChange={setSelectedDate}
          selectedDate={selectedDate}
          userName={profile.name}
        />
        
        <div className="columns-1 lg:columns-2 gap-6 space-y-6 [column-fill:_balance]">
          <div className="break-inside-avoid">
            <MessMenuCard date={displayDate} />
          </div>

          <div className="break-inside-avoid">
            <CanteenMenuCard date={displayDate} />
          </div>
          
          <div className="break-inside-avoid">
            <ClassTimetableCard date={displayDate} />
          </div>
          
          <div className="break-inside-avoid">
            <BusScheduleCard currentTime={currentTime} displayDate={displayDate} />
          </div>
          
          <div className="break-inside-avoid">
            <MessTimingsCard date={displayDate} />
          </div>
        </div>
        
        <div className="mt-8">
          <WeeklyTimetable />
        </div>

        <Footer />
      </div>
    </div>
  );
};

export default Index;
