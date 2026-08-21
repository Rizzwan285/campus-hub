export interface BusRoute {
  description: string;
}

export interface BusSchedule {
  nilaToSahyadri: string[];
  sahyadriToNila: string[];
  palakkadTown?: BusRoute[];
  wisePark?: BusRoute[];
  /**
   * Display times that carry more than one bus.
   *
   * Ambiguous by construction: a bare time like "8:30" occurs twice in a day
   * and this cannot say which one. Kept because it is the shape the API and
   * the offline fallback have always exchanged — prefer
   * `multipleBusPositions` when it is present.
   */
  multipleBusTimings?: {
    nilaToSahyadri: string[];
    sahyadriToNila: string[];
  };
  /**
   * Indices into the direction's own list, so the morning and evening 8:30 can
   * be told apart. The circular bolds 8:30 AM but not 8:30 PM, and matching by
   * string badged both.
   */
  multipleBusPositions?: {
    nilaToSahyadri: number[];
    sahyadriToNila: number[];
  };
}

/**
 * Authoring helper. A direction is written as one entry per departure, in the
 * order the buses actually run, with a trailing `*` on the slots the circular
 * prints in **bold** — its notation for "more than one bus leaves at this
 * time". The plain list, the positions and the legacy string list are all
 * derived from that single spec, so they cannot drift apart.
 *
 * This is deliberately the same `*` convention the admin editor accepts, so
 * what is typed in `/admin` and what is written here read identically.
 */
function departures(spec: string[]): { times: string[]; positions: number[] } {
  return {
    times: spec.map((entry) => entry.replace(/\*$/, '').trim()),
    positions: spec.flatMap((entry, index) => (entry.endsWith('*') ? [index] : [])),
  };
}

/** The legacy string view: every distinct time that has a marked position. */
function multipleTimes(spec: { times: string[]; positions: number[] }): string[] {
  return [...new Set(spec.positions.map((index) => spec.times[index]))];
}

/**
 * The circular published by the transport office that this file transcribes.
 * Shown on the bus card so students can tell at a glance whether the app is
 * behind a freshly circulated timetable.
 */
export const busEffectiveFrom = "7 August 2026";

const CONSTRUCTION_NOTE = "service roads only — construction may cause detours";

// Runs every day, hence repeated in all four schedules.
const ROUTE_8_ALL_DAYS: BusRoute = {
  description: "Stadium Bus Stand (9:30 PM) → Chandranagar → Pudussery → IIT Main Gate → Sahyadri (all days)"
};

// Route 6 is unchanged between Monday–Thursday and Friday.
const ROUTE_6: BusRoute = {
  description: "Sahyadri (5:35 PM) → Nila Manogata → Malampuzha Road → Mattumantha → Sekharipuram → Koppam → Kalleppulley (5:55 PM) → Sekharipuram (5:50 PM) → Chandranagar → Pudussery → Nila"
};

// Route 7 runs on Friday and Saturday only, so it is absent from Mon–Thu.
const ROUTE_7_FRI_SAT: BusRoute = {
  description: "Sahyadri (6:15 PM) → Nila Gate → Pudussery → Kadamkode → Manapullykavu → Maidaan (Govt. Hospital) → Stadium Bus Stand (Fri & Sat only)"
};

const MORNING_TOWN_ROUTES: BusRoute[] = [
  { description: "Kalleppulley (7:00 AM) → Mattumantha → Koppam → Chandranagar Circle → Pudussery → Nila Gate → Sahyadri (7:50 AM)" },
  { description: "Palakkad (8:00 AM) → Kadamkode → Manapullykavu → Maidaan (Govt. Hospital) → Stadium Bus Stand → Kalmandapam → Chandranagar → Pudussery → Nila Gate → Sahyadri (8:30 AM)" },
];

// Routes 3 and 4 also run on Saturdays, so they are shared.
const ROUTES_3_AND_4: BusRoute[] = [
  { description: "Nila Gate (7:40 AM) → Palakkad (8:25 AM) → Kadamkode → Manapullykavu → Maidaan (Govt. Hospital) → Stadium Bus Stand → Kalmandapam → Chandranagar → Pudussery → Nila Gate → Sahyadri (8:55 AM)" },
  { description: "Nila Gate (7:55 AM) → Kalleppulley (8:25 AM) → Koppam → Sekharipuram → Mattumantha → Malampuzha → Nila Gate → Sahyadri (8:55 AM)" },
];

