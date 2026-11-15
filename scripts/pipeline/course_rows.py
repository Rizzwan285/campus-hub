"""
Reads one institute course workbook into courses with structured schedules.

A course is not always one row. The first-year sheets merge the code and name
cells over several rows and give each row its own slot and room:

    ME1130 | A (Mon) | C06-105 (B1-B5)
           | A (Mon) | C06-106 (B6-B10)
           | PM1     | A01-112 (Drawing Hall) (B1-B5)

so rows are grouped into blocks first, and each row of a block becomes slot
assignments carrying that row's room and batches. Every course keeps the file,
sheet, row number and original cell values it was read from.
"""
import re

from slot_expressions import (
    BLOCKING, INFO, REVIEW, clean_text, issue, parse_room_cell, parse_slot_cell,
    split_top_level, unusual_room,
)
from xlsx_reader import read_workbook

CODE_RE = re.compile(r'^[A-Z]{2,3}[0-9]{3,4}[A-Za-z]?$')
_SCHEDULING_WORDS = re.compile(
    r'slot|timing|\btime\b|batch|\balt\b|alternate|week|start|adjust|delay|\d\s*[:.]\s*\d\d|\b\d{1,2}\s*(?:am|pm)\b|'
    r'saturday|sunday|parallel|swap|shift|\bhall\b|venue|workshop|half of the semester|contact mode',
    re.IGNORECASE,
)

_EXAM_REMARK_RE = re.compile(r'exam\s*slot\s*:?\s*[A-Za-z0-9-]+', re.IGNORECASE)

# header text (lower-cased) -> field
_COLUMN_RULES = [
    ('code', lambda h: h == 'code' or h.startswith('course code') or h == 'course no'),
    ('name', lambda h: 'course name' in h),
    ('credits', lambda h: h.startswith('credit')),
    ('slot', lambda h: h.startswith('slot')),
    ('room', lambda h: h.startswith('room') or h.startswith('venue')),
    ('remarks', lambda h: h.startswith('rema')),
    ('primary', lambda h: h.startswith('prim') or h == 'faculty' or h == 'instructor'),
    ('additional', lambda h: h.startswith('additional')),
    ('availability', lambda h: h.startswith('availability')),
]


def determine_category(sheet_name):
    """The sheet a course sits on is the only category the workbooks give."""
    lowered = clean_text(sheet_name).lower()
    if 'backlog' in lowered:
        return 'backlog'
    if 'project' in lowered:
        return 'project'
    if lowered in ('core', 'core courses'):
        return 'core'
    if lowered in ('elective', 'electives'):
        return 'electives'
    return lowered


_BRANCH_ALIASES = {'cam': 'CAM'}


def determine_program_branch(filename):
    """
    '11_PG_MTech_CaM_Aug-Dec-2026.xlsx' -> ('PG', 'CAM'), matching the branch
    names profiles and earlier semesters already use. Returns (None, None)
    when the name does not follow the institute's pattern.
    """
    stem = re.sub(r'\.xlsx$', '', filename, flags=re.IGNORECASE)
    match = re.match(r'^\d+[a-z]?_(UG|PG)_(.+?)_(?:Jan|Aug)\b', stem, flags=re.IGNORECASE)
    if not match:
        return None, None
    program = match.group(1).upper()
    branch = re.sub(r'\(.*', '', match.group(2))          # "CommonCourses(InstCore_...)"
    branch = re.sub(r'^MTech[_ ]+', '', branch, flags=re.IGNORECASE)
    words = [w for w in re.split(r'[^A-Za-z0-9]+', branch) if w]
    branch = '_'.join(words)
    return program, _BRANCH_ALIASES.get(branch.lower(), branch) or None


def _find_header(rows):
    for index, row in enumerate(rows[:25]):
        cells = [clean_text(c).lower() for c in row]
        if any(c == 'code' or c.startswith('course code') for c in cells) and any('course name' in c for c in cells):
            return index
    return None


def _map_columns(header_row):
    columns, headers = {}, {}
    for index, cell in enumerate(header_row):
        text = clean_text(cell)
        if not text:
            continue
        headers[index] = text
        lowered = text.lower()
        for field, rule in _COLUMN_RULES:
            if field not in columns and rule(lowered):
                columns[field] = index
                break
    return columns, headers


def _vertical_merges(merges, column):
    """{top_row: bottom_row} for merges that cover `column`."""
    return {r1: r2 for (r1, c1, r2, c2) in merges if c1 <= column <= c2 and r2 > r1}


_EMAIL_ONLY_RE = re.compile(r'^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$')


