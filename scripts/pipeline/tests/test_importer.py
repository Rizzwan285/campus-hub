"""
Tests for the semester importer.

    python3 -m unittest discover -s scripts/pipeline/tests -v

Standard library only, like the importer. Workbooks are built in memory, so
nothing here needs the institute's files; one extra test compares the reader
against openpyxl on the real workbooks when both happen to be available.
"""
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from course_rows import determine_program_branch, parse_workbook  # noqa: E402
from docx_slots import parse_slot_document  # noqa: E402
from normalize import generate_meetings, normalize_slot_expression  # noqa: E402
from slot_expressions import (  # noqa: E402
    parse_days, parse_room_cell, parse_slot_cell, parse_time_range,
)
from xlsx_reader import UnsafeFileError, read_workbook, semester_in_filename  # noqa: E402


def slot(kind, *timings):
    return {'type': kind, 'timings': [{'day': d, 'startTime': s, 'endTime': e} for d, s, e in timings]}


SLOTS = {
    'A': slot('lecture', ('Monday', '08:00', '08:50'), ('Wednesday', '11:00', '11:50'), ('Friday', '09:00', '09:50')),
    'B': slot('lecture', ('Monday', '09:00', '09:50'), ('Tuesday', '08:00', '08:50'), ('Friday', '10:00', '10:50')),
    'C': slot('lecture', ('Monday', '10:00', '10:50'), ('Wednesday', '08:00', '08:50'), ('Friday', '11:00', '11:50')),
    'D': slot('lecture', ('Monday', '11:00', '11:50'), ('Wednesday', '09:00', '09:50'), ('Thursday', '08:00', '08:50')),
    'E': slot('lecture', ('Wednesday', '10:00', '10:50'), ('Friday', '08:00', '08:50')),
    'H': slot('lecture', ('Monday', '12:05', '12:55'), ('Wednesday', '12:05', '12:55'), ('Friday', '12:05', '12:55')),
    'I': slot('lecture', ('Monday', '14:00', '15:15'), ('Friday', '15:30', '16:45')),
    'J': slot('lecture', ('Monday', '15:30', '16:45'), ('Friday', '14:00', '15:15')),
    'M': slot('lecture', ('Tuesday', '12:00', '12:50'), ('Thursday', '12:00', '12:50')),
    'R1': slot('lecture', ('Monday', '17:10', '18:00')),
    'R5': slot('lecture', ('Friday', '17:10', '18:00')),
    'CMN-A': slot('lecture', ('Wednesday', '16:00', '16:50')),
    'CMN-B': slot('lecture', ('Wednesday', '17:00', '17:50')),
    'PA1': slot('lab', ('Monday', '14:00', '16:45')),
    'PA5': slot('lab', ('Friday', '14:00', '16:45')),
    'PM1': slot('lab', ('Monday', '09:00', '11:45')),
}


def assignments(raw):
    """[(slot, days)] for a slot cell."""
    return [(a['slot'], a['days']) for a in parse_slot_cell(raw, SLOTS)['assignments']]


def issue_codes(raw):
    return [i['code'] for i in parse_slot_cell(raw, SLOTS)['issues']]


def meetings_of(raw):
    """(slot, day) pairs the cell expands to, the way the API expands it."""
    pairs = []
    for a in parse_slot_cell(raw, SLOTS)['assignments']:
        for timing in SLOTS[a['slot']]['timings']:
            if a['days'] is None or timing['day'] in a['days']:
                pairs.append((a['slot'], timing['day'][:3]))
    return pairs


