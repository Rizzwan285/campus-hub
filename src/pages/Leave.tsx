import { useOutletContext } from 'react-router-dom';
import { ClipboardList, Luggage, PartyPopper } from 'lucide-react';
import { LeaveFormCard } from '@/components/features/LeaveFormCard';
import { HolidaysCard } from '@/components/features/HolidaysCard';
import { PageHero, PageSection, PageSections, type PageHeroSection } from '@/components/layout/PageSection';
import type { AppContextType } from '@/components/layout/AppLayout';

const SECTIONS = {
  leave: { id: 'leave-form', label: 'Apply for leave', icon: ClipboardList, accent: 'sky' },
  holidays: { id: 'holidays', label: 'Holidays', icon: PartyPopper, accent: 'orange' },
} satisfies Record<string, PageHeroSection>;

/** Everything about being away from campus: how to apply for leave, and when it is a holiday. */
const Leave = () => {
  const { displayDate, openSettings } = useOutletContext<AppContextType>();
  const { leave, holidays } = SECTIONS;

  return (
    <PageSections>
      <PageHero
        icon={Luggage}
        accent="sky"
        title="Leave & holidays"
        description="Heading home? Apply for leave, and plan around the next holiday."
        sections={Object.values(SECTIONS)}
      />
      <PageSection {...leave} title={leave.label} description="Going out overnight or longer? Fill the form a day ahead.">
        <LeaveFormCard onChangeMess={openSettings} />
      </PageSection>
      <PageSection {...holidays} title={holidays.label} description="Days without classes, when holiday timings apply.">
        <HolidaysCard date={displayDate} />
      </PageSection>
    </PageSections>
  );
};

export default Leave;
