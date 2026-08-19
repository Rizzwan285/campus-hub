import re

def normalize_eligibility(raw_availability):
    """
    Parses strings like "Batch: 1" or "Deg:Prog:Sem:UpperCap" into structured eligibility.
    """
    eligibility = {}
    raw = str(raw_availability).lower()
    
    if 'batch' in raw:
        # e.g., "Batch: 1" or "Batches: 1, 2"
        batches = re.findall(r'\d+', raw)
        if batches:
            eligibility['allowedBatches'] = [int(b) for b in batches]
            
    # Add logic for MTech, BTech, branches etc as needed based on actual strings
    if 'mcam' in raw:
        eligibility['allowedPrograms'] = ['MTech']
        eligibility['allowedBranches'] = ['CaM']
        
    return eligibility

DAY_MAP = {
    'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday', 'thu': 'Thursday',
    'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday',
}

# A whole token: a slot code, optionally followed by a bracketed modifier.
# Both "D [Mon,Wed]" and "H (Fri)" appear in the source workbooks.
_TOKEN_RE = re.compile(r'^([A-Za-z0-9\-]+)\s*(?:[\(\[]([^\)\]]*)[\)\]])?$')


def _split_top_level(text):
    """
    Splits on '+' and ',' that sit outside brackets, so a day list like
    "[Mon,Wed]" survives as one token instead of being torn in half.
    """
    parts, buf, depth = [], '', 0
    for ch in text:
        if ch in '([':
            depth += 1
        elif ch in ')]':
            depth = max(0, depth - 1)

        if ch in '+,' and depth == 0:
            parts.append(buf)
            buf = ''
        else:
            buf += ch
    parts.append(buf)
    return [p.strip() for p in parts if p.strip()]


def _parse_day_modifiers(mods):
    """
    Returns the list of days if every entry names a weekday, otherwise None —
    which marks the bracket as free-text (e.g. "Tue swapped to Thu 12:00")
    rather than a day restriction.
    """
    if not mods or not mods.strip():
        return None

    days = []
    for entry in re.split(r'[+,]', mods):
        entry = entry.strip().lower()
        if not entry:
            continue
        day = DAY_MAP.get(entry[:3])
        # Reject "Tuesday extra" style entries: the token must be only the day.
        if day is None or not re.fullmatch(r'[a-z]+', entry):
            return None
        days.append(day)

    return days or None


def normalize_slot_expression(raw_slot):
    """
    Parses complex slot expressions into base slots and day modifiers.
    Handles line breaks, exam slot annotations, and extra whitespace.

    Day restrictions may be written with either brackets or parentheses:
    "D [Mon,Wed]" and "H (Fri)" both mean "only those days of that slot".
    A bracket whose contents are not purely weekday names is kept as a note and
    the slot is used unrestricted, since the remark needs a human to interpret.
    """
    expressions = []
    if not raw_slot or str(raw_slot).strip() in ('-', ''):
        return expressions

    # 1. Normalize linebreaks to +
    clean_slot = str(raw_slot).replace('\n', '+')

    # 2. Strip Exam Slot annotations like "(Exam Slot: B)" or "(Exam: B)"
    clean_slot = re.sub(r'\(Exam\s*(?:Slot)?\s*:[^\)]+\)', '', clean_slot, flags=re.IGNORECASE)

    # 3. Collapse whitespace but keep single spaces, so tokens stay separable.
    clean_slot = re.sub(r'\s+', ' ', clean_slot).strip()

    if not clean_slot:
        return expressions

    for token in _split_top_level(clean_slot):
        match = _TOKEN_RE.match(token)
        if not match:
            # Free text such as "Sat morning" — record it, create no meetings.
            expressions.append({
                'rawExpression': token,
                'baseSlot': None,
                'dayModifiers': [],
                'note': token,
            })
            continue

        base_slot, mods = match.group(1), match.group(2)
        day_modifiers = _parse_day_modifiers(mods)

        expressions.append({
            'rawExpression': token,
            'baseSlot': base_slot,
            'dayModifiers': day_modifiers or [],
            # Non-day bracket contents are preserved for a human to action.
            'note': mods if (mods and day_modifiers is None) else None,
        })

    return expressions

def generate_meetings(normalized_slots, slot_definitions):
    """
    Cross references normalized slots with actual slot definitions to create TimetableMeetings.
    """
    meetings = []
    seen = set()

    for expr in normalized_slots:
        base_code = expr['baseSlot']
        if base_code in slot_definitions:
            slot_def = slot_definitions[base_code]

            for timing in slot_def['timings']:
                # If expression has day modifiers, only include those days
                if expr['dayModifiers'] and timing['day'] not in expr['dayModifiers']:
                    continue

                # The same slot can be named twice in one expression; emit once.
                key = (slot_def['type'], timing['day'], timing['startTime'])
                if key in seen:
                    continue
                seen.add(key)

                meetings.append({
                    'type': slot_def['type'],
                    'day': timing['day'],
                    'startTime': timing['startTime'],
                    'endTime': timing['endTime'],
                    'room': '', # To be filled from course
                    'instructors': [], # To be filled from course
                    'recurrence': {'type': 'weekly'} # To be enhanced based on remarks
                })

    return meetings