class SlotExpressions(unittest.TestCase):
    """Every row of the brief's table, then the shapes found in real workbooks."""

    def test_plus_means_all_of_both(self):
        self.assertEqual(assignments('I+J'), [('I', None), ('J', None)])
        self.assertEqual(meetings_of('I+J'), [('I', 'Mon'), ('I', 'Fri'), ('J', 'Mon'), ('J', 'Fri')])

    def test_spaces_around_plus_change_nothing(self):
        self.assertEqual(assignments('I + J'), assignments('I+J'))
        self.assertEqual(assignments('  I   +\nJ '), assignments('I+J'))

    def test_day_in_parentheses_restricts_only_its_own_slot(self):
        self.assertEqual(assignments('I+J(Monday)'), [('I', None), ('J', ['Monday'])])
        self.assertEqual(meetings_of('I+J(Monday)'), [('I', 'Mon'), ('I', 'Fri'), ('J', 'Mon')])

    def test_one_day_of_each_of_three_slots(self):
        self.assertEqual(
            assignments('C (Mon) + A (Wed) + B (Fri)'),
            [('C', ['Monday']), ('A', ['Wednesday']), ('B', ['Friday'])])
        self.assertEqual(meetings_of('C (Mon) + A (Wed) + B (Fri)'), [('C', 'Mon'), ('A', 'Wed'), ('B', 'Fri')])

    def test_comma_separates_complete_slots(self):
        self.assertEqual(assignments('H, I'), [('H', None), ('I', None)])

    def test_brackets_with_day_lists(self):
        self.assertEqual(assignments('D [Mon,Wed], E [Fri]'), [('D', ['Monday', 'Wednesday']), ('E', ['Friday'])])
        self.assertEqual(meetings_of('D [Mon,Wed], E [Fri]'), [('D', 'Mon'), ('D', 'Wed'), ('E', 'Fri')])

    def test_lecture_plus_lab_slot(self):
        self.assertEqual(assignments('B+PA1'), [('B', None), ('PA1', None)])
        self.assertEqual(issue_codes('B+PA1'), [])

    def test_regression_cases_from_the_bundled_timetable(self):
        self.assertEqual(len(meetings_of('D [Mon,Wed], E [Fri] + PA5')), 4)          # DS3010
        self.assertEqual(assignments('C (Mon+Fri)\n+\nA (Wed)'), [('C', ['Monday', 'Friday']), ('A', ['Wednesday'])])
        self.assertEqual(assignments('A + H (Fri)'), [('A', None), ('H', ['Friday'])])
        # Day names never leak out of a bracket to be read as slots M, W, F.
        self.assertNotIn('M', [a for a, _ in assignments('D [Mon,Wed]')])

    def test_day_spellings(self):
        self.assertEqual(parse_days('Mon, Wed'), ['Monday', 'Wednesday'])
        self.assertEqual(parse_days('Thursday'), ['Thursday'])
        self.assertEqual(parse_days('Th'), ['Thursday'])
        self.assertEqual(parse_days('mon+fri'), ['Monday', 'Friday'])
        self.assertEqual(parse_days('Mon & Wed'), ['Monday', 'Wednesday'])
        self.assertIsNone(parse_days('Tue swapped to Thu'))
        self.assertIsNone(parse_days('M'))          # a slot code, not a day
        self.assertIsNone(parse_days('Monster'))

    def test_the_older_parser_is_untouched(self):
        expressions = normalize_slot_expression('D [Mon,Wed], E [Fri] + PA5')
        self.assertEqual([e['baseSlot'] for e in expressions], ['D', 'E', 'PA5'])
        self.assertEqual(len(generate_meetings(expressions, SLOTS)), 4)

    # ---- never guessing

    def test_unknown_slot_blocks_and_creates_nothing(self):
        result = parse_slot_cell('B + ZZ', SLOTS)
        self.assertEqual([(a['slot']) for a in result['assignments']], ['B'])
        self.assertEqual([(i['code'], i['severity']) for i in result['issues']], [('unknown_slot', 'blocking')])

    def test_a_day_the_slot_does_not_meet_on_blocks(self):
        result = parse_slot_cell('I (Tuesday)', SLOTS)
        self.assertEqual(result['assignments'], [])
        self.assertEqual(result['issues'][0]['code'], 'day_not_in_slot')
        self.assertEqual(result['issues'][0]['severity'], 'blocking')

    def test_slash_is_ambiguous_and_is_not_resolved(self):
        result = parse_slot_cell('CMNA/CMNB & R1', SLOTS)
        self.assertEqual([a['slot'] for a in result['assignments']], ['R1'])
        self.assertEqual([i['code'] for i in result['issues']], ['ambiguous'])

    def test_free_text_is_kept_as_a_remark_not_a_meeting(self):
        result = parse_slot_cell('R5 + Sat morning', SLOTS)
        self.assertEqual([a['slot'] for a in result['assignments']], ['R5'])
        self.assertEqual([i['code'] for i in result['issues']], ['free_text'])
        self.assertEqual(issue_codes('E + PA5 (F+PA4)'), ['free_text'])

    def test_alternating_weeks_are_flagged_not_assumed(self):
        result = parse_slot_cell('B + \nPA1 (alt weeks half batch', SLOTS)   # the bracket is never closed
        self.assertEqual([a['slot'] for a in result['assignments']], ['B', 'PA1'])
        self.assertEqual([i['code'] for i in result['issues']], ['alternating_weeks'])

    def test_a_sentence_starting_with_a_slot_letter_is_not_a_slot(self):
        for text in ("I don't require slots", 'Faculty from each dept', 'Not required', 'N.A.', '-', ''):
            self.assertEqual(parse_slot_cell(text, SLOTS)['assignments'], [], text)

    def test_time_in_brackets_overrides_and_is_flagged(self):
        result = parse_slot_cell('M \n(1 pm - 1:50 pm)', SLOTS)
        self.assertEqual(result['assignments'][0]['startTime'], '13:00')
        self.assertEqual(result['assignments'][0]['endTime'], '13:50')
        self.assertEqual([i['code'] for i in result['issues']], ['time_override'])
        # Restating the slot's own time is not an override.
        self.assertEqual(issue_codes('B (Tue)\n8-8:50 am\n+\nPA1'), [])

    def test_exam_slot_annotations_are_not_slots(self):
        result = parse_slot_cell('M + CMN-A + CMN-B\n (Exam slot: I)', SLOTS)
        self.assertEqual([a['slot'] for a in result['assignments']], ['M', 'CMN-A', 'CMN-B'])
        self.assertEqual(result['examSlot'], 'I')
        self.assertEqual(assignments('E (exam slot: J)'), [('E', None)])

    def test_tutorial_marker_changes_the_type(self):
        result = parse_slot_cell('D + R1 (Tutorial)', SLOTS)
        self.assertEqual(result['assignments'][1].get('type'), 'tutorial')

    def test_time_ranges(self):
        self.assertEqual(parse_time_range('1 pm - 1:50 pm'), ('13:00', '13:50'))
        self.assertEqual(parse_time_range('8-8:50 am'), ('08:00', '08:50'))
        self.assertEqual(parse_time_range('14-14:50'), ('14:00', '14:50'))
        self.assertEqual(parse_time_range('08:00 - 08.50'), ('08:00', '08:50'))
        self.assertIsNone(parse_time_range('1 - 1:50'))      # morning or afternoon? not guessed
        self.assertIsNone(parse_time_range('10:00 - 09:00'))


