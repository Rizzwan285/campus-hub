/**
 * TanStack Query hooks that serve API data with the bundled static data as
 * both instant first paint and offline/error fallback. Components receive the
 * exact shapes they consumed before the backend existed.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson, isApiConfigured } from '@/services/api';
import {
  commonItems as staticCommonItems,
  nilaCommonItems as staticNilaCommonItems,
  week1and3Menu as staticWeek1and3Menu,
  week2and4Menu as staticWeek2and4Menu,
  nilaMessMenu as staticNilaMessMenu,
  weekdayTimings as staticWeekdayTimings,
  weekendTimings as staticWeekendTimings,
  type WeekMenu,
  type MessTimings,
} from '@/data/messData';
import {
  workingDaysBus as staticWorkingDaysBus,
  fridayBus as staticFridayBus,
  saturdayHolidayBus as staticSaturdayHolidayBus,
  sundayBus as staticSundayBus,
  type BusSchedule,
} from '@/data/busData';
import { canteenSections as staticCanteenSections, type CanteenSection } from '@/data/canteenData';
import { setAcademicDays, type AcademicDaysData } from '@/utils/dateUtils';

const QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  retry: 1,
  refetchOnWindowFocus: false,
} as const;

// ---------------------------------------------------------------- mess

interface ApiMessResponse {
  messes: Record<
    string,
    {
      slug: string;
      name: string;
      caterer: string | null;
      hasWeekCycle: boolean;
      /** Inverts the client's derived odd/even cycle; set from the admin panel. */
      weekCycleFlipped?: boolean;
      /** Keyed by capitalized meal: Breakfast, Lunch, Snacks, Dinner. */
      commonItems: Record<string, string>;
      /** Keyed by week cycle: week13 / week24 / all. */
      menus: Record<string, WeekMenu>;
    }
  >;
  /** timings[weekday|weekend][breakfast|lunch|snacks|dinner] */
  timings: Record<string, Record<string, string>>;
}

export interface MessData {
  week1and3Menu: WeekMenu;
  week2and4Menu: WeekMenu;
  nilaMessMenu: WeekMenu;
  commonItems: typeof staticCommonItems;
  nilaCommonItems: typeof staticNilaCommonItems;
  weekdayTimings: MessTimings;
  weekendTimings: MessTimings;
  /** Inverts the odd/even cycle derived from the calendar. Kedaram only. */
  weekCycleFlipped: boolean;
}

const STATIC_MESS_DATA: MessData = {
  week1and3Menu: staticWeek1and3Menu,
  week2and4Menu: staticWeek2and4Menu,
  nilaMessMenu: staticNilaMessMenu,
  commonItems: staticCommonItems,
  nilaCommonItems: staticNilaCommonItems,
  weekdayTimings: staticWeekdayTimings,
  weekendTimings: staticWeekendTimings,
  weekCycleFlipped: false,
};

function toLowercaseMeals(source: Record<string, string> | undefined) {
  return source
    ? {
        breakfast: source.Breakfast,
        lunch: source.Lunch,
        snacks: source.Snacks,
        dinner: source.Dinner,
      }
    : undefined;
}

function toMessTimings(source: Record<string, string> | undefined): MessTimings | undefined {
  return source
    ? {
        breakfast: source.breakfast,
        lunch: source.lunch,
        snacks: source.snacks,
        dinner: source.dinner,
      }
    : undefined;
}

/** Falls back field-by-field so a partial API response never blanks a card. */
function toMessData(api: ApiMessResponse): MessData {
  const kedaram = api.messes?.kedaram;
  const nila = api.messes?.nila;

  return {
    week1and3Menu: kedaram?.menus?.week13 ?? staticWeek1and3Menu,
    week2and4Menu: kedaram?.menus?.week24 ?? staticWeek2and4Menu,
    nilaMessMenu: nila?.menus?.all ?? staticNilaMessMenu,
    commonItems: (toLowercaseMeals(kedaram?.commonItems) as typeof staticCommonItems) ?? staticCommonItems,
    nilaCommonItems:
      (toLowercaseMeals(nila?.commonItems) as typeof staticNilaCommonItems) ?? staticNilaCommonItems,
    weekdayTimings: toMessTimings(api.timings?.weekday) ?? staticWeekdayTimings,
    weekendTimings: toMessTimings(api.timings?.weekend) ?? staticWeekendTimings,
    weekCycleFlipped: kedaram?.weekCycleFlipped ?? false,
  };
}

export function useMessData(): MessData {
  const { data } = useQuery({
    queryKey: ['mess'],
    queryFn: async () => toMessData(await fetchJson<ApiMessResponse>('/api/mess')),
    enabled: isApiConfigured(),
    placeholderData: STATIC_MESS_DATA,
    ...QUERY_OPTIONS,
  });

  return data ?? STATIC_MESS_DATA;
}

// ---------------------------------------------------------------- bus

type ApiBusResponse = Record<string, BusSchedule>;

export interface BusSchedules {
  workingDaysBus: BusSchedule;
  fridayBus: BusSchedule;
  saturdayHolidayBus: BusSchedule;
  sundayBus: BusSchedule;
}

const STATIC_BUS_SCHEDULES: BusSchedules = {
  workingDaysBus: staticWorkingDaysBus,
  fridayBus: staticFridayBus,
  saturdayHolidayBus: staticSaturdayHolidayBus,
  sundayBus: staticSundayBus,
};

export function useBusSchedules(): BusSchedules {
  const { data } = useQuery({
    queryKey: ['bus'],
    queryFn: async () => {
      const api = await fetchJson<ApiBusResponse>('/api/bus');
      return {
        workingDaysBus: api.weekday ?? staticWorkingDaysBus,
        fridayBus: api.friday ?? staticFridayBus,
        saturdayHolidayBus: api.saturday_holiday ?? staticSaturdayHolidayBus,
        sundayBus: api.sunday ?? staticSundayBus,
      } satisfies BusSchedules;
    },
    enabled: isApiConfigured(),
    placeholderData: STATIC_BUS_SCHEDULES,
    ...QUERY_OPTIONS,
  });

  return data ?? STATIC_BUS_SCHEDULES;
}

// ---------------------------------------------------------------- canteen

export function useCanteenSections(): CanteenSection[] {
  const { data } = useQuery({
    queryKey: ['canteen'],
    queryFn: async () => {
      const sections = await fetchJson<CanteenSection[]>('/api/canteen');
      return sections.length > 0 ? sections : staticCanteenSections;
    },
    enabled: isApiConfigured(),
    placeholderData: staticCanteenSections,
    ...QUERY_OPTIONS,
  });

  return data ?? staticCanteenSections;
}

// ---------------------------------------------------------------- academic calendar

/**
 * Keeps the synchronous getDayType() helper fed with server-side holiday data.
 * Mount once near the app root.
 */
export function useAcademicDaysSync(): void {
  const { data } = useQuery({
    queryKey: ['academic-days'],
    queryFn: () => fetchJson<AcademicDaysData>('/api/academic-days'),
    enabled: isApiConfigured(),
    ...QUERY_OPTIONS,
  });

  useEffect(() => {
    if (data) setAcademicDays(data);
  }, [data]);
}
