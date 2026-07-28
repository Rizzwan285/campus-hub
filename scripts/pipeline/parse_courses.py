import pandas as pd
import numpy as np

def parse_excel_workbook(filepath):
    """
    Parses a single excel workbook and returns a list of raw courses.
    Skips the first 3 rows to find the actual headers.
    """
    try:
        xl = pd.ExcelFile(filepath)
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return []

    raw_courses = []
    
    for sheet_name in xl.sheet_names:
        df = xl.parse(sheet_name, header=None)
        
        # Find the row that contains 'Code'
        header_row_idx = -1
        for idx, row in df.iterrows():
            row_str = " ".join([str(x) for x in row.values])
            if 'Code' in row_str and 'Course Name' in row_str:
                header_row_idx = idx
                break
                
        if header_row_idx == -1:
            print(f"Skipping sheet {sheet_name}: Could not find header row.")
            continue
            
        # Set the columns and drop the rows above the header
        df.columns = [str(c).strip().replace('\n', ' ') for c in df.iloc[header_row_idx]]
        df = df.iloc[header_row_idx+1:].reset_index(drop=True)
        
        code_col = next((col for col in df.columns if 'Code' in col), None)
        name_col = next((col for col in df.columns if 'Course Name' in col), None)
        slot_col = next((col for col in df.columns if 'Slot' in col), None)
        
        if not code_col or not name_col:
            continue
            
        import re
        # Course code regex: e.g., CS5634, MA1021, CM5120A, HSS5019
        code_regex = re.compile(r'^[A-Z]{2,3}\s*[0-9]{3,4}[A-Za-z]?$')

        for _, row in df.iterrows():
            # Convert NaN to empty string for safety
            row = row.replace({np.nan: ''})
            
            raw_code = str(row[code_col]).strip()
            
            # Skip empty codes
            if not raw_code:
                continue
                
            # Strict validation: must match course code format
            # Also eliminate long string instructional text
            if len(raw_code) > 12 or not code_regex.match(raw_code.replace(' ', '')):
                continue
            
            # Try to find availability/eligibility column
            avail_col = next((col for col in df.columns if 'Availability' in col), None)
            avail_val = row[avail_col] if avail_col else ''
            
            raw_course = {
                "courseCode": raw_code.replace(' ', ''),
                "courseName": str(row[name_col]).strip(),
                "credits": str(row.get('Credits', '')),
                "rawSlot": str(row[slot_col]).strip() if slot_col else '',
                "rawAvailability": str(avail_val).strip(),
                "room": str(row.get('Room', '')).strip(),
                "instructors": [
                    str(row.get('Primary instructor email ID', '')).strip(),
                    str(row.get('Additional instructor email ID, if any', '')).strip()
                ],
                "category": determine_category(sheet_name),
                "remarks": str(row.get('Remarks', '')).strip()
            }
            raw_courses.append(raw_course)
            
    return raw_courses

def determine_category(sheet_name):
    lower_sheet = sheet_name.lower()
    if 'core' in lower_sheet and 'backlog' not in lower_sheet:
        return 'core'
    elif 'elective' in lower_sheet:
        return 'elective'
    elif 'project' in lower_sheet:
        return 'project'
    elif 'backlog' in lower_sheet:
        return 'backlog'
    elif 'common' in lower_sheet:
        return 'common'
    return 'elective'
