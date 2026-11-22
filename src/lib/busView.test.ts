import { describe, expect, it } from 'vitest';
import { BUS_VIEWS, DEFAULT_BUS_VIEW, liveBoard } from './busView';
import { mergeRides, specialRides, toRides, type Ride } from './transitRides';
import { resolveDepartures } from '@/utils/dateUtils';
import { workingDaysBus } from '@/data/busData';
import { workingDaysBuggy } from '@/data/buggyData';
import { bundledSpecialServices } from '@/data/specialServiceData';

// Thursday 22 October 2026, as campus wall-clock time.
const at = (hours: number, minutes: number) => new Date(2026, 9, 22, hours, minutes);
const day = at(0, 0);
const times = (rides: Ride[]) => rides.map((ride) => ride.time);

const nilaBuses = toRides(resolveDepartures(workingDaysBus.nilaToSahyadri, day), 'bus');
const sahyadriBuses = toRides(resolveDepartures(workingDaysBus.sahyadriToNila, day), 'bus');
const sahyadriBuggies = toRides(resolveDepartures(workingDaysBuggy.sahyadriToNila, day), 'buggy');

describe('liveBoard at 5:46 pm, a minute after the 5:45 bus was due', () => {
  const now = at(17, 46);

  it('gives the 6:00 as the next bus', () => {
    expect(times(liveBoard(nilaBuses, [], 'next', now).next)).toEqual(['6:00']);
  });

  it('Next lists every bus after it, not just the one', () => {
    const { grid } = liveBoard(nilaBuses, [], 'next', now);

    expect(times(grid)[0]).toBe('6:30');
    expect(times(grid)[grid.length - 1]).toBe('12:00');
    expect(grid.every((ride) => ride.at > now)).toBe(true);
  });

  it('All day lists every bus of the day in order, the next one included', () => {
    const { grid, next } = liveBoard(nilaBuses, [], 'all', now);

    expect(times(grid)).toEqual(workingDaysBus.nilaToSahyadri);
    expect(grid).toContain(next[0]);
  });
});

describe('liveBoard with an extra bus', () => {
  it('treats it like a regular one', () => {
    // The exam shuttle's 9:10 AM beats the regular 9:25 to "next".
    const [examShuttle] = bundledSpecialServices;
    const buses = mergeRides(nilaBuses, specialRides([examShuttle], 'nilaToSahyadri', day));
    const board = liveBoard(buses, [], 'next', at(9, 6));

    expect(board.next.map((ride) => [ride.time, ride.mode])).toEqual([['9:10 AM', 'special']]);
  });
});

describe('liveBoard with buggies shown', () => {
  const now = at(14, 1);

  it('gives the next bus and the next buggy', () => {
    expect(times(liveBoard(sahyadriBuses, sahyadriBuggies, 'next', now).next)).toEqual(['2:15', '3:00 PM']);
  });

  it('Next leaves both of them out of the list below', () => {
    const { grid } = liveBoard(sahyadriBuses, sahyadriBuggies, 'next', now);

    expect(times(grid)[0]).toBe('2:45');
    expect(times(grid)).not.toContain('2:15');
    expect(times(grid)).not.toContain('3:00 PM');
  });

  it('All day interleaves the two by time', () => {
    const { grid } = liveBoard(sahyadriBuses, sahyadriBuggies, 'all', now);

    expect(grid).toHaveLength(sahyadriBuses.length + sahyadriBuggies.length);
    for (let i = 1; i < grid.length; i += 1) {
      expect(grid[i].at.getTime()).toBeGreaterThanOrEqual(grid[i - 1].at.getTime());
    }
  });
});

describe('liveBoard around the last bus', () => {
  // Thursday's last Sahyadri → Nila bus is the 12:10 just after midnight.
  const justAfterMidnight = (minutes: number) => new Date(2026, 9, 23, 0, minutes);

  it('counts down to it late in the evening', () => {
    expect(times(liveBoard(sahyadriBuses, [], 'next', at(23, 59)).next)).toEqual(['12:10*']);
  });

  it('shows nothing under Next once it is due', () => {
    const board = liveBoard(sahyadriBuses, [], 'next', justAfterMidnight(11));

    expect(board.next).toEqual([]);
    expect(board.grid).toEqual([]);
  });

  it('still lists the whole day under All day', () => {
    const board = liveBoard(sahyadriBuses, [], 'all', justAfterMidnight(30));

    expect(board.next).toEqual([]);
    expect(board.grid).toHaveLength(sahyadriBuses.length);
  });
});

describe('the view switch', () => {
  it('offers only Next and All day', () => {
    expect(BUS_VIEWS.map((option) => option.label)).toEqual(['Next', 'All day']);
  });

  it('opens on Next', () => {
    expect(DEFAULT_BUS_VIEW).toBe('next');
  });
});
