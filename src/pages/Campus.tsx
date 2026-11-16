import { AmulCafeCard } from '@/components/features/AmulCafeCard';
import { ContactsCard } from '@/components/features/ContactsCard';
import { FeedbackCard } from '@/components/features/FeedbackCard';
import { GymTimingsCard } from '@/components/features/GymTimingsCard';
import { HostelCard } from '@/components/features/HostelCard';
import { PageSection, PageSections } from '@/components/layout/PageSection';

/** Living on campus: food and phone numbers, the gym, hostel rules, feedback. */
const Campus = () => (
  <PageSections>
    <PageSection id="food-and-contacts" title="Food & contacts" description="Order from Amul Cafe, or call an auto, the clinic or a restaurant.">
      <AmulCafeCard />
      <ContactsCard />
    </PageSection>
    <PageSection id="gym" title="Gym" description="Slots at the Kedaram and Malhar gyms.">
      <GymTimingsCard />
    </PageSection>
    <PageSection id="hostel" title="Hostel & feedback" description="Hostel rules, the student council, and where to report a problem with this app.">
      <HostelCard />
      <FeedbackCard />
    </PageSection>
  </PageSections>
);

export default Campus;
