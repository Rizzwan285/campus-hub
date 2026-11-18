import { BookMarked, FileText, Users } from 'lucide-react';
import { docUrl } from '@/lib/documentUrl';
import { ExternalLinkRow, FeatureCard, FeatureCardHeader } from './FeatureCard';

/** Living on campus: the hostel rules and the student council. */
export function HostelCard() {
  return (
    <FeatureCard id="hostel-rules">
      <FeatureCardHeader icon={BookMarked} title="Hostel Rules & SAC" subtitle="Rules every resident is expected to follow" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ExternalLinkRow href={docUrl('Hostel Rules.pdf')} icon={FileText} title="Hostel Rules" description="PDF Document" />
        <ExternalLinkRow
          href="https://saciitpkd.github.io/website/"
          icon={Users}
          title="SAC Website"
          description="Student Affairs Council"
        />
      </div>
    </FeatureCard>
  );
}
