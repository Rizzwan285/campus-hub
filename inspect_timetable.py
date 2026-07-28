import os
import pandas as pd

directory = "raw_data/Timetable"
files = [f for f in os.listdir(directory) if f.endswith('.xlsx')]
files.sort()

def inspect_file(filename, print_data=False):
    filepath = os.path.join(directory, filename)
    print(f"\n--- {filename} ---")
    try:
        excel_file = pd.ExcelFile(filepath)
        print("Sheet Names:", excel_file.sheet_names)
        if print_data:
            for sheet in excel_file.sheet_names:
                print(f"\nSheet: {sheet}")
                df = pd.read_excel(filepath, sheet_name=sheet)
                print(df.head(5).to_string())
    except Exception as e:
        print(f"Error reading {filename}: {e}")

# Just print sheets for all files
for f in files:
    inspect_file(f, print_data=(f in ['01a_UG_CommonCourses(InstCore_SME_HSE_GCE_OE_Proj)_Jan-May-2026.xlsx', '03_UG_CSE_Jan- May-2026.xlsx', '11_PG_MTech_CaM_Jan-May-2026.xlsx']))
