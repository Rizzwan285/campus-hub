import { useOutletContext } from 'react-router-dom';
import { MessMenuCard } from '@/components/features/MessMenuCard';
import { ClassTimetableCard } from '@/components/features/ClassTimetableCard';
import { BusScheduleCard } from '@/components/features/BusScheduleCard';
import type { AppContextType } from '@/components/layout/AppLayout';

const Index = () => {
  const { displayDate, currentTime } = useOutletContext<AppContextType>();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <ClassTimetableCard date={displayDate} />
      <MessMenuCard date={displayDate} />
      <BusScheduleCard currentTime={currentTime} displayDate={displayDate} />
    </div>
  );
};

export default Index;
