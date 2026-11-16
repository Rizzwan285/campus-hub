import { FileText, FolderOpen, NotebookText } from 'lucide-react';
import { docUrl } from '@/lib/documentUrl';
import { ExternalLinkRow, FeatureCard, FeatureCardHeader } from './FeatureCard';

/** Newest first: from January the 2027 calendar is the one students need. */
const CALENDARS = ['2027', '2026'];

/** The academic calendar PDFs and the institute's forms page. */
export function AcademicDocumentsCard() {
  return (
    <FeatureCard id="academic-documents">
      <FeatureCardHeader icon={NotebookText} title="Academic documents" subtitle="Calendars and forms from the academic section" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CALENDARS.map((year) => (
          <ExternalLinkRow
            key={year}
            href={docUrl(`Academic_Calender${year}.pdf`)}
            icon={FileText}
            title={`Academic Calendar ${year}`}
            description="PDF · exam dates, holidays and instructional days"
          />
        ))}
        <div className="sm:col-span-2">
          <ExternalLinkRow
            href="https://iitpkd.ac.in/academics-downloads"
            icon={FolderOpen}
            title="Academic Guidelines and Forms"
            description="Forms such as the Bonafide Certificate, Signed Transcript and Course Completion Certificate requests"
          />
        </div>
      </div>
    </FeatureCard>
  );
}
