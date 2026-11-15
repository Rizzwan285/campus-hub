"""
Parses a semester's institute files into the JSON the admin panel reviews.

    python3 scripts/pipeline/import_semester.py --dir raw_data/Timetable \
        --semester "Aug-Dec 2026" --out parsed.json

The API runs exactly this on the files uploaded under /admin -> Semesters. If
the API host has no Python, run it here and upload `parsed.json` instead; both
routes go through the same parser.

Input:  a directory of .xlsx course workbooks and (optionally) the slot-system
        .docx. `--manifest` may name each file's programme and branch and
        supply the slot definitions to fall back on.
Output: {parserVersion, semester, slots, files, courses, warnings}. Nothing is
        written anywhere else; publishing is the admin panel's job.
"""
import argparse
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from course_rows import parse_workbook  # noqa: E402
from docx_slots import parse_slot_document  # noqa: E402
from slot_expressions import REVIEW, clean_text, issue  # noqa: E402
from xlsx_reader import semester_in_filename  # noqa: E402

PARSER_VERSION = '2.0.0'


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def run(directory, manifest=None, semester=None):
    manifest = manifest or {}
    overrides = {entry['name']: entry for entry in manifest.get('files', [])}
    fallback_slots = manifest.get('slotDefinitions') or {}
    semester = semester or manifest.get('semester')

    names = sorted(
        name for name in os.listdir(directory)
        if not name.startswith(('.', '~$')) and os.path.isfile(os.path.join(directory, name))
    )
    workbooks = [n for n in names if n.lower().endswith('.xlsx')]
    documents = [n for n in names if n.lower().endswith('.docx')]
    warnings = []

    for name in names:
        if name not in workbooks and name not in documents:
            warnings.append({'file': name, 'sheet': None, 'row': None,
                             'message': 'Ignored: only .xlsx course workbooks and the slot-system .docx are read.'})

    # ---- slot system ------------------------------------------------------
    if documents:
        slot_file = documents[0]
        slots = parse_slot_document(os.path.join(directory, slot_file))
        slots['file'] = slot_file
        for extra in documents[1:]:
            warnings.append({'file': extra, 'sheet': None, 'row': None,
                             'message': f'Ignored: the slot system was read from {slot_file}.'})
    else:
        slots = {'status': 'missing', 'definitions': {}, 'issues': [], 'file': None}

    # Courses are checked against the slots this run found; when the document
    # is absent or unreadable, against the ones the semester already has.
    slot_definitions = slots['definitions'] if slots['status'] == 'parsed' else fallback_slots
    slots['used'] = 'document' if slots['status'] == 'parsed' else ('existing' if fallback_slots else 'none')

    # ---- course workbooks -------------------------------------------------
    files, courses = [], []
    for name in workbooks:
        path = os.path.join(directory, name)
        override = overrides.get(name, {})
        parsed = parse_workbook(path, name, slot_definitions,
                                program=override.get('program'), branch=override.get('branch'))
        named = semester_in_filename(name)
        if semester and named and clean_text(named).lower() != clean_text(semester).lower().replace('–', '-'):
            parsed['warnings'].append({
                'file': name, 'sheet': None, 'row': None,
                'message': f'The file name says {named}, but this semester is {semester}.'})
        files.append({
            'name': name, 'kind': 'workbook', 'sha256': _sha256(path), 'size': os.path.getsize(path),
            'program': parsed['program'], 'branch': parsed['branch'],
            'sheets': parsed['sheets'], 'courses': len(parsed['courses']),
        })
        courses.extend(parsed['courses'])
        warnings.extend(parsed['warnings'])

    for name in documents:
        path = os.path.join(directory, name)
        files.append({'name': name, 'kind': 'slots', 'sha256': _sha256(path), 'size': os.path.getsize(path)})

    _cross_workbook_checks(courses)

    return {
        'parserVersion': PARSER_VERSION,
        'semester': semester,
        'slots': slots,
        'files': files,
        'courses': courses,
        'warnings': warnings,
    }


def _cross_workbook_checks(courses):
    """
    A code offered by several branches is normal, and so are different slots
    (ID5002 is M on Thursday for PEPS and on Tuesday for SOCD). Each stays its
    own offering; the difference is only pointed out.
    """
    by_code = {}
    for course in courses:
        by_code.setdefault(course['courseCode'], []).append(course)

    for code, offerings in by_code.items():
        if len(offerings) < 2:
            continue
        names = {clean_text(c['courseName']).lower() for c in offerings if c['courseName']}
        slots = {tuple(sorted((a['slot'], tuple(a.get('days') or ())) for a in c['schedule']['assignments']))
                 for c in offerings if c['schedule']['assignments']}
        where = ', '.join(f"{c['program']}/{c['branch']}" for c in offerings)
        for course in offerings:
            if len(names) > 1:
                course['issues'].append(issue(
                    'conflicting_info', REVIEW,
                    f'{code} has different names in different workbooks ({where}).'))
            if len(slots) > 1:
                course['issues'].append(issue(
                    'differs_across_branches', REVIEW,
                    f'{code} has different slots in different workbooks ({where}). '
                    'Each branch keeps its own; check that is intended.'))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--dir', required=True, help='directory holding the uploaded files')
    parser.add_argument('--manifest', help='JSON file: {semester, slotDefinitions, files:[{name, program, branch}]}')
    parser.add_argument('--semester', help='semester name, e.g. "Jan-May 2027"')
    parser.add_argument('--out', help='write the JSON here instead of stdout')
    args = parser.parse_args()

    manifest = None
    if args.manifest:
        with open(args.manifest, encoding='utf-8') as handle:
            manifest = json.load(handle)

    result = run(args.dir, manifest, args.semester)
    text = json.dumps(result, ensure_ascii=False)
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as handle:
            handle.write(text)
        blocking = sum(1 for c in result['courses'] if any(i['severity'] == 'blocking' for i in c['issues']))
        print(f"{len(result['courses'])} courses from {len(result['files'])} files "
              f"({blocking} need fixing before publishing) -> {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
