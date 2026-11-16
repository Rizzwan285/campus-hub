import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore, type AccountProfile } from './useAuthStore';
import { apiFetch } from '@/services/api';
import { useTimetableStore } from './useTimetableStore';

vi.mock('@/services/api', () => ({ apiFetch: vi.fn(), isApiConfigured: () => true, ApiError: class extends Error {} }));
vi.mock('./useTimetableStore', () => ({ useTimetableStore: { getState: vi.fn() } }));

const account = (id: string): AccountProfile => ({
  id, rollNumber: id, name: 'Test', mess: 'Nila', program: 'UG', branch: 'CSE',
  yearOfStudy: '2', batchNo: null, role: 'student', selectedCourseIds: [], courseOverrides: [], semesterId: 1,
});

describe('personal timing synchronization boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ account: account('one') });
    vi.mocked(useTimetableStore.getState).mockReturnValue({ semester: { id: 1 } } as ReturnType<typeof useTimetableStore.getState>);
  });

  it('labels a personal timing write with the loaded semester', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ courseOverrides: [] });
    await useAuthStore.getState().syncCourseOverrides([]);
    expect(apiFetch).toHaveBeenCalledWith('/api/auth/course-overrides', {
      method: 'PUT', body: { overrides: [], semesterId: 1 },
    });
  });

  for (const change of ['account', 'semester']) {
    it(`ignores a delayed response after the ${change} changes`, async () => {
      let finish!: (value: unknown) => void;
      vi.mocked(apiFetch).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      const pending = useAuthStore.getState().syncCourseOverrides([]);
      if (change === 'account') useAuthStore.setState({ account: account('two') });
      else vi.mocked(useTimetableStore.getState).mockReturnValue({ semester: { id: 2 } } as ReturnType<typeof useTimetableStore.getState>);
      finish({ courseOverrides: [{ courseCode: 'OLD' }] });
      await pending;
      expect(useAuthStore.getState().account?.courseOverrides).toEqual([]);
    });
  }
});
