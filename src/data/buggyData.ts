export interface BuggySchedule {
  nilaToSahyadri: string[];
  sahyadriToNila: string[];
}

export const buggyEffectiveFrom = "August 2026";

export const BUGGY_DISCLAIMER =
  "These are tentative timings and may vary due to availability or prior allotments.";

// Working Days (Monday – Friday)
export const workingDaysBuggy: BuggySchedule = {
  nilaToSahyadri: [
    "8:15 AM",
    "10:00 AM",
    "10:30 AM",
    "11:00 AM",
    "11:30 AM",
    "12:00 PM",
    "12:45 PM",
    "1:15 PM",
    "2:00 PM",
    "3:00 PM",
    "4:00 PM",
    "4:45 PM",
    "5:30 PM",
    "8:45 PM",
    "9:30 PM",
    "10:30 PM",
    "11:30 PM",
    "12:30 AM",
    "1:00 AM",
    "1:30 AM",
    "2:00 AM",
  ],
  sahyadriToNila: [
    "8:00 AM",
    "10:00 AM",
    "10:30 AM",
    "11:00 AM",
    "11:30 AM",
    "12:00 PM",
    "12:45 PM",
    "1:15 PM",
    "2:00 PM",
    "3:00 PM",
    "4:00 PM",
    "4:45 PM",
    "5:30 PM",
    "9:00 PM",
    "9:45 PM",
    "10:45 PM",
    "11:45 PM",
    "12:45 AM",
    "1:15 AM",
    "1:45 AM",
    "2:15 AM",
  ],
};

// Saturdays & Institute Holidays (Note: strictly NOT Sundays)
export const saturdayHolidayBuggy: BuggySchedule = {
  nilaToSahyadri: [
    "8:00 AM",
    "8:45 AM",
    "9:15 AM",
    "9:45 AM",
    "10:15 AM",
    "12:15 PM",
    "12:45 PM",
    "1:15 PM",
    "1:45 PM",
    "2:15 PM",
    "5:15 PM",
    "5:45 PM",
    "6:15 PM",
    "8:45 PM",
    "9:30 PM",
    "10:30 PM",
    "11:30 PM",
    "12:30 AM",
    "1:00 AM",
    "1:30 AM",
    "2:00 AM",
  ],
  sahyadriToNila: [
    "8:45 AM",
    "9:15 AM",
    "9:45 AM",
    "10:15 AM",
    "12:15 PM",
    "12:45 PM",
    "1:15 PM",
    "1:45 PM",
    "2:15 PM",
    "5:15 PM",
    "5:45 PM",
    "6:15 PM",
    "9:00 PM",
    "9:45 PM",
    "10:45 PM",
    "11:45 PM",
    "12:45 AM",
    "1:15 AM",
    "1:45 AM",
    "2:15 AM",
  ],
};

// Sundays: There are NO buggy services on Sundays
export const sundayBuggy: BuggySchedule = {
  nilaToSahyadri: [],
  sahyadriToNila: [],
};
