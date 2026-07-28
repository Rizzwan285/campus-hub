import re

def normalize_eligibility(raw_availability):
    """
    Parses strings like "Batch: 1" or "Deg:Prog:Sem:UpperCap" into structured eligibility.
    """
    eligibility = {}
    raw = str(raw_availability).lower()
    
    if 'batch' in raw:
        # e.g., "Batch: 1" or "Batches: 1, 2"
        batches = re.findall(r'\d+', raw)
        if batches:
            eligibility['allowedBatches'] = [int(b) for b in batches]
            
    # Add logic for MTech, BTech, branches etc as needed based on actual strings
    if 'mcam' in raw:
        eligibility['allowedPrograms'] = ['MTech']
        eligibility['allowedBranches'] = ['CaM']
        
    return eligibility

def normalize_slot_expression(raw_slot):
    """
    Parses complex slot expressions into base slots and day modifiers.
    Handles line breaks, exam slot annotations, and extra whitespace.
    """
    expressions = []
    if not raw_slot or raw_slot.strip() == '-' or raw_slot.strip() == '':
        return expressions
        
    # 1. Normalize linebreaks to +
    clean_slot = str(raw_slot).replace('\n', '+')
    
    # 2. Strip Exam Slot annotations like "(Exam Slot: B)" or "(Exam: B)"
    clean_slot = re.sub(r'\(Exam\s*(?:Slot)?\s*:[^\)]+\)', '', clean_slot, flags=re.IGNORECASE)
    
    # 3. Clean up whitespace
    clean_slot = re.sub(r'\s+', '', clean_slot)
    
    if not clean_slot:
        return expressions

    # Split by + but respect parentheses. 
    # A simple way is to match base slots optionally followed by parentheses
    # Example patterns: B, M2, A(Wed+Fri), PA1
    pattern = re.compile(r'([A-Z0-9\-]+)(?:\(([^)]+)\))?')
    
    matches = pattern.findall(clean_slot)
    
    for base, mods in matches:
        # Ignore random single letters that aren't valid base slots if needed,
        # but the generator will just ignore them if they aren't in slots_db
        base_slot = base.strip()
        day_modifiers = []
        
        if mods:
            mod_list = mods.split('+')
            day_map = {'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday', 'thu': 'Thursday', 'fri': 'Friday'}
            day_modifiers = [day_map.get(m[:3].lower(), m) for m in mod_list]
            
        expressions.append({
            'rawExpression': f"{base}({mods})" if mods else base,
            'baseSlot': base_slot,
            'dayModifiers': day_modifiers
        })
        
    return expressions

def generate_meetings(normalized_slots, slot_definitions):
    """
    Cross references normalized slots with actual slot definitions to create TimetableMeetings.
    """
    meetings = []
    
    for expr in normalized_slots:
        base_code = expr['baseSlot']
        if base_code in slot_definitions:
            slot_def = slot_definitions[base_code]
            
            for timing in slot_def['timings']:
                # If expression has day modifiers, only include those days
                if expr['dayModifiers'] and timing['day'] not in expr['dayModifiers']:
                    continue
                    
                meetings.append({
                    'type': slot_def['type'],
                    'day': timing['day'],
                    'startTime': timing['startTime'],
                    'endTime': timing['endTime'],
                    'room': '', # To be filled from course
                    'instructors': [], # To be filled from course
                    'recurrence': {'type': 'weekly'} # To be enhanced based on remarks
                })
                
    return meetings
