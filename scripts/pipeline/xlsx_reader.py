"""
Reads .xlsx workbooks and .docx tables with the standard library only.

The semester importer runs on the API host, on files an admin uploaded. Using
zipfile + ElementTree instead of pandas/openpyxl means the host needs nothing
but a Python 3 interpreter, and lets this module put hard limits on what an
uploaded archive may contain before any of it is parsed.

Only cell *values* are read (never formulas, macros, links or embedded
objects), together with merged ranges - the institute's sheets spread one
course over several merged rows, so the merges are part of the data.
"""
import io
import re
import zipfile
import xml.etree.ElementTree as ET

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_ENTRY_BYTES = 60 * 1024 * 1024
MAX_TOTAL_BYTES = 150 * 1024 * 1024
MAX_ENTRIES = 2000
MAX_SHEETS = 60
MAX_ROWS = 6000
MAX_COLS = 80
MAX_CELL_CHARS = 4000

NS_MAIN = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS_REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
NS_PKG = '{http://schemas.openxmlformats.org/package/2006/relationships}'
NS_W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


class UnsafeFileError(ValueError):
    """The file is not something this importer is willing to open."""


def _open_archive(source):
    data = source if isinstance(source, (bytes, bytearray)) else open(source, 'rb').read()
    if len(data) > MAX_FILE_BYTES:
        raise UnsafeFileError('File is larger than 20 MB.')
    if not data.startswith(b'PK'):
        raise UnsafeFileError('Not an Office Open XML file (expected .xlsx or .docx).')
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise UnsafeFileError(f'Corrupt archive: {error}')

    infos = archive.infolist()
    if len(infos) > MAX_ENTRIES:
        raise UnsafeFileError('Archive has too many entries.')
    total = 0
    for info in infos:
        # Sizes come from the zip directory; _read() re-checks while inflating.
        if info.file_size > MAX_ENTRY_BYTES:
            raise UnsafeFileError(f'Archive entry {info.filename!r} is too large.')
        total += info.file_size
    if total > MAX_TOTAL_BYTES:
        raise UnsafeFileError('Archive expands to more than 150 MB.')
    return archive


def _read(archive, name):
    try:
        handle = archive.open(name)
    except KeyError:
        return None
    with handle:
        data = handle.read(MAX_ENTRY_BYTES + 1)
    if len(data) > MAX_ENTRY_BYTES:
        raise UnsafeFileError(f'Archive entry {name!r} is too large.')
    return data


def _parse_xml(data):
    # No DTDs: that rules out entity-expansion and external-entity tricks
    # before the parser sees the document at all.
    if b'<!DOCTYPE' in data[:4096] or b'<!ENTITY' in data[:4096]:
        raise UnsafeFileError('XML with a DOCTYPE is not accepted.')
    return ET.fromstring(data)


def _column_index(ref):
    """'C12' -> 2."""
    index = 0
    for ch in ref:
        if ch.isalpha():
            index = index * 26 + (ord(ch.upper()) - 64)
        else:
            break
    return index - 1


def _row_index(ref):
    digits = ''.join(ch for ch in ref if ch.isdigit())
    return int(digits) - 1 if digits else 0


def _text_of(node):
    """
    The text of a shared-string or inline-string node: its own <t> plus the
    <t> of each rich-text run. Phonetic runs (<rPh>) repeat the text in
    another script and are skipped.
    """
    parts = []
    for child in node:
        if child.tag == f'{NS_MAIN}t':
            parts.append(child.text or '')
        elif child.tag == f'{NS_MAIN}r':
            parts.extend(t.text or '' for t in child.iter(f'{NS_MAIN}t'))
    return ''.join(parts)


def _format_number(text):
    """Excel stores 4 as '4' or '4.0'; course sheets mean the integer."""
    try:
        value = float(text)
    except ValueError:
        return text
    if value == int(value) and abs(value) < 1e15:
        return str(int(value))
    return repr(value) if 'e' in text.lower() else text


def read_workbook(source):
    """
    Returns [{'name', 'rows', 'merges'}] for the visible order of sheets.

    rows   - list of lists of str (or None for an empty cell), 0-indexed.
    merges - list of (first_row, first_col, last_row, last_col), 0-indexed.
    """
    archive = _open_archive(source)

    workbook_xml = _read(archive, 'xl/workbook.xml')
    if workbook_xml is None:
        raise UnsafeFileError('Not an Excel workbook (xl/workbook.xml is missing).')
    workbook = _parse_xml(workbook_xml)

    targets = {}
    rels_xml = _read(archive, 'xl/_rels/workbook.xml.rels')
    if rels_xml is not None:
        for rel in _parse_xml(rels_xml).iter(f'{NS_PKG}Relationship'):
            target = rel.get('Target', '')
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            targets[rel.get('Id')] = target

    shared = []
    shared_xml = _read(archive, 'xl/sharedStrings.xml')
    if shared_xml is not None:
        for item in _parse_xml(shared_xml).iter(f'{NS_MAIN}si'):
            shared.append(_text_of(item))

    sheets = []
    for sheet in workbook.iter(f'{NS_MAIN}sheet'):
        if len(sheets) >= MAX_SHEETS:
            raise UnsafeFileError('Workbook has too many sheets.')
        path = targets.get(sheet.get(f'{NS_REL}id'))
        data = _read(archive, path) if path else None
        if data is None:
            continue
        sheets.append(_read_sheet(sheet.get('name', ''), _parse_xml(data), shared))
    return sheets


