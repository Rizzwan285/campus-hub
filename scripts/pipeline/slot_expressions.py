"""
Turns the institute's free-form "Slot" cells into structured slot assignments.

    I+J(Monday)                  all of I, only Monday's J
    C (Mon) + A (Wed) + B (Fri)  one named day of each
    D [Mon,Wed], E [Fri] + PA5   brackets and parentheses mean the same
    M (1 pm - 1:50 pm)           slot M at a different time
    R5 + Sat morning             R5, plus a remark a person has to read

It never guesses. Anything it cannot read with certainty - an unknown code, a
day the slot does not meet on, "CMNA/CMNB", free text - becomes an issue for the
admin to resolve in the visual editor, and produces no meeting on its own.

`normalize.normalize_slot_expression` is the older parser behind the bundled
JSON and `repair_meetings.py`; it is left as it was, and this module reuses its
bracket-aware splitting.
"""
import re

DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

# Exact spellings only. A prefix match would read "Monster" as Monday, and the
# single letters M, T, W, F are slot codes or ambiguous.
DAY_ALIASES = {
    'mon': 'Monday', 'monday': 'Monday',
    'tue': 'Tuesday', 'tues': 'Tuesday', 'tuesday': 'Tuesday',
    'wed': 'Wednesday', 'weds': 'Wednesday', 'wednesday': 'Wednesday',
    'th': 'Thursday', 'thu': 'Thursday', 'thur': 'Thursday', 'thurs': 'Thursday', 'thursday': 'Thursday',
    'fri': 'Friday', 'friday': 'Friday',
    'sat': 'Saturday', 'saturday': 'Saturday',
    'sun': 'Sunday', 'sunday': 'Sunday',
}

BLOCKING, REVIEW, INFO = 'blocking', 'review', 'info'

_EXAM_SLOT_RE = re.compile(r'[\(\[]?\s*exam\s*slot\s*:?\s*([A-Za-z][A-Za-z0-9\-]*)\s*[\)\]]?', re.IGNORECASE)
_NO_SLOT_RE = re.compile(
    r'^(?:-+|n\.?\s*a\.?|nil|none|not\s+required|not\s+applicable|tbd|tba|to\s+be\s+(?:decided|announced))$',
    re.IGNORECASE,
)
_CODE_SHAPE_RE = re.compile(r'^(?:[A-Z]{1,2}\d{0,2}|CMN-?[A-Z]|P[AM]\d)$')
_TOKEN_RE = re.compile(
    r'^(?P<code>[A-Za-z][A-Za-z0-9\-]*)\s*'
    # The closing bracket is optional: "PA1 (alt weeks half batch" is real.
    r'(?:[\(\[](?P<mods>[^\)\]]*)[\)\]]?)?\s*'
    r'(?P<trail>.*)$',
    re.DOTALL,
)
_TYPE_WORDS = {
    'tutorial': 'tutorial', 'tut': 'tutorial',
    'lab': 'lab', 'practical': 'lab', 'laboratory': 'lab',
    'lecture': 'lecture', 'theory': 'lecture',
}
_TIME_RE = re.compile(
    r'^\s*(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*'
    r'(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\s*(am|pm)?\s*(?:hrs?)?\s*$',
    re.IGNORECASE,
)


def issue(code, severity, message, **detail):
    entry = {'code': code, 'severity': severity, 'message': message}
    if detail:
        entry['detail'] = detail
    return entry


def clean_text(value):
    """Collapses every run of whitespace (including line breaks) to one space."""
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def split_top_level(text, separators='+,&'):
    """Splits on separators that sit outside brackets, so "[Mon,Wed]" survives."""
    parts, buf, depth = [], '', 0
    for ch in text:
        if ch in '([':
            depth += 1
        elif ch in ')]':
            depth = max(0, depth - 1)
        if ch in separators and depth == 0:
            parts.append(buf)
            buf = ''
        else:
            buf += ch
    parts.append(buf)
    return [p.strip() for p in parts if p.strip()]


def parse_days(text):
    """The weekdays a bracket names, or None if it is anything but a day list."""
    if not text or not text.strip():
        return None
    entries = [e for e in re.split(r'[+,&/]|\band\b|\s+', text.strip().lower()) if e]
    days = []
    for entry in entries:
        day = DAY_ALIASES.get(entry.rstrip('.'))
        if day is None:
            return None
        if day not in days:
            days.append(day)
    return days or None


