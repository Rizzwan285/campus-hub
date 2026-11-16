import { useOutletContext } from 'react-router-dom';
import { BookOpen, CalendarRange, GraduationCap, MonitorSmartphone } from 'lucide-react';
import { AcademicDocumentsCard } from '@/components/features/AcademicDocumentsCard';
import { LibraryTimingsCard } from '@/components/features/LibraryTimingsCard';
import { PortalsCard } from '@/components/features/PortalsCard';
import { PageHero, PageSection, PageSections, type PageHeroSection } from '@/components/layout/PageSection';
import type { AppContextType } from '@/components/layout/AppLayout';

const SECTIONS = {
  calendar: { id: 'calendar', label: 'Calendar & forms', icon: CalendarRange, accent: 'blue' },
  library: { id: 'library', label: 'Library', icon: BookOpen, accent: 'teal' },
  portals: { id: 'portals', label: 'Portals', icon: MonitorSmartphone, accent: 'violet' },
} satisfies Record<string, PageHeroSection>;

/** Studying: the calendar and forms, the library, and the institute portals. */
const Academics = () => {
  const { currentTime } = useOutletContext<AppContextType>();
  const { calendar, library, portals } = SECTIONS;

  return (
    <PageSections>
      <PageHero
        icon={GraduationCap}
        accent="violet"
        title="Academics"
        description="Exam dates, forms, the library and every portal, in one place."
        sections={Object.values(SECTIONS)}
      />
      <PageSection {...calendar} title={calendar.label} description="Exam dates, holidays and certificate requests.">
        <AcademicDocumentsCard />
      </PageSection>
      <PageSection {...library} title={library.label} description="Opening hours, and the catalogue for borrowing and renewing books.">
        <LibraryTimingsCard currentTime={currentTime} />
      </PageSection>
      <PageSection {...portals} title={portals.label} description="Moodle, Fedena and the institute dashboard.">
        <PortalsCard />
      </PageSection>
    </PageSections>
  );
};

export default Academics;