def _split_people(*cells):
    people = []
    for cell in cells:
        previous = None
        for piece in re.split(r'[\n;]+', str(cell or '')):
            piece = clean_text(piece).strip(',')
            if not piece or piece in ('-', 'NA', 'N.A.'):
                continue
            # "Swapnil Hingmire" on one line and the address on the next is
            # one person, not two.
            if previous is not None and _EMAIL_ONLY_RE.match(piece) and '@' not in people[previous]:
                people[previous] = f'{people[previous]} ({piece})'
                previous = None
                continue
            if piece not in people:
                people.append(piece)
                previous = len(people) - 1
            else:
                previous = None
    return people


def parse_workbook(source, filename, slot_definitions, program=None, branch=None):
    """
    Returns {'file', 'program', 'branch', 'sheets', 'courses', 'warnings'}.
    `source` is a path or the file's bytes.
    """
    detected_program, detected_branch = determine_program_branch(filename)
    program = program or detected_program
    branch = branch or detected_branch
    result = {'file': filename, 'program': program, 'branch': branch,
              'sheets': [], 'courses': [], 'warnings': []}

    try:
        sheets = read_workbook(source)
    except Exception as error:  # noqa: BLE001 - a bad upload is a report, not a crash
        result['warnings'].append({'file': filename, 'sheet': None, 'row': None,
                                   'message': f'Could not read this workbook: {error}'})
        return result

    if not program or not branch:
        result['warnings'].append({
            'file': filename, 'sheet': None, 'row': None,
            'message': 'Could not tell the programme and branch from the file name. '
                       'Set them for this file and import again.'})
        return result

    by_code = {}
    for sheet in sheets:
        summary = {'name': sheet['name'], 'headerRow': None, 'courses': 0}
        result['sheets'].append(summary)
        header_index = _find_header(sheet['rows'])
        if header_index is None:
            if any(any(cell for cell in row) for row in sheet['rows']):
                result['warnings'].append({
                    'file': filename, 'sheet': sheet['name'], 'row': None,
                    'message': 'No "Code" / "Course Name" header row found; sheet skipped.'})
            continue
        summary['headerRow'] = header_index + 1

        columns, headers = _map_columns(sheet['rows'][header_index])
        for needed in ('slot', 'room'):
            if needed not in columns:
                result['warnings'].append({
                    'file': filename, 'sheet': sheet['name'], 'row': header_index + 1,
                    'message': f'This sheet has no "{needed.title()}" column.'})

        for block in _blocks(sheet, header_index, columns, headers, filename):
            if block['orphan']:
                course = _orphan_course(block, sheet['name'], program, branch)
            else:
                course = _course_from_block(block, sheet['name'], program, branch, slot_definitions)
            summary['courses'] += 1

            existing = by_code.get(course['courseCode'])
            if existing is None:
                by_code[course['courseCode']] = course
                result['courses'].append(course)
            else:
                _merge_duplicate(existing, course)

    for course in result['courses']:
        _finish(course)
    return result


def _blocks(sheet, header_index, columns, headers, filename):
    rows = sheet['rows']
    code_col, name_col = columns['code'], columns['name']
    code_merges = _vertical_merges(sheet['merges'], code_col)

    def cell(row_index, field):
        col = columns.get(field)
        if col is None or row_index >= len(rows) or col >= len(rows[row_index]):
            return ''
        return str(rows[row_index][col] or '').strip()

    def source_row(row_index):
        values = {}
        for col, header in headers.items():
            if col < len(rows[row_index]) and rows[row_index][col] not in (None, ''):
                values[header] = str(rows[row_index][col])
        return {'file': filename, 'sheet': sheet['name'], 'row': row_index + 1, 'cells': values}

    blocks, current, merged_until = [], None, -1
    for index in range(header_index + 1, len(rows)):
        code = cell(index, 'code').replace(' ', '')
        name = clean_text(cell(index, 'name'))
        has_schedule = bool(cell(index, 'slot') or cell(index, 'room'))

        if code:
            if not CODE_RE.match(code) or len(code) > 12:
                current = None      # instructions and footnotes under the table
                continue
            current = {'code': code, 'rows': [index], 'orphan': False}
            merged_until = code_merges.get(index, index)
            blocks.append(current)
        elif not name and not has_schedule:
            continue                # an empty row; it does not end the block
        elif current is not None and (index <= merged_until or not name):
            current['rows'].append(index)
        elif has_schedule:
            # A slot or room on a row with a name but no code, outside any
            # course's merged rows: nothing says which course it belongs to.
            blocks.append({'code': None, 'rows': [index], 'orphan': True})
            current = None

    for block in blocks:
        block['cell'] = cell
        block['source'] = [source_row(i) for i in block['rows']]
    return blocks


