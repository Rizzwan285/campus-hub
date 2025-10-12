export interface BusRoute {
  description: string;
}

export interface BusSchedule {
  nilaToSahyadri: string[];
  sahyadriToNila: string[];
  palakkadTown?: BusRoute[];
  wisePark?: BusRoute[];
}

// Working Days
export const workingDaysBus: BusSchedule = {
  nilaToSahyadri: [
    "8:30", "9:25", "9:45", "10:20", "10:45", "11:15", "11:50", "12:15", "12:30",
    "1:00", "1:30", "1:45", "2:15", "2:45", "3:20", "3:45", "4:30", "5:00", "5:15",
    "5:45", "6:00", "6:30", "7:00", "7:30", "8:00", "8:30", "9:00", "10:00", "11:00", "12:00"
  ],
  sahyadriToNila: [
    "7:45", "8:15", "8:30", "8:45", "9:00", "9:25", "9:45", "10:20", "10:45", "11:15",
    "11:50", "12:15", "12:30", "1:00", "1:30", "1:45", "2:15", "2:45", "3:20", "3:45",
    "4:30", "5:00", "5:15", "5:45", "6:00", "6:30", "7:00", "7:30", "8:00", "9:15",
    "10:15", "11:15"
  ],
  palakkadTown: [
    { description: "Nila Gate 7:40 AM → Palakkad 8:25 AM → Kadamkode → Manapullykavu → Maidaan (Govt. Hospital) → Stadium Bus Stand → Kalmandapam → Chandranagar → Pudussery → Nila Gate → Sahyadri 8:55 AM" },
    { description: "Nila Gate 7:55 AM → Kalleppulley 8:25 AM → Koppam → Sekharipuram → Mattumantha → Malampuzha → Nila Gate → Sahyadri 8:55 AM" },
    { description: "Palakkad 8:00 AM → Kadamkode → Manapullykavu → Maidaan (Govt. Hospital) → Stadium Bus Stand → Kalmandapam → Chandranagar → Pudussery → Nila Gate → Sahyadri 8:30 AM" },
    { description: "Sahyadri 5:10 PM → Nila Gate → Pudussery → Kadamkode → Manapullykavu → Maidaan (Govt. Hospital) → Stadium Bus Stand → Palakkad 5:40 PM → Stadium Bus Stand 5:45 PM → Chandranagar → Pudussery → Nila. (On Fridays: Sahyadri 5:10 PM to Kinar Stop)" },
    { description: "Sahyadri 5:20 PM → Nila Manogata → Malampuzha Road → Mattumantha → Sekharipuram → Koppam → Kalleppulley 5:55 PM → Sekharipuram 5:50 PM → Chandranagar → Pudussery → Nila" }
  ],
  wisePark: [
    { description: "Nila 8:15 AM → Wise Park Junction 8:30 AM → Nila Manogata 8:45 AM → Sahyadri 9:00 AM (service roads only)" },
    { description: "Sahyadri 6:15 PM → Nila Gate → Wise Park Junction 6:45 PM → Nila Manogata 7:00 PM (service roads only)" }
  ]
};

// Saturdays & Holidays
export const saturdayHolidayBus: BusSchedule = {
  nilaToSahyadri: [
    "8:30", "9:00", "9:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
    "1:00", "1:30", "2:00", "2:30", "3:00", "3:30", "4:00", "4:30", "5:00", "5:15",
    "5:30", "6:00", "6:30", "7:00", "7:30", "8:00", "8:30", "9:00", "10:00", "11:00", "12:00"
  ],
  sahyadriToNila: [
    "7:30", "8:00", "8:30", "9:00", "9:30", "10:00", "10:30", "11:00", "11:30", "12:00",
    "12:30", "1:00", "1:30", "2:00", "2:30", "3:00", "3:30", "4:00", "4:30", "5:00",
    "5:30", "6:00", "6:30", "7:00", "7:30", "8:15", "9:15", "10:15", "11:15"
  ],
  palakkadTown: [
    { description: "Nila Gate 7:40 AM → Palakkad 8:25 AM → Kadamkode → Manapullykavu → Maidaan (Govt. Hospital) → Stadium Bus Stand → Kalmandapam → Chandranagar → Pudussery → Nila Gate → Sahyadri 8:55 AM" },
    { description: "Nila Gate 7:55 AM → Kalleppulley 8:25 AM → Koppam → Sekharipuram → Mattumantha → Malampuzha → Nila Gate → Sahyadri 8:55 AM" },
    { description: "Sahyadri 5:10 PM → Nila Gate → Pudussery → Kadamkode → Manapullykavu → Maidaan (Govt. Hospital) → Stadium Bus Stand → Palakkad 5:40 PM → Stadium Bus Stand 5:45 PM → Chandranagar → Pudussery → Nila" },
    { description: "Sahyadri 1:00 PM → Nila Gate → Pudussery → Kadamkode → Manapullykavu → Maidaan (Govt. Hospital) → Stadium Bus Stand → Palakkad 1:30 PM → Stadium Bus Stand 1:30 PM → Chandranagar → Pudussery → Nila → Saraswati 2:00 PM" }
  ],
  wisePark: [
    { description: "Nila 8:45 AM → Wise Park Junction 9:00 AM → Nila Manogata 9:15 AM → Sahyadri 9:30 AM (service roads only)" },
    { description: "Sahyadri 6:15 PM → Nila Gate → Wise Park Junction 6:45 PM → Nila Manogata 7:00 PM" }
  ]
};

// Sundays
export const sundayBus: BusSchedule = {
  nilaToSahyadri: [
    "8:45", "9:15", "10:00", "11:00", "12:00", "12:30", "1:15", "2:00", "3:00", "4:00",
    "5:00", "6:00", "6:30", "7:00", "7:30", "8:00", "8:30", "9:00", "10:00", "11:00", "12:00"
  ],
  sahyadriToNila: [
    "8:00", "8:30", "9:00", "9:30", "10:15", "11:15", "12:15", "12:45", "1:30", "2:15",
    "3:15", "4:15", "5:15", "6:00", "6:30", "7:00", "7:30", "8:15", "9:15", "10:15", "11:15"
  ]
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
