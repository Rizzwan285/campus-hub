export interface ClassSlot {
  time: string;
  subject: string;
  room: string;
}

export interface DaySchedule {
  day: string;
  slots: ClassSlot[];
}

// Timetable for Aug-Dec 2026
// MWF: No classes scheduled
// TuTh: Multi Agent Systems, Information Retrieval, Linear Algebra for Engineers

export const timetable: DaySchedule[] = [
  {
    day: 'Monday',
    slots: [],
  },
  {
    day: 'Tuesday',
    slots: [
      { time: '9:00 - 10:15', subject: 'Multi Agent Systems', room: '212' },
      { time: '10:30 - 11:45', subject: 'Information Retrieval', room: '212' },
      { time: '3:30 - 4:45', subject: 'Linear Algebra for Engineers', room: '103' },
    ],
  },
  {
    day: 'Wednesday',
    slots: [],
  },
  {
    day: 'Thursday',
    slots: [
      { time: '9:00 - 10:15', subject: 'Information Retrieval', room: '212' },
      { time: '10:30 - 11:45', subject: 'Multi Agent Systems', room: '212' },
      { time: '2:00 - 3:15', subject: 'Linear Algebra for Engineers', room: '103' },
    ],
  },
  {
    day: 'Friday',
    slots: [],
  },
  {
    day: 'Saturday',
    slots: [],
  },
  {
    day: 'Sunday',
    slots: [],
  },
];
