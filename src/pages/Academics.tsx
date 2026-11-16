import { useOutletContext } from 'react-router-dom';
import { AcademicDocumentsCard } from '@/components/features/AcademicDocumentsCard';
import { LibraryTimingsCard } from '@/components/features/LibraryTimingsCard';
import { PortalsCard } from '@/components/features/PortalsCard';
import { PageSection, PageSections } from '@/components/layout/PageSection';
import type { AppContextType } from '@/components/layout/AppLayout';

/** Studying: the calendar and forms, the library, and the institute portals. */
const Academics = () => {
  const { currentTime } = useOutletContext<AppContextType>();

  return (
    <PageSections>
      <PageSection id="calendar" title="Calendar & forms" description="Exam dates, holidays and certificate requests.">
        <AcademicDocumentsCard />
      </PageSection>
      <PageSection id="library" title="Library" description="Opening hours, and the catalogue for borrowing and renewing books.">
        <LibraryTimingsCard currentTime={currentTime} />
      </PageSection>
      <PageSection id="portals" title="Portals" description="Moodle, Fedena and the institute dashboard.">
        <PortalsCard />
      </PageSection>
    </PageSections>
  );
};

export default Academics;
