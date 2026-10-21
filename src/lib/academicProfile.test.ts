import { describe, expect, it } from 'vitest';
import { academicContext, firstYearBatch } from './academicProfile';

describe('first-year batches', () => {
  it.each(['B1', 'b12', '24', ' B3 '])('accepts %s', value => {
    expect(firstYearBatch(value)).toBeGreaterThan(0);
  });
  it.each(['', 'B0', 'B25', '-1', '1.5', 'batch12', 'B1B2', null])('rejects %s', value => {
    expect(firstYearBatch(value)).toBeNull();
  });
  it('normalizes batch spelling and ignores obsolete batches outside first year', () => {
    const profile = { program: 'UG', branch: 'CSE', yearOfStudy: '1', batchNo: 'B3' };
    expect(academicContext(profile)).toBe(academicContext({ ...profile, batchNo: '3' }));
    expect(academicContext(profile)).not.toBe(academicContext({ ...profile, batchNo: 'B13' }));
    expect(academicContext({ ...profile, yearOfStudy: '4' })).toBe(academicContext({ ...profile, yearOfStudy: '4', batchNo: null }));
  });
});