// Route 5 runs to town Monday–Thursday but only as far as Kinnar stop on
// Friday and Saturday, so the two variants differ by their trailing note.
const route5 = (extent: string): BusRoute => ({
  description: `Sahyadri (5:35 PM) → Nila Gate → Pudussery → Kadamkode → Manapullykavu → Maidaan (Govt. Hospital) → Stadium Bus Stand → Palakkad → Stadium Bus Stand → Chandranagar → Pudussery → Nila (${extent})`
});

const wiseParkEvening: BusRoute = {
  description: `Sahyadri (6:15 PM) → Nila Gate → Wise Park Junction (6:45 PM) → Nila Manogata (7:00 PM) (${CONSTRUCTION_NOTE})`
};

// `*` = the circular prints this time in bold: more than one bus leaves.
const WORKING_N2S = departures([
  "7:45*", "8:30*", "8:55", "9:25", "9:45", "10:20", "10:45", "11:15", "11:50*", "12:15", "12:30*",
  "1:00*", "1:30*", "1:45*", "2:15", "2:45", "3:20", "3:45", "4:30", "5:00", "5:15*",
  "5:45", "6:00", "6:30", "7:00", "7:30", "8:00*", "8:30", "9:00", "10:00", "11:00", "12:00"
]);

const WORKING_S2N = departures([
  "7:45", "8:15", "8:30*", "8:55*", "9:25", "9:45", "10:20*", "10:45", "11:15", "11:50*",
  "12:15", "12:30*", "1:00*", "1:30*", "1:45", "1:55", "2:15", "2:45", "3:20", "3:45", "4:30",
  "5:00", "5:15*", "5:45", "6:00", "6:30", "7:00", "7:30", "8:00", "9:15", "10:15", "11:15"
]);

// Working Days (Monday – Thursday)
export const workingDaysBus: BusSchedule = {
  nilaToSahyadri: WORKING_N2S.times,
  sahyadriToNila: WORKING_S2N.times,
  palakkadTown: [
    ...MORNING_TOWN_ROUTES,
    ...ROUTES_3_AND_4,
    route5("Mon–Thu: runs up to town"),
    ROUTE_6,
    ROUTE_8_ALL_DAYS
  ],
  wisePark: [
    { description: `Nila (8:15 AM) → Wise Park Junction (8:30 AM) → Nila Manogata (8:45 AM) → Sahyadri (9:00 AM) (${CONSTRUCTION_NOTE})` },
    wiseParkEvening
  ],
  multipleBusTimings: {
    nilaToSahyadri: multipleTimes(WORKING_N2S),
    sahyadriToNila: multipleTimes(WORKING_S2N)
  },
  multipleBusPositions: {
    nilaToSahyadri: WORKING_N2S.positions,
    sahyadriToNila: WORKING_S2N.positions
  }
};

// Fridays — same shuttle times as Mon–Thu, but route 7 runs and route 5 is
// short-turned at Kinnar stop.
export const fridayBus: BusSchedule = {
  nilaToSahyadri: [...workingDaysBus.nilaToSahyadri],
  sahyadriToNila: [...workingDaysBus.sahyadriToNila],
  palakkadTown: [
    ...MORNING_TOWN_ROUTES,
    ...ROUTES_3_AND_4,
    route5("Fri & Sat: runs up to Kinnar stop"),
    ROUTE_6,
    ROUTE_7_FRI_SAT,
    ROUTE_8_ALL_DAYS
  ],
  wisePark: workingDaysBus.wisePark,
  multipleBusTimings: workingDaysBus.multipleBusTimings,
  multipleBusPositions: workingDaysBus.multipleBusPositions
};

