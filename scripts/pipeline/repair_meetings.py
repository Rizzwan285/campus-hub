"""
Recomputes course `meetings` from each course's `rawSlot` using the slot
definitions, and reports or repairs any that disagree.

Exists because an earlier slot parser mishandled day restrictions
("D [Mon,Wed]"), which both dropped real classes and invented ones that do not
meet. Run after regenerating the timetable JSON:

    python3 scripts/pipeline/repair_meetings.py            # dry run
    python3 scripts/pipeline/repair_meetings.py --apply    # write changes

Deliberately skips three categories it must not touch:
  * first-year lab rotations, where one slot legitimately becomes several
    meetings with batch-specific rooms ("D-03 Workshop (B1-B4)");
  * courses listed on several rows of one workbook under different slots
    (BT2010 runs in both "M" and "R1"), since the JSON keeps only one rawSlot
    and rebuilding from it would delete the other row's classes;
  * slots carrying a free-text remark ("Tue swapped to Thu"), which needs a
    human to interpret.
"""
import argparse
import json
import re
import sys
from pathlib import Path

from normalize import normalize_slot_expression, generate_meetings

ROOT = Path(__file__).resolve().parents[2]
TIMETABLE_DIR = ROOT / 'src' / 'data' / 'timetable'
SOURCE_DIR = ROOT / 'raw_data' / 'Timetable_md'

# "(B1-B4)" and friends mark a batch rotation.
BATCH_ROOM_RE = re.compile(r'\bB\s*\d+\s*-\s*B?\s*\d+', re.IGNORECASE)


def _source_files():
    # One of the workbooks was exported without a .md suffix.
    return [p for p in SOURCE_DIR.iterdir() if p.is_file()] if SOURCE_DIR.is_dir() else []


def load_source_rows(slots):
    """
    Returns (rows, multi_slot_codes).

    rows: courseCode -> {'instructor', 'room'} for filling in new meetings.
    multi_slot_codes: codes listed twice *within one workbook* under different
    slots — BT2010 appears under both "M" and "R1". The JSON keeps a single
    rawSlot, so recomputing from it would delete the other row's real classes.
    Those courses are left alone.
    """
    rows = {}
    per_file = {}

    for path in _source_files():
        for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
            if not line.startswith('|'):
                continue
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if len(cells) < 7 or cells[0] in ('Course Code', ':---'):
                continue
            code = cells[0]
            if not re.fullmatch(r'[A-Z]{2}\d{4}[A-Z]?', code):
                continue

            rows.setdefault(code, {'instructor': cells[4], 'room': cells[6]})

            # Only count entries that name at least one real slot, so "TBD" and
            # blank cells do not look like a second timetable row.
            if generate_meetings(normalize_slot_expression(cells[5]), slots):
                key = re.sub(r'\s+', '', cells[5]).lower()
                per_file.setdefault((path.name, code), set()).add(key)

    multi = {code for (_, code), variants in per_file.items() if len(variants) > 1}
    return rows, multi


def meeting_key(meeting):
    return (meeting['type'], meeting['day'], meeting['startTime'])


def repair_course(course, slots, source_rows, multi_slot_codes):
    """Returns (status, detail, new_meetings)."""
    raw = (course.get('rawSlot') or '').strip()
    if not raw:
        return 'no-slot', '', None

    expressions = normalize_slot_expression(raw)
    notes = [e['note'] for e in expressions if e.get('note')]
    expected = generate_meetings(expressions, slots)

    if not expected:
        return 'unresolvable', f'no slots matched ({raw!r})', None

    existing = course.get('meetings', [])

    if any(BATCH_ROOM_RE.search(m.get('room') or '') for m in existing):
        return 'skip-batch', 'batch rotation rooms', None

    if course['courseCode'] in multi_slot_codes:
        return 'skip-multi', 'course has several slot rows in one workbook', None

    if notes:
        return 'skip-note', '; '.join(notes), None

    if {meeting_key(m) for m in existing} == {meeting_key(m) for m in expected}:
        return 'ok', '', None

    by_key = {meeting_key(m): m for m in existing}
    by_type = {}
    for m in existing:
        by_type.setdefault(m['type'], m)
    fallback = source_rows.get(course['courseCode'], {})

    rebuilt = []
    for want in expected:
        keep = by_key.get(meeting_key(want))
        if keep:
            rebuilt.append(keep)
            continue

        # A new meeting: inherit room/instructors from a sibling of the same
        # type, then any sibling, then the source workbook row.
        donor = by_type.get(want['type']) or (existing[0] if existing else None)
        rebuilt.append({
            'type': want['type'],
            'day': want['day'],
            'startTime': want['startTime'],
            'endTime': want['endTime'],
            'room': (donor or {}).get('room') or fallback.get('room', ''),
            'instructors': list((donor or {}).get('instructors')
                                or ([fallback['instructor']] if fallback.get('instructor') else [])),
            'recurrence': {'type': 'weekly'},
        })

    added = [m for m in rebuilt if meeting_key(m) not in by_key]
    removed = [m for m in existing if meeting_key(m) not in {meeting_key(x) for x in rebuilt}]
    detail = f'+{len(added)} -{len(removed)}'
    return 'repair', detail, rebuilt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='write changes to disk')
    args = parser.parse_args()

    slots = json.loads((TIMETABLE_DIR / 'slots.json').read_text())
    source_rows, multi_slot_codes = load_source_rows(slots)

    counts = {}
    changed_files = 0

    for path in sorted(TIMETABLE_DIR.glob('*/*.json')):
        courses = json.loads(path.read_text())
        rel = path.relative_to(TIMETABLE_DIR)
        file_changed = False

        for course in courses:
            status, detail, rebuilt = repair_course(course, slots, source_rows, multi_slot_codes)
            counts[status] = counts.get(status, 0) + 1

            if status in ('ok', 'no-slot'):
                continue

            marker = {'repair': 'FIX ', 'skip-batch': 'skip', 'skip-note': 'note',
                      'skip-multi': 'multi', 'unresolvable': '????'}[status]
            print(f'  {marker} {rel}  {course["courseCode"]:9} {course["rawSlot"][:30]:30} {detail}')

            if status == 'repair':
                for m in course.get('meetings', []):
                    if meeting_key(m) not in {meeting_key(x) for x in rebuilt}:
                        print(f'        - {m["type"]:8} {m["day"]:9} {m["startTime"]}')
                for m in rebuilt:
                    if meeting_key(m) not in {meeting_key(x) for x in course.get('meetings', [])}:
                        print(f'        + {m["type"]:8} {m["day"]:9} {m["startTime"]}  {m["room"]}')
                course['meetings'] = rebuilt
                file_changed = True

        if file_changed and args.apply:
            path.write_text(json.dumps(courses, indent=2, ensure_ascii=False))
            changed_files += 1

    print()
    for status in sorted(counts):
        print(f'  {status:14} {counts[status]}')
    print()
    print(f'{"WROTE " + str(changed_files) + " file(s)." if args.apply else "Dry run — no files written. Re-run with --apply."}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