def parse_time_range(text):
    """
    "1 pm - 1:50 pm", "8-8:50 am", "14-14:50", "08:00 - 08.50" -> ('13:00', '13:50').

    Returns None for anything else, including a 12-hour time with no am/pm
    whose half of the day would have to be guessed ("1 - 1:50").
    """
    match = _TIME_RE.match(text or '')
    if not match:
        return None
    h1, m1, mer1, h2, m2, mer2 = match.groups()
    h1, h2 = int(h1), int(h2)
    m1, m2 = int(m1 or 0), int(m2 or 0)
    mer1 = (mer1 or mer2 or '').lower()
    mer2 = (mer2 or '').lower()

    def to_24(hour, meridiem):
        if meridiem == 'pm' and hour < 12:
            return hour + 12
        if meridiem == 'am' and hour == 12:
            return 0
        return hour

    if mer1 or mer2:
        if h1 > 12 or h2 > 12:
            return None
        h1, h2 = to_24(h1, mer1), to_24(h2, mer2 or mer1)
    elif h1 < 8 or h2 < 8:
        return None
    if not (0 <= h1 < 24 and 0 <= h2 < 24 and m1 < 60 and m2 < 60):
        return None
    start, end = f'{h1:02d}:{m1:02d}', f'{h2:02d}:{m2:02d}'
    return (start, end) if end > start else None


def canonical_slot(code, slot_definitions):
    """The slot's code as the slot system spells it, or None if it is not one."""
    upper = code.upper()
    by_upper = {name.upper(): name for name in slot_definitions}
    if upper in by_upper:
        return by_upper[upper], False
    # "CMNA" for "CMN-A": the same letters with the hyphen dropped.
    squashed = {name.upper().replace('-', ''): name for name in slot_definitions}
    if upper.replace('-', '') in squashed:
        return squashed[upper.replace('-', '')], True
    return None, False


def parse_slot_cell(raw, slot_definitions):
    """
    Returns {'assignments', 'issues', 'examSlot', 'text'}.

    Each assignment is {'slot', 'days'} with optional 'startTime'/'endTime',
    'type' and 'note'. `days` is None for every meeting of the slot.
    """
    text = clean_text(raw)
    result = {'assignments': [], 'issues': [], 'examSlot': None, 'text': text}
    if not text or _NO_SLOT_RE.match(text):
        return result

    exam = _EXAM_SLOT_RE.search(text)
    if exam:
        result['examSlot'] = exam.group(1).upper()
        text = clean_text(_EXAM_SLOT_RE.sub(' ', text))
        if not text:
            return result

    recognised = False
    for part in split_top_level(text):
        outcome = _parse_part(part, slot_definitions)
        if outcome is None:
            # Several complete codes on separate lines, with the "+" left out.
            pieces = part.split()
            if len(pieces) > 1 and all(canonical_slot(p, slot_definitions)[0] for p in pieces):
                result['issues'].append(issue(
                    'linebreak_as_plus', REVIEW,
                    f'"{part}" has no "+" between the slots; read as all of them.', text=part))
                for piece in pieces:
                    _add(result, {'slot': canonical_slot(piece, slot_definitions)[0], 'days': None})
                recognised = True
                continue
            result['issues'].append(issue(
                'free_text', REVIEW,
                f'"{part}" is not a slot. Add the meeting by hand if it describes one.', text=part))
            continue

        recognised = recognised or outcome.get('recognised', False)
        result['issues'].extend(outcome['issues'])
        if outcome.get('assignment'):
            _add(result, outcome['assignment'])

    if not recognised:
        # Nothing in the cell names a slot ("I don't require slots"): it is a
        # remark, not a schedule the parser failed to read.
        result['issues'] = [issue('no_slot_text', INFO, f'No slot given: "{text}".', text=text)]
    return result


def _add(result, assignment):
    for existing in result['assignments']:
        if existing['slot'] == assignment['slot'] and existing.get('days') == assignment.get('days'):
            return
    result['assignments'].append(assignment)


