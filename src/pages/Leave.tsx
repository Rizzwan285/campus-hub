import { useOutletContext } from 'react-router-dom';
import { LeaveFormCard } from '@/components/features/LeaveFormCard';
import { HolidaysCard } from '@/components/features/HolidaysCard';
import { PageSection, PageSections } from '@/components/layout/PageSection';
import type { AppContextType } from '@/components/layout/AppLayout';

/** Everything about being away from campus: how to apply for leave, and when it is a holiday. */
const Leave = () => {
  const { displayDate, openSettings } = useOutletContext<AppContextType>();

  return (
    <PageSections>
      <PageSection id="leave-form" title="Apply for leave" description="Going out overnight or longer? Fill the form a day ahead.">
        <LeaveFormCard onChangeMess={openSettings} />
      </PageSection>
      <PageSection id="holidays" title="Holidays" description="Days without classes, when holiday timings apply.">
        <HolidaysCard date={displayDate} />
      </PageSection>
    </PageSections>
  );
};

export default Leave;
