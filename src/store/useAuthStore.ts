import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiFetch, isApiConfigured, ApiError } from '@/services/api';

export interface AccountProfile {
  id: string;
  rollNumber: string;
  name: string | null;
  mess: 'Nila' | 'Kedaram' | null;
  program: 'UG' | 'PG' | null;
  branch: string | null;
  yearOfStudy: string | null;
  batchNo: string | null;
  role: string;
  selectedCourseIds: string[];
}

interface LoginResponse {
  token: string;
  expiresAt: string;
  profile: AccountProfile;
}

interface AuthState {
  token: string | null;
  expiresAt: string | null;
  account: AccountProfile | null;
  /** True while restoring a stored session on boot. */
  isRestoring: boolean;

  login: (rollNumber: string, password?: string) => Promise<AccountProfile>;
  logout: () => void;
  setToken: (token: string) => void;
  restore: () => Promise<void>;
  updateAccount: (patch: Partial<Omit<AccountProfile, 'id' | 'rollNumber' | 'role'>>) => Promise<void>;
  syncCourses: (offeringIds: string[]) => Promise<void>;
}

/** A profile is only usable once onboarding has filled in the essentials. */
export function isProfileComplete(account: AccountProfile | null): boolean {
  return Boolean(account?.name && account.mess && account.program && account.branch);
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      account: null,
      isRestoring: true,

      setToken: (token) => set({ token }),

      async login(rollNumber, password) {
        const data = await apiFetch<LoginResponse>('/api/auth/login', {
          method: 'POST',
          body: { rollNumber, password },
        });

        set({ token: data.token, expiresAt: data.expiresAt, account: data.profile });
        return data.profile;
      },

      logout() {
        set({ token: null, expiresAt: null, account: null });
      },

      async restore() {
        const { token } = get();
        if (!token || !isApiConfigured()) {
          set({ isRestoring: false });
          return;
        }

        try {
          const data = await apiFetch<{ profile: AccountProfile }>('/api/auth/me');
          set({ account: data.profile });
        } catch (error) {
          // Only drop the session when the server actually rejects it; a
          // network blip or a sleeping backend must not sign anyone out.
          if (error instanceof ApiError && error.status === 401) {
            set({ token: null, expiresAt: null, account: null });
          }
        } finally {
          set({ isRestoring: false });
        }
      },

      async updateAccount(patch) {
        const data = await apiFetch<{ profile: AccountProfile }>('/api/auth/profile', {
          method: 'PATCH',
          body: patch,
        });
        set({ account: data.profile });
      },

      async syncCourses(offeringIds) {
        const data = await apiFetch<{ selectedCourseIds: string[] }>('/api/auth/courses', {
          method: 'PUT',
          body: { offeringIds },
        });
        const account = get().account;
        if (account) {
          set({ account: { ...account, selectedCourseIds: data.selectedCourseIds } });
        }
      },
    }),
    {
      name: 'campus-auth',
      partialize: (state) => ({
        token: state.token,
        expiresAt: state.expiresAt,
        account: state.account,
      }),
      // isRestoring starts true; the rehydrated snapshot must not clear it
      // before restore() has had a chance to run.
      onRehydrateStorage: () => (state) => {
        if (state && !state.token) state.isRestoring = false;
      },
    },
  ),
);