const SATURDAY_N2S = departures([
  "8:30", "9:00", "9:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "1:00", "1:30", "2:00", "2:30", "3:00", "3:30", "4:00", "4:30", "5:00", "5:15",
  "5:30", "6:00", "6:30", "7:00", "7:30", "8:00*", "8:30", "9:00", "10:00", "11:00", "12:00"
]);

const SATURDAY_S2N = departures([
  "7:30", "8:00", "8:30", "9:00", "9:30", "10:00", "10:30", "11:00", "11:30", "12:00",
  "12:30", "1:00", "1:30", "2:00", "2:30", "3:00", "3:30", "4:00", "4:30", "5:00",
  "5:30", "6:00", "6:30", "7:00", "7:30", "8:15", "9:15", "10:15", "11:15"
]);

// Saturdays & Holidays
export const saturdayHolidayBus: BusSchedule = {
  nilaToSahyadri: SATURDAY_N2S.times,
  sahyadriToNila: SATURDAY_S2N.times,
  // The circular lists routes 3, 4, 5, 7 and 8 from the working-day schedule,
  // plus route 9 below. Kept in departure order.
  palakkadTown: [
    ...ROUTES_3_AND_4,
    { description: "Sahyadri (1:00 PM) → Nila Gate → Pudussery → Kadamkode → Manapullykavu → Maidaan (Govt. Hospital) → Stadium Bus Stand → Palakkad (1:30 PM) → Stadium Bus Stand (1:30 PM) → Chandranagar → Pudussery → Nila → Saraswati (2:00 PM)" },
    route5("Fri & Sat: runs up to Kinnar stop"),
    ROUTE_7_FRI_SAT,
    ROUTE_8_ALL_DAYS
  ],
  // Saturday's morning Wise Park trip runs 30 minutes later than on weekdays.
  wisePark: [
    { description: `Nila (8:45 AM) → Wise Park Junction (9:00 AM) → Nila Manogata (9:15 AM) → Sahyadri (9:30 AM) (${CONSTRUCTION_NOTE})` },
    wiseParkEvening
  ],
  multipleBusTimings: {
    nilaToSahyadri: multipleTimes(SATURDAY_N2S),
    sahyadriToNila: multipleTimes(SATURDAY_S2N)
  },
  multipleBusPositions: {
    nilaToSahyadri: SATURDAY_N2S.positions,
    sahyadriToNila: SATURDAY_S2N.positions
  }
};

// Sundays — no town or Wise Park service beyond route 8, which runs daily.
export const sundayBus: BusSchedule = {
  nilaToSahyadri: [
    "8:45", "9:15", "10:00", "11:00", "12:00", "12:30", "1:15", "2:00", "3:00", "4:00",
    "5:00", "6:00", "6:30", "7:00", "7:30", "8:00", "8:30", "9:00", "10:00", "11:00", "12:00"
  ],
  sahyadriToNila: [
    "8:00", "8:30", "9:00", "9:30", "10:15", "11:15", "12:15", "12:45", "1:30", "2:15",
    "3:15", "4:15", "5:15", "6:00", "6:30", "7:00", "7:30", "8:15", "9:15", "10:15", "11:15"
  ],
  palakkadTown: [ROUTE_8_ALL_DAYS],
  wisePark: [],
  // The circular bolds nothing on Sundays.
  multipleBusTimings: {
    nilaToSahyadri: [],
    sahyadriToNila: []
  },
  multipleBusPositions: {
    nilaToSahyadri: [],
    sahyadriToNila: []
  }
};

// Institute Holidays 2025
export const holidays2025 = [
  { date: "2025-08-15", occasion: "Independence Day" },
  { date: "2025-09-05", occasion: "Id-e-Milad" },
  { date: "2025-10-01", occasion: "Dussehra (Mahanavami)" },
  { date: "2025-10-02", occasion: "Gandhi Jayanti / Vijayadashami" },
  { date: "2025-10-20", occasion: "Diwali (Deepavali)" },
  { date: "2025-11-05", occasion: "Guru Nanak's Birthday" },
  { date: "2025-12-25", occasion: "Christmas Day" }
];

// Special Academic Days
export const specialDays2025 = [
  { date: "2025-11-08", type: "instructional", note: "Saturday Instructional Day - treat as Working Day" }
];