def _parse_part(part, slot_definitions):
    if '/' in re.sub(r'[\(\[][^\)\]]*[\)\]]?', '', part):
        return {
            'recognised': True,
            'issues': [issue(
                'ambiguous', BLOCKING,
                f'"{part}" uses "/", which could mean either slot or both. Choose the slots by hand.',
                text=part)],
        }

    match = _TOKEN_RE.match(part)
    if not match:
        return None
    code, mods, trail = match.group('code'), match.group('mods'), clean_text(match.group('trail'))

    slot, aliased = canonical_slot(code, slot_definitions)
    if slot is None:
        if _CODE_SHAPE_RE.match(code.upper()) and not trail:
            return {
                'recognised': True,
                'issues': [issue(
                    'unknown_slot', BLOCKING,
                    f'"{code}" is not in this semester\'s slot system.', slot=code.upper(), text=part)],
            }
        return None

    # "I don't require slots" starts with a real slot code. A code followed by
    # prose rather than a bracket or a time is a sentence, not a slot.
    if trail and mods is None and parse_time_range(trail) is None:
        return None

    issues = []
    if aliased:
        issues.append(issue('slot_alias', INFO, f'Read "{code}" as slot {slot}.', slot=slot))

    definition = slot_definitions[slot]
    slot_days = [timing['day'] for timing in definition['timings']]
    assignment = {'slot': slot, 'days': None}

    def apply_modifier(text_value):
        value = clean_text(text_value)
        if not value:
            return
        days = parse_days(value)
        if days:
            missing = [day for day in days if day not in slot_days]
            kept = [day for day in days if day in slot_days]
            if missing:
                issues.append(issue(
                    'day_not_in_slot', BLOCKING,
                    f'Slot {slot} does not meet on {", ".join(missing)} '
                    f'(it meets on {", ".join(slot_days)}).',
                    slot=slot, days=missing, text=part))
            assignment['days'] = kept
            return

        times = parse_time_range(value)
        if times:
            _apply_time(assignment, definition, times, issues, slot, part)
            return

        kind = _TYPE_WORDS.get(value.lower())
        if kind:
            if kind != definition['type']:
                assignment['type'] = kind
            return

        lowered = value.lower()
        if 'alt' in lowered and 'week' in lowered:
            assignment['note'] = value
            issues.append(issue(
                'alternating_weeks', REVIEW,
                f'Slot {slot} is marked "{value}". Set which weeks and which batches meet.',
                slot=slot, text=value))
            return

        assignment['note'] = value
        issues.append(issue(
            'free_text', REVIEW,
            f'Slot {slot} carries the remark "{value}", which was not interpreted.',
            slot=slot, text=value))

    apply_modifier(mods)
    apply_modifier(trail)

    if assignment['days'] is not None and not assignment['days']:
        # Every named day was wrong; the blocking issue above already says so.
        return {'recognised': True, 'issues': issues}
    return {'recognised': True, 'issues': issues, 'assignment': assignment}


def _apply_time(assignment, definition, times, issues, slot, part):
    days = assignment['days']
    timings = [t for t in definition['timings'] if days is None or t['day'] in days]
    if timings and all((t['startTime'], t['endTime']) == times for t in timings):
        return  # The cell only restates the slot's own time.
    assignment['startTime'], assignment['endTime'] = times
    usual = ', '.join(sorted({f"{t['startTime']}-{t['endTime']}" for t in timings})) or 'unknown'
    issues.append(issue(
        'time_override', REVIEW,
        f'Slot {slot} is given as {times[0]}-{times[1]} instead of its usual {usual}.',
        slot=slot, startTime=times[0], endTime=times[1], text=part))


# ------------------------------------------------------------------ rooms

_BATCH_RE = re.compile(r'\(?\s*\bB(\d{1,2})\s*-\s*B(\d{1,2})\b\s*\)?', re.IGNORECASE)
_HEADCOUNT_RE = re.compile(r'\(\s*~?\s*\d+\s*students?\s*\)', re.IGNORECASE)
_DAY_HINT_RE = re.compile(r'\(\s*(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\s*\)\s*$', re.IGNORECASE)


def parse_room_cell(raw):
    """
    Splits "A01-112(Drawing Hall)\\n(B1-B5)" into the venue and the batches it
    is for. Returns {'room', 'batches', 'text'}; batches is "B1-B5" or None.
    """
    text = clean_text(raw)
    ranges = [(int(a), int(b)) for a, b in _BATCH_RE.findall(text)]
    ranges = [(a, b) for a, b in ranges if 1 <= a <= b <= 99]
    room = text
    if ranges:
        room = _BATCH_RE.sub(' ', room)
        # "B19-B24 (mon)": the day only repeats what the slot already says.
        room = _DAY_HINT_RE.sub('', room.strip())
    room = _HEADCOUNT_RE.sub(' ', room)
    room = re.sub(r'\s*\+\s*', ' + ', room)
    room = re.sub(r'\(\s+', '(', re.sub(r'\s+\)', ')', room))
    room = re.sub(r'(?<=\w)\(', ' (', clean_text(room))
    batches = ', '.join(f'B{a}-B{b}' for a, b in ranges) or None
    return {'room': room, 'batches': batches, 'text': text}


def unusual_room(room):
    lowered = room.lower()
    return bool(re.search(r'\?|\btbd\b|\btba\b|to be (?:decided|announced)|not (?:yet )?allotted', lowered)) \
        or len(room) > 70
