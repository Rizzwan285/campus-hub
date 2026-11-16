import { ExternalLink, MapPin, Phone, Contact as ContactIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useContacts } from '@/hooks/useApiData';
import { withContacts } from '@/lib/contacts';
import { telHref } from '@/lib/contactPhone';
import type { Contact } from '@/data/contactsData';

const MAP_HOSTS = /(^|\.)(share\.google|maps\.app\.goo\.gl|goo\.gl|maps\.google\.[a-z.]+)$/i;

/** "Map" for a maps listing, "Website" for anything else. */
function linkLabel(href: string): string {
  try {
    const url = new URL(href);
    const isMap = MAP_HOSTS.test(url.hostname) || (/(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.pathname.startsWith('/maps'));
    return isMap ? 'Map' : 'Website';
  } catch {
    return 'Website';
  }
}

const action =
  'inline-flex items-center gap-1.5 min-h-9 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors touch-manipulation';

function ContactRow({ contact }: { contact: Contact }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 py-3">
      {/* Narrow enough that a name and one number share a row on a 360px phone. */}
      <div className="min-w-0 flex-1 basis-32">
        <p className="font-medium break-words">{contact.name}</p>
        {contact.location && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground mt-1">
            <MapPin className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
            <span className="break-words">{contact.location}</span>
          </p>
        )}
        {contact.note && <p className="text-xs text-muted-foreground mt-1 break-words">{contact.note}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {contact.phones.map((phone) => {
          const href = telHref(phone);
          return href ? (
            <a
              key={phone}
              href={href}
              aria-label={`Call ${contact.name} on ${phone}`}
              className={`${action} border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 tabular-nums`}
            >
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              {phone}
            </a>
          ) : (
            <span key={phone} className="text-sm tabular-nums text-muted-foreground px-1 py-1.5">{phone}</span>
          );
        })}
        {contact.link && (
          <a
            href={contact.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${linkLabel(contact.link)} for ${contact.name} (opens in a new tab)`}
            className={`${action} border-border bg-muted/40 text-foreground hover:bg-muted`}
          >
            {linkLabel(contact.link)}
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  );
}

/** Phone numbers students ask each other for, grouped and tap-to-call. */
export function ContactsCard() {
  const categories = withContacts(useContacts());
  // The developer removed every contact; there is nothing to show.
  if (categories.length === 0) return null;

  return (
    <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-primary/8 rounded-xl">
          <ContactIcon className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Contacts</h2>
          <p className="text-sm text-muted-foreground">Tap a number to call</p>
        </div>
      </div>

      <Accordion type="multiple">
        {categories.map((category, index) => (
          <AccordionItem
            key={category.id}
            value={String(category.id)}
            className={index === categories.length - 1 ? 'border-b-0' : undefined}
          >
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                {category.name}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {category.contacts.length}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-1">
              <ul className="divide-y divide-border/50">
                {category.contacts.map((contact) => (
                  <ContactRow key={contact.id} contact={contact} />
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Card>
  );
}
