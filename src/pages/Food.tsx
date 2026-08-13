import { useOutletContext } from 'react-router-dom';
import { CanteenMenuCard } from '@/components/features/CanteenMenuCard';
import { MessTimingsCard } from '@/components/features/MessTimingsCard';
import type { AppContextType } from '@/components/layout/AppLayout';

const Food = () => {
  const { displayDate } = useOutletContext<AppContextType>();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CanteenMenuCard date={displayDate} />
      <MessTimingsCard date={displayDate} />
    </div>
  );
};

export default Food;
