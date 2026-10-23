import { describe, expect, it } from 'vitest';
import { mergeRides, toRides } from './transitRides';
import { resolveDepartures } from '@/utils/dateUtils';
import { workingDaysBus, saturdayHolidayBus } from '@/data/busData';
import { workingDaysBuggy, sundayBuggy } from '@/data/buggyData';

const reference = new Date('2026-10-22T09:00:00');

describe('toRides', () => {
  it('keeps each departure position, which is what identifies a doubled bus', () => {
    const rides = toRides(resolveDepartures(workingDaysBus.nilaToSahyadri, reference), 'bus');

    expect(rides).toHaveLength(workingDaysBus.nilaToSahyadri.length);
    expect(rides.map((ride) => ride.index)).toEqual(rides.map((_, index) => index));
    expect(rides.every((ride) => ride.mode === 'bus')).toBe(true);
  });

  it('survives filtering: the index still points into the full day', () => {
    const rides = toRides(resolveDepartures(workingDaysBus.sahyadriToNila, reference), 'bus')
      .filter((ride) => ride.at > reference);

    for (const ride of rides) {
      expect(workingDaysBus.sahyadriToNila[ride.index]).toBe(ride.time);
    }
  });
});

describe('mergeRides', () => {
  it('interleaves buggies between buses in time order', () => {
    const bus = toRides(resolveDepartures(workingDaysBus.nilaToSahyadri, reference), 'bus');
    const buggy = toRides(resolveDepartures(workingDaysBuggy.nilaToSahyadri, reference), 'buggy');
    const merged = mergeRides(bus, buggy);

    expect(merged).toHaveLength(bus.length + buggy.length);
    for (let i = 1; i < merged.length; i += 1) {
      expect(merged[i].at.getTime()).toBeGreaterThanOrEqual(merged[i - 1].at.getTime());
    }
    // Both kinds really are mixed rather than concatenated.
    const modes = merged.map((ride) => ride.mode).join('');
    expect(modes).toContain('busbuggy');
    expect(modes).toContain('buggybus');
  });

  it('orders post-midnight trips after the evening ones, not back in the morning', () => {
    const bus = toRides(resolveDepartures(saturdayHolidayBus.sahyadriToNila, reference), 'bus');
    const buggy = toRides(resolveDepartures(workingDaysBuggy.sahyadriToNila, reference), 'buggy');
    const merged = mergeRides(bus, buggy);

    const last = merged[merged.length - 1];
    expect(last.at.getDate()).toBe(reference.getDate() + 1);
    expect(last.at.getHours()).toBeLessThan(6);
  });

  it('puts the bus first when a bus and a buggy share an instant', () => {
    const at = new Date('2026-10-22T10:00:00');
    const merged = mergeRides(
      [{ time: '10:00', at, mode: 'bus', index: 3 }],
      [{ time: '10:00 AM', at: new Date(at), mode: 'buggy', index: 1 }],
    );

    expect(merged.map((ride) => ride.mode)).toEqual(['bus', 'buggy']);
  });

  it('is the plain bus list when there are no buggies, as on a Sunday', () => {
    const bus = toRides(resolveDepartures(workingDaysBus.nilaToSahyadri, reference), 'bus');
    const buggy = toRides(resolveDepartures(sundayBuggy.nilaToSahyadri, reference), 'buggy');

    expect(mergeRides(bus, buggy)).toEqual(bus);
  });
});
