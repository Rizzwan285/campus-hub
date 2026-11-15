import { WeeklyTimetable } from '@/components/features/timetable/WeeklyTimetable';
import { UpcomingSemesterCard } from '@/components/features/timetable/UpcomingSemesterCard';

const Timetable = () => {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <WeeklyTimetable />
      <UpcomingSemesterCard />
    </div>
  );
};

export default Timetable;
