import { Building2 } from 'lucide-react';
import { AmulCafeCard } from '@/components/features/AmulCafeCard';
import { ContactsCard } from '@/components/features/ContactsCard';
import { FeedbackCard } from '@/components/features/FeedbackCard';
import { GymTimingsCard } from '@/components/features/GymTimingsCard';
import { HostelCard } from '@/components/features/HostelCard';
import { PageHero, PageSection, PageSections, type PageIndexEntry } from '@/components/layout/PageSection';

const SECTIONS = {
  food: { id: 'food-and-contacts', number: 1, label: 'Food & contacts' },
  gym: { id: 'gym', number: 2, label: 'Gym' },
  hostel: { id: 'hostel', number: 3, label: 'Hostel & feedback' },
} satisfies Record<string, PageIndexEntry>;

/** Living on campus: food and phone numbers, the gym, hostel rules, feedback. */
const Campus = () => {
  const { food, gym, hostel } = SECTIONS;
  return (
    <PageSections>
      <PageHero
        icon={Building2}
        title="Campus"
        description="Food, phone numbers, the gym and hostel life."
        sections={Object.values(SECTIONS)}
      />
      <PageSection {...food} title={food.label} description="Order from Amul Cafe, or call an auto, the clinic or a restaurant.">
        <AmulCafeCard />
        <ContactsCard />
      </PageSection>
      <PageSection {...gym} title={gym.label} description="Slots at the Kedaram and Malhar gyms.">
        <GymTimingsCard />
      </PageSection>
      <PageSection {...hostel} title={hostel.label} description="Hostel rules, the student council, and where to report a problem with this app.">
        <HostelCard />
        <FeedbackCard />
      </PageSection>
    </PageSections>
  );
};

export default Campus;
