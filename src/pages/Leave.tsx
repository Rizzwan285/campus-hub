import { useOutletContext } from 'react-router-dom';
import { LeaveFormCard } from '@/components/features/LeaveFormCard';
import { HolidaysCard } from '@/components/features/HolidaysCard';
import type { AppContextType } from '@/components/layout/AppLayout';

/** Everything about being away from campus: when it is a holiday, and how to apply for leave. */
const Leave = () => {
  const { displayDate } = useOutletContext<AppContextType>();

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <LeaveFormCard />
      <HolidaysCard date={displayDate} />
    </div>
  );
};

export default Leave;
