"""Data quality checks for the Campus Hub operational database.

The Airflow DAG `campus_data_quality` imports these; they also run on their own
against any Postgres the app uses:

    DATABASE_URL=postgresql://dev:dev_password@localhost:5433/campus_hub \
        python data_quality_checks.py

Exit code is 0 when every check passes or warns, 1 when any check fails.
"""
from __future__ import annotations

import os
import re
import sys
from collections import Counter
from dataclasses import dataclass
from typing import Callable, Dict

PASS = "PASS"
WARN = "WARN"
FAIL = "FAIL"


@dataclass(frozen=True)
class CheckResult:
    name: str
    status: str
    detail: str

    @property
    def failed(self) -> bool:
        return self.status == FAIL


def check_mess_menu_completeness(conn) -> CheckResult:
    """Every (mess, week_cycle, day, meal) row must carry something to eat.

    Kedaram-style entries use `items`; Nila-style entries use the veg/non_veg
    pair instead, so a row is only empty when all three are.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            select m.name, e.week_cycle, e.day_of_week, e.meal
            from mess_menu_entries e
            join messes m on m.id = e.mess_id
            where cardinality(e.items) = 0
              and e.veg is null
              and e.non_veg is null
            order by 1, 2, 3, 4
            """
        )
        empty = cur.fetchall()

    if empty:
        names = [f"{row[0]}/{row[1]}/{row[2]}/{row[3]}" for row in empty]
        return CheckResult("mess_menu_completeness", FAIL,
                           f"{len(empty)} empty menu entries: {names[:10]}")
    return CheckResult("mess_menu_completeness", PASS, "all menu entries have content")


def check_bus_schedule_order(conn) -> CheckResult:
    """`sort_order` must be gapless per (day_type, direction).

    Departure times are ordered strings — AM/PM is inferred from position — so a
    gap or a duplicate silently corrupts "next bus" on the client.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            select day_type,
                   direction,
                   count(*)                                as total,
                   max(sort_order) - min(sort_order) + 1   as span
            from bus_departures
            group by day_type, direction
            having count(*) <> max(sort_order) - min(sort_order) + 1
            order by 1, 2
            """
        )
        gaps = cur.fetchall()

    if gaps:
        return CheckResult("bus_schedule_order", FAIL,
                           f"sort_order gaps in {len(gaps)} group(s): {gaps}")
    return CheckResult("bus_schedule_order", PASS, "departure ordering is contiguous")


# raw_slot doubles as a status field. Alongside real slot expressions the
# institute workbooks use it to say a course has no timetable slot at all —
# "TBD", "N.A.", "Not required", "I don't require slots", "-". Those are
# answers, not parsing gaps, so the check names them without raising an alarm.
#
# Kept deliberately narrow: a genuine slot expression is short and starts with a
# slot code or a bracket, so none of these patterns can swallow one. The dbt
# model marts/dim_courses.sql mirrors this classification in SQL.
_NON_SLOT_PATTERNS = (
    re.compile(r"^(tbd|tba)\b"),                              # TBD, TBA, "TBD - later"
    re.compile(r"^n\.?\s?a\.?$"),                             # NA, N.A, N.A.
    re.compile(r"^n\s?/\s?a\b"),                              # N/A
    re.compile(r"^(nil|none)$"),
    re.compile(r"^no\s+slots?\b"),                            # "no slot", "no slots"
    re.compile(r"(not|no|don'?t|do\s+not)\s+require"),        # "Not required", "I don't require slots"
    re.compile(r"^[-\u2013\u2014.\s]*$"),                      # "-", "--", ".", whitespace
)


def is_non_slot_status(raw_slot: str | None) -> bool:
    """True when raw_slot records the *absence* of a slot rather than a schedule.

    Empty and null count as a non-slot status too, so callers can hand this any
    raw_slot without pre-filtering.
    """
    if raw_slot is None:
        return True

    # Curly apostrophes come through from the workbooks; normalise before matching.
    text = raw_slot.replace("\u2019", "'").strip().lower()
    text = re.sub(r"\s+", " ", text)
    if not text:
        return True

    return any(pattern.search(text) for pattern in _NON_SLOT_PATTERNS)


def check_course_meetings_exist(conn) -> CheckResult:
    """Courses with a real slot expression should resolve to at least one meeting.

    Two very different things land in raw_slot without meetings, and only one is
    a problem:

      * a status meaning the course has no slot ("TBD", "N.A.", "Not required")
        — expected, reported for visibility, does not warn;
      * a slot expression the parser could not turn into meetings — the actual
        gap, and what this check exists to surface.

    A warning rather than a failure, because a course that fails to resolve is
    bad data to fix, not a reason to stop the morning's pipeline.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            select co.id, co.course_code, co.raw_slot
            from course_offerings co
            left join course_meetings cm on cm.offering_id = co.id
            where co.raw_slot is not null
              and co.raw_slot <> ''
              and cm.id is null
            order by co.course_code
            """
        )
        orphans = cur.fetchall()

    unresolved = [row for row in orphans if not is_non_slot_status(row[2])]
    no_slot = [row for row in orphans if is_non_slot_status(row[2])]

    # "9 x TBD, 2 x Not required, ..." — enough to spot a new spelling appearing.
    breakdown = ", ".join(
        f"{count} x {status}"
        for status, count in Counter(row[2].strip() for row in no_slot).most_common()
    )
    context = f"{len(no_slot)} course(s) record no slot on purpose ({breakdown})" if no_slot else ""

    if unresolved:
        codes = [f"{row[1]} ({row[2].strip()})" for row in unresolved]
        detail = f"{len(unresolved)} course(s) have a slot that produced no meetings: {codes[:15]}"
        if context:
            detail += f"; separately, {context}"
        return CheckResult("course_meetings_exist", WARN, detail)

    detail = "every course with a real slot has meetings"
    if context:
        detail += f"; {context}"
    return CheckResult("course_meetings_exist", PASS, detail)


def check_no_duplicate_roll_numbers(conn) -> CheckResult:
    """A roll number identifies one student; duplicates break login."""
    with conn.cursor() as cur:
        cur.execute(
            """
            select roll_number, count(*)
            from profiles
            where roll_number is not null
            group by roll_number
            having count(*) > 1
            """
        )
        dupes = cur.fetchall()

    if dupes:
        return CheckResult("no_duplicate_roll_numbers", FAIL, f"duplicates: {dupes}")
    return CheckResult("no_duplicate_roll_numbers", PASS, "roll numbers are unique")


CHECKS: Dict[str, Callable[[object], CheckResult]] = {
    "mess_menu_completeness": check_mess_menu_completeness,
    "bus_schedule_order": check_bus_schedule_order,
    "course_meetings_exist": check_course_meetings_exist,
    "no_duplicate_roll_numbers": check_no_duplicate_roll_numbers,
}


def format_result(result: CheckResult) -> str:
    icon = {PASS: "[PASS]", WARN: "[WARN]", FAIL: "[FAIL]"}[result.status]
    return f"  {icon} {result.name}: {result.detail}"


def main() -> int:
    import psycopg2

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL is required", file=sys.stderr)
        return 2

    conn = psycopg2.connect(dsn)
    try:
        results = [check(conn) for check in CHECKS.values()]
    finally:
        conn.close()

    print("Campus Hub data quality report")
    print("=" * 60)
    for result in results:
        print(format_result(result))
    print("=" * 60)

    return 1 if any(result.failed for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
