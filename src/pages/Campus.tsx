import { useOutletContext } from 'react-router-dom';
import { ImportantLinksCard } from '@/components/features/ImportantLinksCard';
import { LibraryTimingsCard } from '@/components/features/LibraryTimingsCard';
import { FeedbackCard } from '@/components/features/FeedbackCard';
import type { AppContextType } from '@/components/layout/AppLayout';

const Campus = () => {
  const { currentTime } = useOutletContext<AppContextType>();

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <LibraryTimingsCard currentTime={currentTime} />
      <ImportantLinksCard />
      <FeedbackCard />
    </div>
  );
};

export default Campus;
