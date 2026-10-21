import { useEffect } from 'react';
import { isApiConfigured } from '@/services/api';
import { useTimetableStore } from '@/store/useTimetableStore';

/** Approved timings reach open sessions without a sign-out or editor visit. */
export function useTimetableSync(): void {
  const ready = useTimetableStore(state => state.loadedCourses.length > 0 && !state.isLoading);
  useEffect(() => {
    if (!ready || !isApiConfigured()) return;
    let busy = false;
    const refresh = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        await useTimetableStore.getState().refreshCourses();
      } finally {
        busy = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [ready]);
}
