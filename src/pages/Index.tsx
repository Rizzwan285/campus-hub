import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { MessMenuCard } from '@/components/features/MessMenuCard';
import { CanteenMenuCard } from '@/components/features/CanteenMenuCard';
import { ClassTimetableCard } from '@/components/features/ClassTimetableCard';
import { BusScheduleCard } from '@/components/features/BusScheduleCard';
import { MessTimingsCard } from '@/components/features/MessTimingsCard';
import { Footer } from '@/components/layout/Footer';
import { getCurrentTimeInKolkata } from '@/utils/dateUtils';

const Index = () => {
  const [currentTime, setCurrentTime] = useState(getCurrentTimeInKolkata());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getCurrentTimeInKolkata());
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = () => {
    setCurrentTime(getCurrentTimeInKolkata());
    setSelectedDate(null);
  };

  const displayDate = selectedDate || currentTime;

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Header 
          onRefresh={handleRefresh}
          onDateChange={setSelectedDate}
          selectedDate={selectedDate}
        />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <MessMenuCard date={displayDate} />
          </div>

          <div>
            <CanteenMenuCard date={displayDate} />
          </div>
          
          <div>
            <ClassTimetableCard date={displayDate} />
          </div>
          
          <div>
            <BusScheduleCard currentTime={currentTime} displayDate={displayDate} />
          </div>
          
          <div>
            <MessTimingsCard date={displayDate} />
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
};

export default Index;
