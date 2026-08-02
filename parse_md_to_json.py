import os
import json
import re

MD_DIR = 'raw_data/Timetable_md'
OUT_UG_DIR = 'src/data/timetable/UG'
SLOTS_OUT = 'src/data/timetable/slots.json'

os.makedirs(OUT_UG_DIR, exist_ok=True)

# Parse slots
slots_data = {}
with open(os.path.join(MD_DIR, '00_Slot_system_Aug-Dec_2026.md'), 'r') as f:
    lines = f.readlines()
    for line in lines:
        if not line.startswith('|') or '---' in line or 'Start Time' in line:
            continue
        parts = [p.strip() for p in line.split('|')[1:-1]]
        if len(parts) < 4:
            continue
        slot_name, day, start_time, end_time = parts
        
        if slot_name not in slots_data:
            slots_data[slot_name] = {
                'type': 'lab' if slot_name.startswith('P') else 'lecture',
                'timings': []
            }
        slots_data[slot_name]['timings'].append({
            'day': day,
            'startTime': start_time,
            'endTime': end_time
        })

with open(SLOTS_OUT, 'w') as f:
    json.dump(slots_data, f, indent=2)

def extract_base_slots(raw_slot):
    # This is a simple regex to extract known base slots from things like A+R1, PA1, G+E (Friday), etc.
    s = re.sub(r'\(.*?\)', '', raw_slot)
    s = re.sub(r'\[.*?\]', '', s)
    parts = [p.strip() for p in s.split('+')]
    # Also support splitting by comma or space if needed? No, just +
    return [p for p in parts if p in slots_data]

# Parse courses
for filename in os.listdir(MD_DIR):
    if filename == '00_Slot_system_Aug-Dec_2026.md':
        continue
        
    branch = ''
    if 'CommonCourses' in filename:
        branch = 'CommonCourses'
    elif '_CE_' in filename:
        branch = 'CE'
    elif '_EE_' in filename:
        branch = 'EE'
    elif '_ME_' in filename:
        branch = 'ME'
    elif '_CSE_' in filename:
        branch = 'CSE'
    elif '_DS_' in filename:
        branch = 'DS'
    else:
        continue
        
    courses = {}
    with open(os.path.join(MD_DIR, filename), 'r') as f:
        lines = f.readlines()
        for line in lines:
            if not line.startswith('|') or '---' in line or 'Course Code' in line:
                continue
            parts = [p.strip() for p in line.split('|')[1:-1]]
            if len(parts) < 7:
                continue
            
            course_code = parts[0]
            if not course_code:
                continue
                
            course_name = parts[1]
            credits_val = parts[2]
            category = parts[3].lower() if parts[3] else 'core'
            instructor = parts[4]
            raw_slot = parts[5]
            room = parts[6]
            
            meetings = []
            if raw_slot:
                base_slots = extract_base_slots(raw_slot)
                for bs in base_slots:
                    slot_info = slots_data[bs]
                    for t in slot_info['timings']:
                        meetings.append({
                            'type': slot_info['type'],
                            'day': t['day'],
                            'startTime': t['startTime'],
                            'endTime': t['endTime'],
                            'room': room,
                            'instructors': [instructor] if instructor else [],
                            'recurrence': {'type': 'weekly'}
                        })
            
            course_obj = {
                'id': course_code,  # Using course_code as the primary ID!
                'courseCode': course_code,
                'courseName': course_name,
                'credits': credits_val,
                'category': category,
                'rawAvailability': '',
                'rawSlot': raw_slot,
                'eligibility': {},
                'meetings': meetings
            }
            
            # Using course_code as unique key ensures we keep the unique courses
            # but we will output a list at the end.
            if course_code in courses:
                # Merge if same course code on different lines? 
                # E.g. PH1030 is listed 4 times for 4 batches.
                # We should aggregate the meetings!
                courses[course_code]['meetings'].extend(meetings)
                
                # Combine instructors if different
                if instructor and instructor not in courses[course_code]['meetings'][-1]['instructors']:
                    for m in courses[course_code]['meetings']:
                        if instructor not in m['instructors']:
                            m['instructors'].append(instructor)
            else:
                courses[course_code] = course_obj
            
    out_file = os.path.join(OUT_UG_DIR, f"{branch}.json")
    with open(out_file, 'w') as f:
        # Output as a list of course objects!
        json.dump(list(courses.values()), f, indent=2)

