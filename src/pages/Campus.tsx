import { Building2, Dumbbell, Home as HomeIcon, UtensilsCrossed } from 'lucide-react';
import { AmulCafeCard } from '@/components/features/AmulCafeCard';
import { ContactsCard } from '@/components/features/ContactsCard';
import { FeedbackCard } from '@/components/features/FeedbackCard';
import { GymTimingsCard } from '@/components/features/GymTimingsCard';
import { HostelCard } from '@/components/features/HostelCard';
import { PageHero, PageSection, PageSections, type PageHeroSection } from '@/components/layout/PageSection';

const SECTIONS = {
  food: { id: 'food-and-contacts', label: 'Food & contacts', icon: UtensilsCrossed, accent: 'amber' },
  gym: { id: 'gym', label: 'Gym', icon: Dumbbell, accent: 'rose' },
  hostel: { id: 'hostel', label: 'Hostel & feedback', icon: HomeIcon, accent: 'emerald' },
} satisfies Record<string, PageHeroSection>;

/** Living on campus: food and phone numbers, the gym, hostel rules, feedback. */
const Campus = () => {
  const { food, gym, hostel } = SECTIONS;
  return (
    <PageSections>
      <PageHero
        icon={Building2}
        accent="amber"
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
