import { ImportantLinksCard } from '@/components/features/ImportantLinksCard';
import { FeedbackCard } from '@/components/features/FeedbackCard';

const Campus = () => {
  return (
    <div className="max-w-3xl mx-auto w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <ImportantLinksCard />
      <FeedbackCard />
    </div>
  );
};

export default Campus;
