"""
Reads the institute's slot-system document (a .docx timetable grid) into slot
definitions: {"A": {"type": "lecture", "timings": [{day, startTime, endTime}]}}.

The grid is a Word table: a header row of time ranges, then one or two rows per
day whose cells name the slot occupying those columns. Lab slots span several
columns, some cells carry their own time ("Q 14-14:50"), and the notes under
the grid correct the lab timings ("PM1 - PM5 ... (9:00 hrs to 11:45 hrs)").

Word tables with merged cells are easy to misread, so every slot whose time
had to be inferred from a partial column span is reported as uncertain, and the
caller is expected to show the result next to the previous semester's slots
for confirmation rather than trust it blindly.
"""
import re

from slot_expressions import DAY_ALIASES, DAYS, clean_text, parse_time_range
from xlsx_reader import read_docx_tables

_SLOT_CODE_RE = re.compile(r'^(CMN-?[A-Z]|[A-Z]{1,3}\d?)$')
_CELL_TIME_RE = re.compile(r'\(?\s*(\d{1,2}(?:[:.]\d{2})?\s*-\s*\d{1,2}(?:[:.]\d{2})?)\s*\)?')
_NOTE_TIME_RE = re.compile(
    r'(?P<slots>(?:[A-Z]{1,3}\d?(?:\s*-\s*[A-Z]{1,3}\d?)?\s*(?:,|and)?\s*)+?)\s*'
    r'(?:is|are)\b[^()\n]*\(\s*(?P<start>\d{1,2}[:.]\d{2})\s*(?:hrs?)?\s*to\s*(?P<end>\d{1,2}[:.]\d{2})\s*(?:hrs?)?\s*\)',
)


def _expand_grid(row):
    """One entry per grid column, each pointing at the cell that covers it."""
    columns = []
    for cell in row:
        columns.extend([cell] * cell['span'])
    return columns


_HEADER_TIME_RE = re.compile(r'\d{1,2}[:.]\d{2}\s*-\s*\d{1,2}[:.]\d{2}')


def _header_time(text):
    """The time range a header cell opens with; the lunch column spells LUNCH after it."""
    match = _HEADER_TIME_RE.search(clean_text(text))
    return parse_time_range(match.group(0)) if match else None


def _slot_type(code):
    return 'lab' if re.match(r'^P[AM]\d$', code) else 'lecture'


def _clock(text):
    hours, _, minutes = text.replace('.', ':').partition(':')
    return f'{int(hours):02d}:{int(minutes or 0):02d}'


def _note_slots(text):
    """'PM1 - PM5' -> PM1..PM5; 'PA1, PA2, PA4, PA5' -> those four."""
    codes = []
    for piece in re.split(r',|\band\b', text):
        piece = piece.strip()
        span = re.match(r'^([A-Z]{1,3})(\d)\s*-\s*([A-Z]{1,3})(\d)$', piece)
        if span and span.group(1) == span.group(3):
            codes.extend(f'{span.group(1)}{n}' for n in range(int(span.group(2)), int(span.group(4)) + 1))
        elif _SLOT_CODE_RE.match(piece):
            codes.append(piece)
    return codes


def parse_slot_document(source):
    """
    Returns {'status', 'definitions', 'issues'}; status is 'parsed' or 'failed'.
    Issues are {'slot', 'message'} entries for the admin to check.
    """
    try:
        paragraphs, tables = read_docx_tables(source)
    except Exception as error:  # noqa: BLE001 - reported to the admin, not raised
        return {'status': 'failed', 'definitions': {}, 'issues': [{'slot': None, 'message': str(error)}]}

    found = {}       # code -> {day -> (start, end, uncertain)}
    issues = []
    note_text = '\n'.join(paragraphs)

    for table in tables:
        if not table:
            continue
        header = _expand_grid(table[0])
        header_times = [_header_time(cell['text']) for cell in header]
        if sum(1 for t in header_times if t) < 3:
            # Not a grid; the notes tables are read for lab-time corrections.
            note_text += '\n' + '\n'.join(cell['text'] for row in table for cell in row[:1])
            continue

        day = None
        for row in table[1:]:
            columns = _expand_grid(row)
            if not columns:
                continue
            label = DAY_ALIASES.get(clean_text(columns[0]['text']).lower())
            day = label or day
            if day is None:
                continue

            index = 1
            while index < len(columns):
                cell = columns[index]
                end = index
                while end + 1 < len(columns) and columns[end + 1] is cell:
                    end += 1
                text = clean_text(cell['text'])
                code = text.split(' ')[0].upper() if text else ''
                if _SLOT_CODE_RE.match(code) and index < len(header) and end < len(header):
                    own = _CELL_TIME_RE.search(text[len(code):])
                    own_time = parse_time_range(own.group(1)) if own else None
                    first, last = header_times[index], header_times[end]
                    if own_time:
                        start, finish, uncertain = own_time[0], own_time[1], False
                    elif first and last:
                        start, finish = first[0], last[1]
                        # Aligned when the cell starts and ends on header-cell edges.
                        starts_clean = index == 0 or header[index - 1] is not header[index]
                        ends_clean = end + 1 >= len(header) or header[end + 1] is not header[end]
                        uncertain = not (starts_clean and ends_clean)
                    else:
                        index = end + 1
                        continue
                    found.setdefault(code, {})[day] = (start, finish, uncertain)
                index = end + 1

    # The notes state the lab timings exactly; the grid only approximates them.
    for match in _NOTE_TIME_RE.finditer(note_text):
        start, finish = _clock(match.group('start')), _clock(match.group('end'))
        for code in _note_slots(match.group('slots')):
            if code in found and _slot_type(code) == 'lab':
                found[code] = {d: (start, finish, False) for d in found[code]}

    definitions = {}
    for code in sorted(found):
        timings = []
        for day in DAYS:
            if day not in found[code]:
                continue
            start, finish, uncertain = found[code][day]
            if finish <= start:
                issues.append({'slot': code, 'message': f'{code} on {day} has an unreadable time.'})
                continue
            if uncertain:
                issues.append({
                    'slot': code,
                    'message': f'{code} on {day} spans part of a time column; read as {start}-{finish}. Check it.',
                })
            timings.append({'day': day, 'startTime': start, 'endTime': finish})
        if timings:
            definitions[code] = {'type': _slot_type(code), 'timings': timings}

    if len(definitions) < 5:
        return {
            'status': 'failed',
            'definitions': {},
            'issues': [{'slot': None, 'message': 'No slot grid could be read from this document.'}],
        }
    return {'status': 'parsed', 'definitions': definitions, 'issues': issues}