def _orphan_course(block, sheet_name, program, branch):
    index = block['rows'][0]
    cell = block['cell']
    name = clean_text(cell(index, 'name'))
    return {
        'program': program, 'branch': branch,
        'courseCode': f'NOCODE-{re.sub(r"[^A-Za-z0-9]+", "", sheet_name)[:12]}-R{index + 1}',
        'courseName': name, 'credits': clean_text(cell(index, 'credits')),
        'category': determine_category(sheet_name),
        'instructors': _split_people(cell(index, 'primary'), cell(index, 'additional')),
        'rawSlot': clean_text(cell(index, 'slot')), 'remarks': [], 'availability': '',
        'sourceRows': block['source'],
        'schedule': {'assignments': [], 'custom': []},
        'issues': [issue(
            'missing_code', BLOCKING,
            f'Row {index + 1} of "{sheet_name}" has a slot or room ("{name}") but no course code. '
            'Give it a code, or remove it if it belongs to another course.')],
        '_entries': [],
    }


def _course_from_block(block, sheet_name, program, branch, slot_definitions):
    cell = block['cell']
    first = block['rows'][0]
    course = {
        'program': program, 'branch': branch,
        'courseCode': block['code'],
        'courseName': clean_text(cell(first, 'name')),
        'credits': clean_text(cell(first, 'credits')),
        'category': determine_category(sheet_name),
        'instructors': _split_people(*[cell(i, f) for i in block['rows'] for f in ('primary', 'additional')]),
        'rawSlot': '',
        'remarks': [],
        'availability': clean_text(cell(first, 'availability')),
        'sourceRows': block['source'],
        'schedule': {'assignments': [], 'custom': []},
        'issues': [],
        '_entries': [],
    }

    previous_slot = ''
    for index in block['rows']:
        slot_text = cell(index, 'slot')
        room_text = cell(index, 'room')
        remark = clean_text(cell(index, 'remarks'))
        if remark and remark not in ('-',) and remark not in course['remarks']:
            course['remarks'].append(remark)
        if not slot_text and not room_text:
            continue
        slot_text = slot_text or previous_slot
        previous_slot = slot_text
        course['_entries'].append({'row': index + 1, 'slot': slot_text, 'room': room_text})

    _build_schedule(course, slot_definitions)
    return course


def _build_schedule(course, slot_definitions):
    """Turns the block's (slot cell, room cell) rows into slot assignments."""
    groups, order = {}, []
    for entry in course['_entries']:
        key = clean_text(entry['slot']).lower()
        if key not in groups:
            groups[key] = {'slot': entry['slot'], 'rooms': []}
            order.append(key)
        if entry['room'] or not groups[key]['rooms']:
            groups[key]['rooms'].append(parse_room_cell(entry['room']))

    assignments, issues, raw_slots = [], [], []
    for key in order:
        group = groups[key]
        parsed = parse_slot_cell(group['slot'], slot_definitions)
        if parsed['text']:
            raw_slots.append(parsed['text'])
        issues.extend(parsed['issues'])
        if parsed['examSlot']:
            issues.append(issue('exam_slot', INFO, f'Exam slot: {parsed["examSlot"]}.', slot=parsed['examSlot']))
        if not parsed['assignments']:
            continue

        rooms = [r for r in group['rooms'] if r['room'] or r['batches']] or [{'room': '', 'batches': None}]
        if any(r['batches'] for r in rooms):
            # A batch rotation: each room row is its own session of the slot.
            for room in rooms:
                for base in parsed['assignments']:
                    assignments.append({**base, 'room': room['room'], 'batches': room['batches']})
            continue

        distinct = []
        for room in rooms:
            if room['room'] and room['room'] not in distinct:
                distinct.append(room['room'])

        if len(distinct) > 1:
            issues.append(issue(
                'parallel_rooms', REVIEW,
                f'{" + ".join(a["slot"] for a in parsed["assignments"])} is listed with {len(distinct)} rooms '
                f'({"; ".join(distinct)}) and no batches. Shown as one class; set who goes where if it matters.'))
            for base in parsed['assignments']:
                assignments.append({**base, 'room': ' | '.join(distinct)})
            continue

        room = distinct[0] if distinct else ''
        parts = split_top_level(room, '+') if room else []
        if len(parsed['assignments']) > 1 and len(parts) == len(parsed['assignments']):
            issues.append(issue(
                'rooms_by_position', REVIEW,
                'Rooms were matched to slots in the order written: '
                + ', '.join(f'{a["slot"]} in {p}' for a, p in zip(parsed['assignments'], parts)) + '.'))
            for base, part in zip(parsed['assignments'], parts):
                assignments.append({**base, 'room': part})
        else:
            for base in parsed['assignments']:
                assignments.append({**base, 'room': room})

    if len(order) > 1 and not any(a.get('batches') for a in assignments):
        issues.append(issue(
            'multi_row_slots', REVIEW,
            f'Listed on {len(order)} rows with different slots ({"; ".join(raw_slots)}). '
            'All of them were combined into one schedule; remove any that are alternatives.'))

    # Two rows can name the same session ("B (Tue) + PA3" and "D (Thu) + PA3"
    # share PA3); it is one class, not two.
    unique, seen = [], set()
    for assignment in assignments:
        signature = (assignment['slot'], tuple(assignment.get('days') or ()), assignment.get('room', ''),
                     assignment.get('batches') or '', assignment.get('startTime'), assignment.get('endTime'))
        if signature not in seen:
            seen.add(signature)
            unique.append(assignment)
    assignments = unique

    course['schedule']['assignments'].extend(assignments)
    course['issues'].extend(issues)
    course['rawSlot'] = ' ; '.join(raw_slots)


