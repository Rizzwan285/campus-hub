import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserProfile {
  name: string;
  mess: 'Nila' | 'Kedaram' | '';
  program: 'UG' | 'PG' | '';
  branch: string; // e.g., 'CSE', 'ME'
  yearOfStudy: string;
  batchNo?: string; // Optional, only for 1st year BTech
}

interface UserState {
  profile: UserProfile | null;
  setProfile: (profile: UserProfile) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: (profile) => set({ profile }),
      logout: () => set({ profile: null }),
    }),
    {
      name: 'mess-bus-user-storage',
    }
  )
);
