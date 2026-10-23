import { ExternalLink, FileText, BookMarked, Link } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { docUrl } from '@/lib/documentUrl';

const campusLinks = [
  { title: 'SAC Website', description: 'Student Affairs Council', href: 'https://saciitpkd.github.io/website/' },
  { title: 'Moodle', description: 'Learning Management System', href: 'https://lms.iitpkd.ac.in/' },
  { title: 'Fedena', description: 'Records Portal', href: 'https://records.iitpkd.ac.in/' },
  { title: 'Institute Dashboard', description: 'IIT Palakkad Dashboard', href: 'https://dashboard.iitpkd.ac.in/' },
];

export function ImportantLinksCard() {
  return (
    <div className="space-y-6">
      {/* Hostel rules only — the leave form lives on the Leave page. */}
      <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/8 rounded-xl">
            <BookMarked className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Hostel Guidelines</h2>
            <p className="text-sm text-muted-foreground">Rules every resident is expected to follow</p>
          </div>
        </div>

        <a
          href={docUrl('Hostel Rules.pdf')}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/50 transition-colors group"
        >
          <div className="p-2 bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 rounded-lg group-hover:scale-110 transition-transform">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate">Hostel Rules</h4>
            <p className="text-xs text-muted-foreground">PDF Document</p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
        </a>
      </Card>

      <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] rounded-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/8 rounded-xl">
            <Link className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Campus Resources</h2>
            <p className="text-sm text-muted-foreground">Academic calendar and institute portals</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href={docUrl('Academic_Calender2026.pdf')}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors sm:col-span-2"
          >
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm">Academic Calendar (2026)</h3>
              <p className="text-xs text-muted-foreground">PDF Document</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          </a>
          {campusLinks.map(({ title, description, href }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm">{title}</h3>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