class Rooms(unittest.TestCase):
    def test_batches_are_split_from_the_room(self):
        self.assertEqual(parse_room_cell('A01-112(Drawing Hall)\n(B1-B5)'),
                         {'room': 'A01-112 (Drawing Hall)', 'batches': 'B1-B5', 'text': 'A01-112(Drawing Hall) (B1-B5)'})
        self.assertEqual(parse_room_cell('N203 (B1-B11) \n(~132 students)')['room'], 'N203')
        self.assertEqual(parse_room_cell('Nila CS-lab (72)\nB19-B24 (mon)')['batches'], 'B19-B24')

    def test_a_room_number_is_not_a_batch_range(self):
        self.assertIsNone(parse_room_cell('B03-013')['batches'])
        self.assertIsNone(parse_room_cell('B3 (80 seater)')['batches'])


# ------------------------------------------------------------------ workbook fixtures

def _col(index):
    name = ''
    index += 1
    while index:
        index, rem = divmod(index - 1, 26)
        name = chr(65 + rem) + name
    return name


def make_xlsx(sheets):
    """sheets: {name: {'rows': [[cell, ...]], 'merges': ['A2:A4']}} -> bytes of a minimal .xlsx."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        names = list(sheets)
        archive.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        archive.writestr('xl/workbook.xml',
                         '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                         'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
                         + ''.join(f'<sheet name="{escape(n)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, n in enumerate(names))
                         + '</sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels',
                         '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                         + ''.join(f'<Relationship Id="rId{i + 1}" Type="x" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(len(names)))
                         + '</Relationships>')
        for i, name in enumerate(names):
            body = []
            for r, row in enumerate(sheets[name]['rows']):
                cells = ''.join(
                    f'<c r="{_col(c)}{r + 1}" t="inlineStr"><is><t xml:space="preserve">{escape(str(value))}</t></is></c>'
                    for c, value in enumerate(row) if value not in (None, ''))
                body.append(f'<row r="{r + 1}">{cells}</row>')
            merges = sheets[name].get('merges', [])
            merge_xml = ('<mergeCells>' + ''.join(f'<mergeCell ref="{m}"/>' for m in merges) + '</mergeCells>') if merges else ''
            archive.writestr(f'xl/worksheets/sheet{i + 1}.xml',
                             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
                             + ''.join(body) + '</sheetData>' + merge_xml + '</worksheet>')
    return buffer.getvalue()


HEADER = ['Code', 'Course Name', 'Credits', 'Primary instructor email ID', 'Slot', 'Room', 'Remarks']
TITLE = [['Indian Institute of Technology Palakkad'], ['Jan - May 2027'], [], []]


def workbook(rows, merges=None, sheet='Core', header=HEADER):
    return make_xlsx({sheet: {'rows': TITLE + [header] + rows, 'merges': merges or []}})


def parse(rows, merges=None, name='03_UG_CSE_Jan-May-2027.xlsx', **kwargs):
    result = parse_workbook(workbook(rows, merges, **kwargs), name, SLOTS)
    return result, {c['courseCode']: c for c in result['courses']}


def codes(course):
    return [i['code'] for i in course['issues']]


class Workbooks(unittest.TestCase):
    def test_reads_a_plain_course_with_its_source_row(self):
        result, courses = parse([['CS2030', 'Database Systems', '3-0-3-5', 'prof@iitpkd.ac.in', 'B+PA1', 'A01-212+Nila CS Lab', '']])
        self.assertEqual((result['program'], result['branch']), ('UG', 'CSE'))
        course = courses['CS2030']
        self.assertEqual(course['courseName'], 'Database Systems')
        # Each slot gets its own venue, and the guess is flagged for a check.
        self.assertEqual([(a['slot'], a['room']) for a in course['schedule']['assignments']],
                         [('B', 'A01-212'), ('PA1', 'Nila CS Lab')])
        self.assertEqual(codes(course), ['rooms_by_position'])
        self.assertEqual(course['sourceRows'][0]['sheet'], 'Core')
        self.assertEqual(course['sourceRows'][0]['row'], 6)
        self.assertEqual(course['sourceRows'][0]['cells']['Slot'], 'B+PA1')
        self.assertEqual(course['sourceRows'][0]['file'], '03_UG_CSE_Jan-May-2027.xlsx')

    def test_batch_lab_rotation_over_merged_rows(self):
        rows = [
            ['ME1130', 'Engineering Drawing', '1-0-3-3', 'a@x', 'A (Mon)', 'C06-105(B1-B5)', ''],
            ['', '', '', '', 'A (Mon)', 'C06-106(B6-B10)', ''],
            ['', '', '', '', 'PM1', 'A01-112(Drawing Hall)\n(B1-B5)', ''],
            ['', '', '', '', 'PA5', 'A01-112(Drawing Hall)\n(B6-B10)', ''],
        ]
        _, courses = parse(rows, merges=['A6:A9', 'B6:B9'])
        got = [(a['slot'], a.get('days'), a['room'], a.get('batches')) for a in courses['ME1130']['schedule']['assignments']]
        self.assertEqual(got, [
            ('A', ['Monday'], 'C06-105', 'B1-B5'),
            ('A', ['Monday'], 'C06-106', 'B6-B10'),
            ('PM1', None, 'A01-112 (Drawing Hall)', 'B1-B5'),
            ('PA5', None, 'A01-112 (Drawing Hall)', 'B6-B10'),
        ])
        self.assertIn('batch_sessions', codes(courses['ME1130']))
        self.assertEqual(len(courses['ME1130']['sourceRows']), 4)

    def test_one_slot_cell_merged_over_several_batch_rooms(self):
        rows = [
            ['PH1030', 'Physics', '2-1-0-3', 'a@x', 'A+E (Friday)', 'C06-105 (B1-B6)', ''],
            ['', '', '', '', '', 'C06-106 (B7-B12)', ''],
        ]
        _, courses = parse(rows, merges=['A6:A7', 'B6:B7', 'E6:E7'])
        got = [(a['slot'], a.get('days'), a.get('batches')) for a in courses['PH1030']['schedule']['assignments']]
        self.assertEqual(got, [('A', None, 'B1-B6'), ('E', ['Friday'], 'B1-B6'), ('A', None, 'B7-B12'), ('E', ['Friday'], 'B7-B12')])

    def test_course_on_several_rows_with_different_slots_is_combined_and_flagged(self):
        rows = [
            ['BT2010', 'Life Sciences', '2-0-0-2', 'a@x', 'M', 'A01-007', ''],
            ['', '', '', '', 'R1', 'A01-007', ''],
        ]
        _, courses = parse(rows, merges=['A6:A7', 'B6:B7'])
        self.assertEqual([a['slot'] for a in courses['BT2010']['schedule']['assignments']], ['M', 'R1'])
        self.assertIn('multi_row_slots', codes(courses['BT2010']))

    def test_a_row_with_a_slot_but_no_code_is_never_attached_to_its_neighbour(self):
        rows = [
            ['BT2010', 'Life Sciences', '2-0-0-2', 'a@x', 'M', 'A01-007', ''],
            ['', 'Physical Education', '', '', 'R1', 'A01-007', ''],
        ]
        _, courses = parse(rows)
        self.assertEqual([a['slot'] for a in courses['BT2010']['schedule']['assignments']], ['M'])
        orphan = [c for code, c in courses.items() if code.startswith('NOCODE-')][0]
        self.assertEqual(orphan['courseName'], 'Physical Education')
        self.assertEqual([(i['code'], i['severity']) for i in orphan['issues']], [('missing_code', 'blocking')])
        self.assertEqual(orphan['sourceRows'][0]['row'], 7)

    def test_parallel_rooms_without_batches_become_one_class(self):
        rows = [
            ['BT2010', 'Life Sciences', '2-0-0-2', 'a@x', 'M', 'A01-007\n(DS+ME+CE )', ''],
            ['', '', '', '', '', 'A01-002\n(EE+CS)', ''],
        ]
        _, courses = parse(rows, merges=['A6:A7', 'B6:B7', 'E6:E7'])
        rooms = [a['room'] for a in courses['BT2010']['schedule']['assignments']]
        self.assertEqual(rooms, ['A01-007 (DS+ME+CE) | A01-002 (EE+CS)'])
        self.assertIn('parallel_rooms', codes(courses['BT2010']))

    def test_missing_room_and_scheduling_remarks_are_flagged(self):
        _, courses = parse([
            ['CS101', 'One', '3', 'a@x', 'B', '', 'Start time adjusted to give students time to move'],
            ['CS102', 'Two', '3', 'a@x', 'B', 'A01', 'Maximum 40'],
            ['CS103', 'Three', '3', 'a@x', 'B', 'A01', 'Exam slot: D'],
        ])
        self.assertEqual(sorted(codes(courses['CS101'])), ['missing_room', 'remark'])
        self.assertEqual(codes(courses['CS102']), [])
        self.assertEqual(codes(courses['CS103']), [])

    def test_same_code_on_two_sheets_of_one_workbook(self):
        data = make_xlsx({
            'Core': {'rows': TITLE + [HEADER, ['ME3050', 'Design', '3', 'a@x', 'D', 'A01-118', '']]},
            's5': {'rows': TITLE + [['Code', 'Course Name', 'Credits'], ['ME3050', 'Design', '3']]},
        })
        result = parse_workbook(data, '06_UG_ME_Jan-May-2027.xlsx', SLOTS)
        self.assertEqual(len(result['courses']), 1)
        self.assertEqual(len(result['courses'][0]['sourceRows']), 2)
        self.assertEqual([a['slot'] for a in result['courses'][0]['schedule']['assignments']], ['D'])
        self.assertTrue(any('no "Slot" column' in w['message'] for w in result['warnings']))

    def test_instructions_under_the_table_are_not_courses(self):
        _, courses = parse([
            ['CS101', 'One', '3', 'a@x', 'B', 'A01', ''],
            ['Primary instructor is the faculty who coordinates the course', '', '', '', '', '', ''],
            ['', '', '', '', 'A', 'A02', ''],
        ])
        self.assertEqual(list(courses), ['CS101'])
        self.assertEqual([a['slot'] for a in courses['CS101']['schedule']['assignments']], ['B'])

    def test_typo_headers_and_room_batches_column(self):
        header = ['Code', 'Course Name', 'Credits', 'Primay instructor email ID', 'Slot', 'Room/Batches', 'Remakrs']
        _, courses = parse([['CS101', 'One', '3', 'a@x', 'B', 'A01 (B1-B4)', 'Upper limit 40']], header=header)
        self.assertEqual(courses['CS101']['schedule']['assignments'][0]['batches'], 'B1-B4')
        self.assertEqual(courses['CS101']['instructors'], ['a@x'])

    def test_program_and_branch_from_the_file_name(self):
        self.assertEqual(determine_program_branch('03_UG_CSE_Aug-Dec-2026.xlsx'), ('UG', 'CSE'))
        self.assertEqual(determine_program_branch('11_PG_MTech_CaM_Aug-Dec-2026.xlsx'), ('PG', 'CAM'))
        self.assertEqual(determine_program_branch('01a_UG_CommonCourses(InstCore_SME)_Jan-May-2027.xlsx'), ('UG', 'CommonCourses'))
        self.assertEqual(determine_program_branch('20_PG_MTech_Design & Automation_Aug-Dec-2026.xlsx'), ('PG', 'Design_Automation'))
        self.assertEqual(determine_program_branch('notes.xlsx'), (None, None))
        self.assertEqual(semester_in_filename('03_UG_CSE_Jan-May-2027.xlsx'), 'Jan-May 2027')

    def test_a_file_whose_name_says_nothing_is_reported_not_guessed(self):
        result = parse_workbook(workbook([['CS101', 'One', '3', 'a@x', 'B', 'A01', '']]), 'courses.xlsx', SLOTS)
        self.assertEqual(result['courses'], [])
        self.assertIn('programme and branch', result['warnings'][0]['message'])
        named = parse_workbook(workbook([['CS101', 'One', '3', 'a@x', 'B', 'A01', '']]), 'courses.xlsx', SLOTS, program='UG', branch='CSE')
        self.assertEqual(len(named['courses']), 1)


class MalformedFiles(unittest.TestCase):
    def test_not_a_zip(self):
        with self.assertRaises(UnsafeFileError):
            read_workbook(b'this is not an xlsx file')
        result = parse_workbook(b'PK\x03\x04 truncated', '03_UG_CSE_Jan-May-2027.xlsx', SLOTS)
        self.assertEqual(result['courses'], [])
        self.assertIn('Could not read this workbook', result['warnings'][0]['message'])

    def test_a_zip_that_is_not_a_workbook(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('hello.txt', 'hi')
        with self.assertRaises(UnsafeFileError):
            read_workbook(buffer.getvalue())

    def test_xml_with_a_doctype_is_refused(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('xl/workbook.xml', '<!DOCTYPE x [<!ENTITY a "aaaa">]><workbook/>')
        with self.assertRaises(UnsafeFileError):
            read_workbook(buffer.getvalue())

    def test_a_sheet_without_a_header_is_skipped_with_a_warning(self):
        data = make_xlsx({'Notes': {'rows': [['Some notes'], ['More notes']]}})
        result = parse_workbook(data, '03_UG_CSE_Jan-May-2027.xlsx', SLOTS)
        self.assertEqual(result['courses'], [])
        self.assertIn('header row', result['warnings'][0]['message'])

    def test_a_slot_document_that_is_not_one(self):
        self.assertEqual(parse_slot_document(b'not a docx')['status'], 'failed')


class CommandLine(unittest.TestCase):
    def test_end_to_end_json(self):
        with tempfile.TemporaryDirectory() as directory:
            with open(os.path.join(directory, '03_UG_CSE_Jan-May-2027.xlsx'), 'wb') as handle:
                handle.write(workbook([['CS101', 'One', '3', 'a@x', 'B+PA1', 'A01', '']]))
            with open(os.path.join(directory, '04_UG_DS_Jan-May-2027.xlsx'), 'wb') as handle:
                handle.write(workbook([['CS101', 'One', '3', 'a@x', 'A', 'N305', '']]))
            with open(os.path.join(directory, 'readme.txt'), 'w') as handle:
                handle.write('ignored')
            manifest = os.path.join(directory, 'manifest.json')
            with open(manifest, 'w') as handle:
                json.dump({'slotDefinitions': SLOTS}, handle)

            script = os.path.join(os.path.dirname(HERE), 'import_semester.py')
            output = subprocess.run(
                [sys.executable, '-I', script, '--dir', directory, '--manifest', manifest, '--semester', 'Aug-Dec 2026'],
                check=True, capture_output=True, text=True).stdout
            result = json.loads(output)

        self.assertEqual(result['slots']['status'], 'missing')
        self.assertEqual(result['slots']['used'], 'existing')
        self.assertEqual([(c['branch'], c['courseCode']) for c in result['courses']], [('CSE', 'CS101'), ('DS', 'CS101')])
        # The same code in two branches keeps both offerings and points out the difference.
        self.assertTrue(all('differs_across_branches' in [i['code'] for i in c['issues']] for c in result['courses']))
        messages = ' '.join(w['message'] for w in result['warnings'])
        self.assertIn('Ignored', messages)
        self.assertIn('says Jan-May 2027, but this semester is Aug-Dec 2026', messages)


REAL = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(HERE))), 'raw_data', 'Timetable')


class RealWorkbooks(unittest.TestCase):
    """Only where the institute's files and openpyxl exist (neither is in the repository)."""

    def setUp(self):
        try:
            import openpyxl  # noqa: F401
        except ImportError:
            self.skipTest('openpyxl is not installed')
        if not os.path.isdir(REAL):
            self.skipTest('raw_data/Timetable is not present')

    def test_reader_agrees_with_openpyxl_cell_for_cell(self):
        import openpyxl
        compared = 0
        for name in sorted(os.listdir(REAL)):
            if not name.endswith('.xlsx'):
                continue
            ours = {sheet['name']: sheet for sheet in read_workbook(os.path.join(REAL, name))}
            theirs = openpyxl.load_workbook(os.path.join(REAL, name), data_only=True)
            for worksheet in theirs.worksheets:
                rows = ours[worksheet.title]['rows']
                for r, row in enumerate(worksheet.iter_rows(values_only=True)):
                    for c, value in enumerate(row):
                        if value is None or str(value).strip() == '' or not isinstance(value, str):
                            continue
                        self.assertEqual(rows[r][c], value, f'{name} / {worksheet.title} / R{r + 1}C{c + 1}')
                        compared += 1
                self.assertEqual(len(ours[worksheet.title]['merges']), len(worksheet.merged_cells.ranges))
        self.assertGreater(compared, 1000)

    def test_slot_document_matches_the_bundled_slot_table(self):
        documents = [n for n in os.listdir(REAL) if n.endswith('.docx')]
        if not documents:
            self.skipTest('no slot document')
        parsed = parse_slot_document(os.path.join(REAL, documents[0]))
        bundled = os.path.join(os.path.dirname(REAL), '..', 'src', 'data', 'timetable', 'slots.json')
        with open(bundled, encoding='utf-8') as handle:
            expected = json.load(handle)
        self.assertEqual(parsed['status'], 'parsed')
        for code, definition in expected.items():
            self.assertEqual(parsed['definitions'].get(code), definition, code)


if __name__ == '__main__':
    unittest.main()
