import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { MessMenuCard } from '@/components/MessMenuCard';
import { MessTimingsCard } from '@/components/MessTimingsCard';
import { BusScheduleCard } from '@/components/BusScheduleCard';
import { Footer } from '@/components/Footer';
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
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <MessMenuCard date={displayDate} />
          </div>
          
          <div className="lg:col-span-1">
            <MessTimingsCard date={displayDate} />
          </div>
          
          <div className="lg:col-span-1">
            <BusScheduleCard currentTime={currentTime} displayDate={displayDate} />
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
};

export default Index;
