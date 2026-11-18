import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BUS_VIEW, liveBoard, readBusView, saveBusView } from './busView';
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

  it('still points out the 5:45, whichever view is chosen', () => {
    for (const view of ['next', 'remaining', 'all'] as const) {
      expect(times(liveBoard(nilaBuses, [], view, now).late)).toEqual(['5:45']);
    }
  });

  it('gives the 6:00 as the next bus', () => {
    expect(times(liveBoard(nilaBuses, [], 'next', now).next)).toEqual(['6:00']);
  });

  it('Next lists nothing beyond it', () => {
    expect(liveBoard(nilaBuses, [], 'next', now).grid).toEqual([]);
  });

  it('Remaining lists what comes after the next bus', () => {
    const { grid } = liveBoard(nilaBuses, [], 'remaining', now);

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

describe('liveBoard late notices', () => {
  it('starts the moment a bus is due and lasts ten minutes', () => {
    expect(liveBoard(nilaBuses, [], 'next', at(17, 44)).late).toEqual([]);
    expect(times(liveBoard(nilaBuses, [], 'next', at(17, 45)).late)).toEqual(['5:45']);
    expect(times(liveBoard(nilaBuses, [], 'next', at(17, 54)).late)).toEqual(['5:45']);
    expect(liveBoard(nilaBuses, [], 'next', at(17, 55)).late).toEqual([]);
  });

  it('names only the latest of two buses due close together', () => {
    // Sahyadri → Nila has an 8:55 and a 9:00.
    expect(times(liveBoard(sahyadriBuses, [], 'next', at(9, 1)).late)).toEqual(['9:00']);
  });

  it('names a late buggy separately from a late bus, only when buggies are shown', () => {
    // The 1:55 bus and the 2:00 PM buggy are both a few minutes old at 2:01.
    expect(times(liveBoard(sahyadriBuses, sahyadriBuggies, 'next', at(14, 1)).late)).toEqual(['1:55', '2:00 PM']);
    expect(times(liveBoard(sahyadriBuses, [], 'next', at(14, 1)).late)).toEqual(['1:55']);
  });

  it('treats an extra bus like a regular one', () => {
    // The exam shuttle's 9:05 AM is due after the regular 9:00, and its 9:10 AM
    // beats the regular 9:25 to "next".
    const [examShuttle] = bundledSpecialServices;
    const buses = mergeRides(nilaBuses, specialRides([examShuttle], 'nilaToSahyadri', day));
    const board = liveBoard(buses, [], 'next', at(9, 6));

    expect(board.late.map((ride) => [ride.time, ride.mode])).toEqual([['9:05 AM', 'special']]);
    expect(board.next.map((ride) => [ride.time, ride.mode])).toEqual([['9:10 AM', 'special']]);
  });
});

describe('liveBoard with buggies shown', () => {
  const now = at(14, 1);

  it('gives the next bus and the next buggy', () => {
    expect(times(liveBoard(sahyadriBuses, sahyadriBuggies, 'next', now).next)).toEqual(['2:15', '3:00 PM']);
  });

  it('Remaining leaves both of them out of the list below', () => {
    const { grid } = liveBoard(sahyadriBuses, sahyadriBuggies, 'remaining', now);

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

  it('leaves only the late notice once it is due', () => {
    const board = liveBoard(sahyadriBuses, [], 'remaining', justAfterMidnight(11));

    expect(board.next).toEqual([]);
    expect(board.grid).toEqual([]);
    expect(times(board.late)).toEqual(['12:10*']);
  });

  it('still lists the whole day under All day', () => {
    const board = liveBoard(sahyadriBuses, [], 'all', justAfterMidnight(30));

    expect(board.next).toEqual([]);
    expect(board.late).toEqual([]);
    expect(board.grid).toHaveLength(sahyadriBuses.length);
  });
});

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => { store.delete(key); },
    setItem: (key, value) => { store.set(key, String(value)); },
  };
}

describe('the remembered view', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('starts on the whole day', () => {
    expect(DEFAULT_BUS_VIEW).toBe('all');
    expect(readBusView()).toBe('all');
  });

  it('comes back as it was last chosen', () => {
    saveBusView('next');
    expect(readBusView()).toBe('next');
    saveBusView('remaining');
    expect(readBusView()).toBe('remaining');
  });

  it('ignores a saved value it does not know', () => {
    localStorage.setItem('campus-bus-view', 'everything');
    expect(readBusView()).toBe('all');
  });

  it('works without storage, as in a private window', () => {
    const blocked = memoryStorage();
    blocked.getItem = () => { throw new Error('denied'); };
    blocked.setItem = () => { throw new Error('denied'); };
    vi.stubGlobal('localStorage', blocked);

    expect(() => saveBusView('next')).not.toThrow();
    expect(readBusView()).toBe('all');
  });
});
