import { Clock, Coffee, MapPin, Phone, Truck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { amulCafe, amulMenuSections } from '@/data/amulCafeData';

export function AmulCafeCard() {
  return (
    <Card className="p-5 sm:p-6 bg-card border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-300 rounded-2xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/8 rounded-xl">
          <Coffee className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{amulCafe.name}</h2>
          <p className="text-sm text-muted-foreground">Menu &amp; campus delivery</p>
        </div>
      </div>

      <p className="flex items-start gap-2 text-sm text-muted-foreground mb-4">
        <MapPin className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
        {amulCafe.location}
      </p>

      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
        <div className="flex items-start gap-2">
          <Truck className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Delivery: {amulCafe.deliveryHours}</p>
            <p className="text-xs text-muted-foreground mt-1">Delivery across campus · ₹{amulCafe.deliveryCharge} extra for packing &amp; delivery</p>
          </div>
        </div>
        <p className="flex items-start gap-2 text-sm">
          <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          Cafe open until {amulCafe.closingTime}
        </p>
        <p className="text-xs text-muted-foreground">Doorstep delivery ends at 6:00 PM, before the cafe closes.</p>
      </div>

      <Button asChild className="w-full sm:w-auto mt-4">
        <a href={`tel:${amulCafe.phone}`}>
          <Phone className="h-4 w-4 mr-2" aria-hidden="true" />
          Call to order: {amulCafe.phone}
        </a>
      </Button>

      <Accordion type="single" collapsible className="mt-4 border-t border-border/50">
        <AccordionItem value="menu" className="border-b-0">
          <AccordionTrigger className="text-sm">View full menu</AccordionTrigger>
          <AccordionContent className="pb-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {amulMenuSections.map((section) => (
                <section key={section.title}>
                  <h3 className="font-semibold text-primary mb-2">{section.title}</h3>
                  <ul className="divide-y divide-border/50">
                    {section.items.map((item) => (
                      <li key={item.name} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p>{item.name}</p>
                          {item.detail && <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>}
                        </div>
                        <span className="font-medium tabular-nums shrink-0">₹{item.price}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
