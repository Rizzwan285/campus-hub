import { ClipboardList, Globe, GraduationCap, LayoutDashboard } from 'lucide-react';
import { ExternalLinkRow, FeatureCard, FeatureCardHeader } from './FeatureCard';

const PORTALS = [
  { title: 'Moodle', description: 'Learning Management System', href: 'https://lms.iitpkd.ac.in/', icon: GraduationCap },
  { title: 'Fedena', description: 'Records Portal', href: 'https://records.iitpkd.ac.in/', icon: ClipboardList },
  { title: 'Dashboard', description: 'IIT Palakkad Dashboard', href: 'https://dashboard.iitpkd.ac.in/', icon: LayoutDashboard },
];

/** The institute's own sites students sign in to. */
export function PortalsCard() {
  return (
    <FeatureCard id="institute-portals">
      <FeatureCardHeader icon={Globe} title="Institute portals" subtitle="Courses, records and the dashboard" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PORTALS.map((portal) => (
          <ExternalLinkRow key={portal.href} {...portal} />
        ))}
      </div>
    </FeatureCard>
  );
}
