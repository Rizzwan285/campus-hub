import os
import json
from datetime import datetime, timezone
from parse_slots import parse_slots
from parse_courses import parse_excel_workbook
from normalize import normalize_eligibility, normalize_slot_expression, generate_meetings

RAW_DATA_DIR = "raw_data/Timetable"
OUT_DIR = "src/data/timetable"

import shutil

def ensure_dirs():
    if os.path.exists(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(os.path.join(OUT_DIR, "UG"), exist_ok=True)
    os.makedirs(os.path.join(OUT_DIR, "PG"), exist_ok=True)

def determine_program_branch(filename):
    """
    Extracts program and branch from filename securely.
    """
    import re
    # Match patterns like 03_UG_CSE_... or 01a_UG_CommonCourses(InstCore...)_...
    match = re.match(r'^\d+[a-z]?_([A-Z]+)_([^_]+(?:_[^_]+)*?)_(?:Jan|Aug)', filename)
    if match:
        program = match.group(1)
        branch_raw = match.group(2)
        # Remove parentheses and sanitize
        branch_raw = re.sub(r'\(.*?\)', '', branch_raw)
        branch = re.sub(r'[^a-zA-Z0-9]', '', branch_raw)
        return program, branch
    
    # Fallback
    parts = filename.split('_')
    if len(parts) >= 3:
        return parts[1], re.sub(r'[^a-zA-Z0-9]', '', parts[2])
        
    return "Unknown", "Unknown"

def main():
    ensure_dirs()
    
    # 1. Parse Slots
    slots_docx = os.path.join(RAW_DATA_DIR, "00_Slot_system_Aug-Dec_2026.docx")
    slots_db = parse_slots(slots_docx)
    
    with open(os.path.join(OUT_DIR, "slots.json"), "w") as f:
        json.dump(slots_db, f, indent=2)
        
    # 2. Parse and normalize courses
    metadata = {
        "schemaVersion": "1.0.0",
        "semester": "Aug-Dec 2026",
        "generatorVersion": "v1.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalCourses": 0,
        "programs": [],
        "sourceWorkbooks": []
    }
    
    files = [f for f in os.listdir(RAW_DATA_DIR) if f.endswith('.xlsx')]
    
    for file in files:
        filepath = os.path.join(RAW_DATA_DIR, file)
        prog, branch = determine_program_branch(file)
        
        if prog not in metadata["programs"]:
            metadata["programs"].append(prog)
            
        mtime = os.path.getmtime(filepath)
        dt = datetime.fromtimestamp(mtime, timezone.utc)
        
        metadata["sourceWorkbooks"].append({
            "filename": file,
            "lastModified": dt.isoformat()
        })
        
        raw_courses = parse_excel_workbook(filepath)
        normalized_courses = []
        seen_ids = set()
        
        for rc in raw_courses:
            # Normalization
            eligibility = normalize_eligibility(rc["rawAvailability"])
            normalized_slots = normalize_slot_expression(rc["rawSlot"])
            meetings = generate_meetings(normalized_slots, slots_db)
            
            # Enrich meetings with room and instructor
            for m in meetings:
                m['room'] = rc['room']
                m['instructors'] = [i for i in rc['instructors'] if i]
                
            courseCode = rc["courseCode"]
            offeringId = f"{prog}_{branch}_{courseCode}"
            
            # Deduplicate within the same program/branch file
            if offeringId in seen_ids:
                continue
            seen_ids.add(offeringId)
            
            course_obj = {
                "id": offeringId,
                "courseCode": courseCode,
                "courseName": rc["courseName"],
                "credits": rc["credits"],
                "category": rc["category"],
                "rawAvailability": rc["rawAvailability"],
                "rawSlot": rc["rawSlot"],
                "eligibility": eligibility,
                "meetings": meetings
            }
            normalized_courses.append(course_obj)
            metadata["totalCourses"] += 1
            
        # Write output file
        out_path = os.path.join(OUT_DIR, prog, f"{branch}.json")
        with open(out_path, "w") as f:
            json.dump(normalized_courses, f, indent=2)
            
    # Write holidays dummy file
    with open(os.path.join(OUT_DIR, "holidays.json"), "w") as f:
        json.dump([{"date": "2026-01-26", "name": "Republic Day"}], f, indent=2)
            
    # Write metadata
    with open(os.path.join(OUT_DIR, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
        
    print(f"Pipeline complete. Generated {metadata['totalCourses']} courses across {len(files)} files.")

if __name__ == "__main__":
    main()