def _read_sheet(name, root, shared):
    cells = {}
    max_row = max_col = -1

    for row in root.iter(f'{NS_MAIN}row'):
        next_col = 0
        for cell in row.iter(f'{NS_MAIN}c'):
            ref = cell.get('r')
            if ref:
                r, c = _row_index(ref), _column_index(ref)
            else:
                r, c = (_row_index(row.get('r', '1')), next_col)
            next_col = c + 1
            if r >= MAX_ROWS or c >= MAX_COLS:
                continue

            kind = cell.get('t')
            value_node = cell.find(f'{NS_MAIN}v')
            text = None
            if kind == 's' and value_node is not None and value_node.text is not None:
                index = int(value_node.text)
                text = shared[index] if 0 <= index < len(shared) else None
            elif kind == 'inlineStr':
                inline = cell.find(f'{NS_MAIN}is')
                text = _text_of(inline) if inline is not None else None
            elif kind == 'b' and value_node is not None:
                text = 'TRUE' if value_node.text == '1' else 'FALSE'
            elif kind in ('str', 'e') and value_node is not None:
                text = value_node.text
            elif value_node is not None and value_node.text is not None:
                text = _format_number(value_node.text)

            if text is None or text.strip() == '':
                continue
            cells[(r, c)] = text[:MAX_CELL_CHARS]
            max_row, max_col = max(max_row, r), max(max_col, c)

    rows = [[None] * (max_col + 1) for _ in range(max_row + 1)]
    for (r, c), text in cells.items():
        rows[r][c] = text

    merges = []
    for merge in root.iter(f'{NS_MAIN}mergeCell'):
        ref = merge.get('ref', '')
        if ':' not in ref:
            continue
        first, last = ref.split(':', 1)
        merges.append((_row_index(first), _column_index(first), _row_index(last), _column_index(last)))

    return {'name': name, 'rows': rows, 'merges': merges}


def read_docx_tables(source):
    """
    Returns (paragraphs, tables). Each table is a list of rows; each row a list
    of {'text', 'span', 'vmerge'} cells, where span is the number of grid
    columns the cell covers and vmerge is None, 'restart' or 'continue'.
    """
    archive = _open_archive(source)
    document_xml = _read(archive, 'word/document.xml')
    if document_xml is None:
        raise UnsafeFileError('Not a Word document (word/document.xml is missing).')
    body = _parse_xml(document_xml).find(f'{NS_W}body')
    if body is None:
        return [], []

    def paragraph_text(paragraph):
        parts = []
        for node in paragraph.iter():
            if node.tag == f'{NS_W}t':
                parts.append(node.text or '')
            elif node.tag in (f'{NS_W}br', f'{NS_W}cr'):
                parts.append('\n')
            elif node.tag == f'{NS_W}tab':
                parts.append(' ')
        return ''.join(parts)

    def cell_text(cell):
        return '\n'.join(paragraph_text(p) for p in cell.iter(f'{NS_W}p')).strip()

    paragraphs = [paragraph_text(p).strip() for p in body.findall(f'{NS_W}p')]
    tables = []
    for table in body.iter(f'{NS_W}tbl'):
        rows = []
        for tr in table.findall(f'{NS_W}tr'):
            row = []
            for tc in tr.findall(f'{NS_W}tc'):
                props = tc.find(f'{NS_W}tcPr')
                span, vmerge = 1, None
                if props is not None:
                    grid_span = props.find(f'{NS_W}gridSpan')
                    if grid_span is not None:
                        span = max(1, int(grid_span.get(f'{NS_W}val', '1')))
                    merged = props.find(f'{NS_W}vMerge')
                    if merged is not None:
                        vmerge = merged.get(f'{NS_W}val', 'continue')
                row.append({'text': cell_text(tc), 'span': span, 'vmerge': vmerge})
            rows.append(row)
        tables.append(rows)
    return [p for p in paragraphs if p], tables


_SEMESTER_RE = re.compile(r'(Jan|Aug)\s*[-_ ]\s*(May|Dec)\s*[-_ ]?\s*(\d{4})', re.IGNORECASE)


def semester_in_filename(filename):
    """'03_UG_CSE_Aug-Dec-2026.xlsx' -> 'Aug-Dec 2026', or None."""
    match = _SEMESTER_RE.search(filename)
    if not match:
        return None
    return f'{match.group(1).title()}-{match.group(2).title()} {match.group(3)}'
