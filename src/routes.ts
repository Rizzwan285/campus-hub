import { Building2, Calendar, CalendarOff, GraduationCap, Home, type LucideIcon } from 'lucide-react';

/**
 * The student pages, their tabs and the old addresses that now point into
 * them. App.tsx builds its routes from these lists and AppLayout its
 * navigation, so a moved page cannot leave a dead link behind.
 */

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

/** At most five: that is what fits the phone's bottom bar at 360px. */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/timetable', label: 'Timetable', icon: Calendar },
  { path: '/academics', label: 'Academics', icon: GraduationCap },
  { path: '/campus', label: 'Campus', icon: Building2 },
  { path: '/leave', label: 'Leave', icon: CalendarOff },
];

/** Section anchors on each page, so a link or redirect can land on one. */
export const PAGE_SECTIONS: Record<string, string[]> = {
  '/academics': ['calendar', 'library', 'portals'],
  '/campus': ['food-and-contacts', 'gym', 'hostel'],
  '/leave': ['leave-form', 'holidays'],
};

/** Addresses people may have bookmarked, and where each one lives now. */
export const LEGACY_REDIRECTS: Array<{ from: string; to: string }> = [
  { from: '/food', to: '/' },
  { from: '/buggy', to: '/' },
  { from: '/buggy-timings', to: '/' },
  { from: '/bus-timings', to: '/' },
  { from: '/holidays', to: '/leave#holidays' },
  // Gym had its own tab until Nov 2026; it is a section of Campus now.
  { from: '/gym', to: '/campus#gym' },
  { from: '/library', to: '/academics#library' },
];