def _merge_duplicate(existing, other):
    """The same code on another sheet of the same workbook (e.g. a semester list)."""
    existing['sourceRows'].extend(other['sourceRows'])
    for remark in other['remarks']:
        if remark not in existing['remarks']:
            existing['remarks'].append(remark)
    for person in other['instructors']:
        if person not in existing['instructors']:
            existing['instructors'].append(person)

    if other['courseName'] and existing['courseName'] and \
            clean_text(other['courseName']).lower() != clean_text(existing['courseName']).lower():
        existing['issues'].append(issue(
            'conflicting_info', REVIEW,
            f'Named "{existing["courseName"]}" on one sheet and "{other["courseName"]}" on another.'))
    for field in ('courseName', 'credits', 'availability'):
        existing[field] = existing[field] or other[field]

    if not other['schedule']['assignments']:
        existing['issues'].extend(i for i in other['issues'] if i['severity'] != INFO)
        return

    def signature(course):
        return sorted((a['slot'], tuple(a.get('days') or ()), a.get('room', ''), a.get('batches') or '')
                      for a in course['schedule']['assignments'])

    if not existing['schedule']['assignments']:
        existing['schedule'] = other['schedule']
        existing['rawSlot'] = other['rawSlot']
        existing['issues'].extend(other['issues'])
    elif signature(existing) != signature(other):
        known = {(a['slot'], tuple(a.get('days') or ()), a.get('batches') or '')
                 for a in existing['schedule']['assignments']}
        for assignment in other['schedule']['assignments']:
            if (assignment['slot'], tuple(assignment.get('days') or ()), assignment.get('batches') or '') not in known:
                existing['schedule']['assignments'].append(assignment)
        existing['issues'].extend(other['issues'])
        existing['issues'].append(issue(
            'multi_row_slots', REVIEW,
            f'Listed on several sheets with different slots ({existing["rawSlot"]} / {other["rawSlot"]}). '
            'Both were combined; remove whichever does not apply.'))
        existing['rawSlot'] = ' ; '.join(s for s in (existing['rawSlot'], other['rawSlot']) if s)


def _finish(course):
    """Checks that need the whole course: rooms, remarks, and a tidy issue list."""
    course.pop('_entries', None)
    assignments = course['schedule']['assignments']

    if assignments and any(not a.get('room') for a in assignments):
        course['issues'].append(issue('missing_room', REVIEW, 'No room is given for at least one class.'))
    for room in sorted({a['room'] for a in assignments if a.get('room') and unusual_room(a['room'])}):
        course['issues'].append(issue('unusual_room', REVIEW, f'Check the venue "{room}".', room=room))
    if any(a.get('batches') for a in assignments):
        course['issues'].append(issue(
            'batch_sessions', INFO,
            'Has separate sessions for different batches: '
            + ', '.join(sorted({a['batches'] for a in assignments if a.get('batches')}, key=_batch_sort)) + '.'))

    for remark in course['remarks']:
        # "Exam slot: D" is about the exam, not about when the course meets.
        if _SCHEDULING_WORDS.search(_EXAM_REMARK_RE.sub(' ', remark)):
            course['issues'].append(issue(
                'remark', REVIEW, f'Remark may affect the schedule: "{remark[:300]}"', text=remark))

    if not course['courseName']:
        course['issues'].append(issue('missing_name', BLOCKING, 'The course has no name.'))

    # The same finding can be reached twice (two rows carrying one remark).
    seen, unique = set(), []
    for entry in course['issues']:
        key = (entry['code'], entry['message'])
        if key not in seen:
            seen.add(key)
            unique.append(entry)
    course['issues'] = unique


def _batch_sort(batches):
    match = re.search(r'\d+', batches)
    return int(match.group(0)) if match else 0
