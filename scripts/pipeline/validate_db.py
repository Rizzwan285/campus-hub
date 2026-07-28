import os
import json
import glob
from collections import defaultdict
from datetime import datetime

DATA_DIR = "src/data/timetable"

def validate_db():
    report = {
        "total_workbooks": 0,
        "total_courses": 0,
        "zero_meeting_courses": [],
        "duplicate_ids": [],
        "overlapping_meetings": [],
        "malformed_eligibility": [],
        "schema_violations": [],
        "duplicate_codes_across_programs": defaultdict(list)
    }

    # Load slots
    with open(os.path.join(DATA_DIR, "slots.json")) as f:
        slots_db = json.load(f)

    # Validate metadata
    with open(os.path.join(DATA_DIR, "metadata.json")) as f:
        metadata = json.load(f)
        report["total_workbooks"] = len(metadata.get("sourceWorkbooks", []))
        if "schemaVersion" not in metadata:
            report["schema_violations"].append("metadata.json missing schemaVersion")

    # Validate holidays
    with open(os.path.join(DATA_DIR, "holidays.json")) as f:
        holidays = json.load(f)
        if not isinstance(holidays, list):
            report["schema_violations"].append("holidays.json is not a list")

    course_id_map = {}
    code_program_map = defaultdict(set)

    # Load all course JSONs
    json_files = glob.glob(os.path.join(DATA_DIR, "**/*.json"), recursive=True)
    for filepath in json_files:
        if os.path.basename(filepath) in ["slots.json", "metadata.json", "holidays.json"]:
            continue
            
        program = os.path.basename(os.path.dirname(filepath))
        
        with open(filepath) as f:
            courses = json.load(f)
            report["total_courses"] += len(courses)
            
            for course in courses:
                # 1 & 2. Schema check
                required_keys = ["id", "courseCode", "courseName", "category", "eligibility", "meetings"]
                for k in required_keys:
                    if k not in course:
                        report["schema_violations"].append(f"Course {course.get('courseCode', 'Unknown')} missing {k}")

                c_id = course.get("id")
                c_code = course.get("courseCode")

                # 5. Duplicate IDs
                if c_id in course_id_map:
                    report["duplicate_ids"].append(c_id)
                course_id_map[c_id] = True

                # 6. Duplicate codes across programs
                if c_code:
                    code_program_map[c_code].add(program)

                # 7. Malformed eligibility
                elig = course.get("eligibility", {})
                if not isinstance(elig, dict):
                    report["malformed_eligibility"].append(c_code)

                # 8. Zero meetings
                meetings = course.get("meetings", [])
                if len(meetings) == 0:
                    report["zero_meeting_courses"].append({
                        "courseCode": c_code,
                        "rawSlot": course.get("rawSlot", "")
                    })

                # 3 & 9. Validate meetings & Overlap detection
                day_meetings = defaultdict(list)
                for m in meetings:
                    m_req = ["day", "startTime", "endTime", "room", "recurrence", "type"]
                    for k in m_req:
                        if k not in m:
                            report["schema_violations"].append(f"Meeting in {c_code} missing {k}")
                    
                    if "day" in m and "startTime" in m and "endTime" in m:
                        day_meetings[m["day"]].append(m)

                for day, day_meets in day_meetings.items():
                    # Sort by startTime
                    day_meets.sort(key=lambda x: x["startTime"])
                    for i in range(1, len(day_meets)):
                        prev = day_meets[i-1]
                        curr = day_meets[i]
                        # Time overlap logic (simple string comparison works for HH:MM 24h format)
                        if curr["startTime"] < prev["endTime"]:
                            report["overlapping_meetings"].append(c_code)
                            break

    # Finalize duplicate codes
    for code, programs in code_program_map.items():
        if len(programs) > 1:
            report["duplicate_codes_across_programs"][code] = list(programs)

    # Print summary report
    print("=== VALIDATION REPORT ===")
    print(f"Total Workbooks (from metadata): {report['total_workbooks']}")
    print(f"Total Parsed Courses: {report['total_courses']}")
    print(f"Schema Violations: {len(report['schema_violations'])}")
    print(f"Duplicate IDs: {len(report['duplicate_ids'])}")
    print(f"Duplicate Codes Across Programs: {len(report['duplicate_codes_across_programs'])}")
    print(f"Malformed Eligibility: {len(report['malformed_eligibility'])}")
    print(f"Courses with ZERO meetings: {len(report['zero_meeting_courses'])}")
    print(f"Courses with overlapping meetings: {len(report['overlapping_meetings'])}")

    print("\n--- SAMPLE ZERO MEETING COURSES ---")
    for z in report['zero_meeting_courses'][:15]:
        print(f"  {z['courseCode']} (Raw Slot: '{z['rawSlot']}')")
        
    print("\n--- DUPLICATE CODES ACROSS PROGRAMS ---")
    for c, p in list(report['duplicate_codes_across_programs'].items())[:15]:
        print(f"  {c} -> {p}")

    print("\n--- DUPLICATE IDS ---")
    for d in report['duplicate_ids'][:15]:
        print(f"  {d}")

    print("\n--- SCHEMA VIOLATIONS ---")
    for s in report['schema_violations'][:15]:
        print(f"  {s}")

if __name__ == "__main__":
    validate_db()
