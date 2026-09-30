import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useUserStore, type UserProfile } from '@/store/useUserStore';
import { useTimetableStore } from '@/store/useTimetableStore';
import type { CourseOverride } from '@/engine/courseTimings';

/**
 * Keeps the signed-in account and the app's existing stores in step.
 *
 * The feature components read `useUserStore` / `useTimetableStore`, which
 * predate accounts. Rather than rewrite them, the server account is mirrored
 * into those stores, and course selections and the user's own class timings are
 * pushed back up so they follow the user to another device.
 */
export function useAccountBridge(): void {
  const account = useAuthStore((state) => state.account);
  const syncCourses = useAuthStore((state) => state.syncCourses);
  const syncCourseOverrides = useAuthStore((state) => state.syncCourseOverrides);

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
    // Likewise the student's own class timings, even when the account has none,
    // so a previous user's edits on a shared device are not pushed into this
    // account. Two exceptions: edits this device saved while the API was down
    // (pushed up by the effect below instead), and a server too old to send
    // the field at all.
    const timetable = useTimetableStore.getState();
    if (account.courseOverrides && !timetable.courseOverridesUnsynced) {
      timetable.setCourseOverrides(account.courseOverrides);
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

  // Own class timings follow the same path up.
  const overrides = useTimetableStore((state) => state.courseOverrides);
  const lastPushedOverrides = useRef<string | null>(null);

  useEffect(() => {
    if (!account) return;

    const byCode = (a: CourseOverride, b: CourseOverride) => a.courseCode.localeCompare(b.courseCode);
    const list = Object.values(overrides).sort(byCode);
    const serialized = JSON.stringify(list);
    if (serialized === lastPushedOverrides.current) return;
    if (serialized === JSON.stringify([...(account.courseOverrides ?? [])].sort(byCode))) {
      lastPushedOverrides.current = serialized;
      useTimetableStore.getState().markCourseOverridesSynced();
      return;
    }

    const timer = setTimeout(() => {
      lastPushedOverrides.current = serialized;
      syncCourseOverrides(list)
        .then(() => {
          // Only if nothing changed meanwhile; a newer edit still needs its own push.
          const now = Object.values(useTimetableStore.getState().courseOverrides).sort(byCode);
          if (JSON.stringify(now) === serialized) {
            useTimetableStore.getState().markCourseOverridesSynced();
          }
        })
        .catch(() => {
          // Kept locally and still marked unsynced, so the next change or the
          // next app open retries rather than adopting the account's older copy.
          lastPushedOverrides.current = null;
        });
    }, 1200);

    return () => clearTimeout(timer);
  }, [overrides, account, syncCourseOverrides]);
}
