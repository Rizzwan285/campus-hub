/** Accept existing B1/1 spellings, but never guess a batch from malformed input. */
export function firstYearBatch(value?: string | null): number | null {
  const match = /^(?:B)?([1-9]|1\d|2[0-4])$/i.exec(value?.trim() ?? '');
  return match ? Number(match[1]) : null;
}

export interface AcademicProfile {
  program?: string | null;
  branch?: string | null;
  yearOfStudy?: string | null;
  batchNo?: string | null;
}

/** The course selection belongs to this academic context, not a mess or name. */
export function academicContext(profile: AcademicProfile): string {
  return JSON.stringify([
    profile.program ?? '', profile.branch ?? '', profile.yearOfStudy ?? '',
    profile.program === 'UG' && profile.yearOfStudy === '1' ? firstYearBatch(profile.batchNo) : null,
  ]);
}
