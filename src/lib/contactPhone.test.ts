import { describe, expect, it } from 'vitest';
import { dialableNumber, isHttpsLink, telHref } from './contactPhone';
import { bundledContacts } from '@/data/contactsData';

describe('tel: links', () => {
  it('adds +91 to a ten-digit Indian mobile number', () => {
    expect(telHref('9947872907')).toBe('tel:+919947872907');
    expect(telHref('9895314214')).toBe('tel:+919895314214');
  });

  it('leaves a number that already has +91 as it is', () => {
    expect(telHref('+914912092271')).toBe('tel:+914912092271');
    expect(telHref('+914912092270')).toBe('tel:+914912092270');
  });

  it('ignores the spaces and hyphens people type', () => {
    expect(telHref(' 99478-72907 ')).toBe('tel:+919947872907');
    expect(telHref('+91 491 209 2271')).toBe('tel:+914912092271');
    expect(telHref('(0491) 209-2271')).toBe('tel:+914912092271');
  });

  it('replaces the trunk 0 with +91', () => {
    expect(dialableNumber('04912092271')).toBe('+914912092271');
  });

  it('dials short service numbers and other countries as written', () => {
    expect(telHref('108')).toBe('tel:108');
    expect(telHref('1091')).toBe('tel:1091');
    expect(telHref('+44 20 7946 0958')).toBe('tel:+442079460958');
  });

  it('refuses text that would not dial', () => {
    for (const bad of ['', '   ', '12345', '1234567890', '0123456789', '+91 12345', '+9199478729070',
      '99478 72907 ext 2', 'call me', '+0123456789', '99999999999999999999999']) {
      expect(dialableNumber(bad), bad).toBeNull();
      expect(telHref(bad), bad).toBeNull();
    }
  });

  it('gives every bundled number a working link, shown exactly as supplied', () => {
    const phones = bundledContacts.flatMap((category) => category.contacts.flatMap((contact) => contact.phones));
    expect(phones).toHaveLength(14);
    for (const phone of phones) {
      expect(telHref(phone), phone).toMatch(/^tel:\+91[2-9]\d{9}$/);
    }
  });
});

describe('links', () => {
  it('accepts full https addresses, including the supplied map links', () => {
    expect(isHttpsLink('https://share.google/r8pAvNmRzwobyanZ1')).toBe(true);
    expect(isHttpsLink('https://maps.app.goo.gl/abc')).toBe(true);
  });

  it('refuses anything else', () => {
    for (const bad of ['http://share.google/x', 'javascript:alert(1)', 'share.google/x', 'https://',
      'https://localhost/x', 'https://user:pass@example.com/', `https://example.com/${'x'.repeat(500)}`]) {
      expect(isHttpsLink(bad), bad).toBe(false);
    }
  });

  it('holds for every bundled link', () => {
    const links = bundledContacts.flatMap((category) => category.contacts.map((contact) => contact.link)).filter(Boolean);
    expect(links).toHaveLength(3);
    for (const link of links) expect(isHttpsLink(link!)).toBe(true);
  });
});
