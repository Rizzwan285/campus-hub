import { describe, expect, it } from 'vitest';
import {
  formatServiceExceptions,
  formatServiceWindow,
  runsOn,
  serviceStatus,
  servicesRunningOn,
} from './specialServices';
import { mergeRides, specialRides, toRides } from './transitRides';
import { resolveDepartures } from '@/utils/dateUtils';
import { bundledSpecialServices, type SpecialService } from '@/data/specialServiceData';
import { workingDaysBus } from '@/data/busData';

const examShuttle = bundledSpecialServices[0];

/** Local wall date at mid-morning, the way the app's display dates are built. */
const on = (dateKey: string, time = '08:00:00') => new Date(`${dateKey}T${time}`);

describe('the Aug–Dec 2026 end-semester exam shuttle', () => {
  it('matches the Examination Team circular', () => {
    expect(examShuttle.nilaToSahyadri).toEqual(['9:05 AM', '9:10 AM', '12:50 PM']);
    expect(examShuttle.sahyadriToNila).toEqual(['9:05 AM', '12:50 PM']);
    expect(examShuttle.startDate).toBe('2026-11-16');
    expect(examShuttle.endDate).toBe('2026-11-28');
  });

  it('runs on exactly the eleven exam days', () => {
    const running: string[] = [];
    for (let day = 10; day <= 30; day += 1) {
      const key = `2026-11-${day}`;
      if (runsOn(examShuttle, on(key))) running.push(key);
    }

    expect(running).toEqual([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21',
      // 22nd is a Sunday, 24th is Guru Nanak's Birthday.
      '2026-11-23', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28',
    ]);
  });

  it('is gone on the Sunday after the last exam, with nothing to delete', () => {
    expect(runsOn(examShuttle, on('2026-11-28', '23:59:00'))).toBe(true);
    expect(runsOn(examShuttle, on('2026-11-29', '00:00:00'))).toBe(false);
    expect(serviceStatus(examShuttle, on('2026-11-29'))).toBe('ended');
    expect(servicesRunningOn(bundledSpecialServices, on('2026-11-29'))).toEqual([]);
  });

  it('is not shown before the first exam', () => {
    expect(runsOn(examShuttle, on('2026-11-15'))).toBe(false);
    expect(serviceStatus(examShuttle, on('2026-11-14'))).toBe('upcoming');
  });

  it('describes its window and exceptions for the card', () => {
    expect(formatServiceWindow(examShuttle)).toBe('16–28 Nov');
    expect(formatServiceExceptions(examShuttle)).toBe('Sundays and 24 Nov');
  });
});

describe('runsOn', () => {
  const service: SpecialService = {
    id: 1,
    title: 'Test run',
    startDate: '2026-11-28',
    endDate: '2026-12-03',
    skipSundays: false,
    skipDates: [],
    nilaToSahyadri: ['9:05 AM'],
    sahyadriToNila: [],
  };

  it('keeps Sundays when the service says so', () => {
    expect(runsOn(service, on('2026-11-29'))).toBe(true);
    expect(runsOn({ ...service, skipSundays: true }, on('2026-11-29'))).toBe(false);
  });

  it('formats a window that crosses a month, and one with no exceptions', () => {
    expect(formatServiceWindow(service)).toBe('28 Nov – 3 Dec');
    expect(formatServiceWindow({ ...service, endDate: service.startDate })).toBe('28 Nov');
    expect(formatServiceExceptions(service)).toBeNull();
  });
});

describe('special rides on the bus card', () => {
  const monday = on('2026-11-16', '08:58:00');

  it('slots the exam buses between the regular ones by real time', () => {
    const bus = toRides(resolveDepartures(workingDaysBus.nilaToSahyadri, monday), 'bus');
    const special = specialRides([examShuttle], 'nilaToSahyadri', monday);
    const upcoming = mergeRides(bus, special).filter((ride) => ride.at > monday);

    expect(upcoming.slice(0, 4).map((ride) => `${ride.mode} ${ride.time}`)).toEqual([
      'bus 9:00', 'special 9:05 AM', 'special 9:10 AM', 'bus 9:25',
    ]);

    // 12:50 PM lands after the 12:30 bus and before the 1:00 one.
    const labels = mergeRides(bus, special).map((ride) => ride.time);
    const at1250 = labels.indexOf('12:50 PM');
    expect(labels[at1250 - 1]).toBe('12:30');
    expect(labels[at1250 + 1]).toBe('1:00');
  });

  it('carries the service title and leaves bus positions untouched', () => {
    const bus = toRides(resolveDepartures(workingDaysBus.nilaToSahyadri, monday), 'bus');
    const special = specialRides([examShuttle], 'nilaToSahyadri', monday);

    expect(special.every((ride) => ride.label === 'Exam shuttle')).toBe(true);
    for (const ride of mergeRides(bus, special).filter((entry) => entry.mode === 'bus')) {
      expect(workingDaysBus.nilaToSahyadri[ride.index]).toBe(ride.time);
    }
  });

  it('resolves each service separately, so an evening run cannot push another into tomorrow', () => {
    const evening: SpecialService = { ...examShuttle, id: 'evening', title: 'Evening run', nilaToSahyadri: ['6:30 PM'] };
    const early: SpecialService = { ...examShuttle, id: 'early', title: 'Early run', nilaToSahyadri: ['4:00 AM'] };
    const rides = specialRides([evening, early], 'nilaToSahyadri', monday);

    expect(rides.map((ride) => ride.index)).toEqual([0, 1]);
    // Walked as one list, 4:00 AM after 6:30 PM would read as the next morning.
    expect(rides.map((ride) => ride.at.getDate())).toEqual([16, 16]);
  });
});
