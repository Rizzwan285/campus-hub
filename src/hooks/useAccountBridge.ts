import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useUserStore, type UserProfile } from '@/store/useUserStore';
import { useTimetableStore } from '@/store/useTimetableStore';

/**
 * Keeps the signed-in account and the app's existing stores in step.
 *
 * The feature components read `useUserStore` / `useTimetableStore`, which
 * predate accounts. Rather than rewrite them, the server account is mirrored
 * into those stores, and course selections are pushed back up so a user's picks
 * follow them to another device.
 */
export function useAccountBridge(): void {
  const account = useAuthStore((state) => state.account);
  const syncCourses = useAuthStore((state) => state.syncCourses);

  // Mirror account -> local profile store.
  useEffect(() => {
    if (!account) {
      useUserStore.getState().logout();
      return;
    }

    const profile: UserProfile = {
      name: account.name ?? '',
      mess: (account.mess ?? '') as UserProfile['mess'],
      program: (account.program ?? '') as UserProfile['program'],
      branch: account.branch ?? '',
      yearOfStudy: account.yearOfStudy ?? '',
      batchNo: account.batchNo ?? undefined,
    };

    const current = useUserStore.getState().profile;
    if (JSON.stringify(current) !== JSON.stringify(profile)) {
      useUserStore.getState().setProfile(profile);
    }
  }, [account]);

  // Adopt the server's course selection once per sign-in, so a fresh device
  // inherits the user's picks instead of starting empty.
  const adoptedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!account || adoptedFor.current === account.id) return;
    adoptedFor.current = account.id;

    if (account.selectedCourseIds.length > 0) {
      useTimetableStore.getState().updateSelectedCourses(account.selectedCourseIds);
    }
  }, [account]);

  // Push local changes back up, debounced so dragging through the course
  // picker does not fire a request per click.
  const selected = useTimetableStore((state) => state.selectedCourseIds);
  const lastPushed = useRef<string | null>(null);

  useEffect(() => {
    if (!account) return;

    const serialized = JSON.stringify([...selected].sort());
    if (serialized === lastPushed.current) return;
    // Nothing to do if it already matches what the server sent us.
    if (serialized === JSON.stringify([...account.selectedCourseIds].sort())) {
      lastPushed.current = serialized;
      return;
    }

    const timer = setTimeout(() => {
      lastPushed.current = serialized;
      void syncCourses(selected).catch(() => {
        // Offline is fine: the local store is still authoritative for the UI,
        // and the next change retries.
        lastPushed.current = null;
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, [selected, account, syncCourses]);
}
