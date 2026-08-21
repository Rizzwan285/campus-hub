"""Tests for the slot-status classification in data_quality_checks.

No database and no Airflow needed — the classifier is a pure function.

    python3 -m unittest discover -s pipeline/tests
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from data_quality_checks import is_non_slot_status  # noqa: E402


class NonSlotStatusTests(unittest.TestCase):
    """Values that mean "this course has no timetable slot"."""

    # Every distinct raw_slot among the 15 offerings that have no meetings,
    # as queried from the database on 2026-08-21.
    OBSERVED_IN_DATA = [
        "TBD",                    # 9 offerings
        "I don't require slots",  # 2
        "Not required",           # 2
        "N.A.",                   # 1  (DA5110, project)
        "-",                      # 1  (CM5110A, dissertation)
    ]

    def test_every_observed_status_is_recognised(self):
        for value in self.OBSERVED_IN_DATA:
            with self.subTest(raw_slot=value):
                self.assertTrue(is_non_slot_status(value))

    def test_spelling_variants(self):
        variants = [
            "tbd", "  TBD  ", "TBA", "TBD - will confirm later",
            "NA", "N.A", "n.a.", "N/A", "n / a",
            "not required", "NOT REQUIRED", "Not Required.",
            "I do not require slots", "I dont require slots",
            # Curly apostrophe, straight from the workbooks.
            "I don’t require slots",
            "No slot", "no slots", "Nil", "none",
            "--", ".", "  ", "",
        ]
        for value in variants:
            with self.subTest(raw_slot=value):
                self.assertTrue(is_non_slot_status(value))

    def test_null_and_empty_count_as_no_slot(self):
        self.assertTrue(is_non_slot_status(None))
        self.assertTrue(is_non_slot_status(""))
        self.assertTrue(is_non_slot_status("   "))


class GenuineSlotTests(unittest.TestCase):
    """Values that are real slot expressions: a missing meeting is a real gap."""

    def test_slot_codes_are_not_statuses(self):
        genuine = [
            "M", "W", "F", "A", "B1",
            "[A]", "(B1)", "[A] [B]", "(A1)(A2)",
            "M W F", "Mon Wed Fri",
            "A1 + lab",
            "Tue 2:00-3:00",
            "L1, T2",
        ]
        for value in genuine:
            with self.subTest(raw_slot=value):
                self.assertFalse(is_non_slot_status(value))

    def test_free_text_remarks_still_count_as_unresolved(self):
        """The known parser gap, and the reason the check must keep warning.

        These describe a real schedule the parser cannot encode yet — unlike
        "TBD", they are not a statement that no slot exists.
        """
        remarks = [
            "alt weeks half batch",
            "alternate weeks, half batch",
            "C slot, alt weeks",
            "half batch on Fridays",
        ]
        for value in remarks:
            with self.subTest(raw_slot=value):
                self.assertFalse(is_non_slot_status(value))

    def test_status_words_inside_a_real_slot_do_not_trigger(self):
        """Guards against the patterns being too greedy."""
        self.assertFalse(is_non_slot_status("A2 nilgiri lab"))   # contains "nil"
        self.assertFalse(is_non_slot_status("NA5001 slot B"))    # starts with "NA"


if __name__ == "__main__":
    unittest.main()
