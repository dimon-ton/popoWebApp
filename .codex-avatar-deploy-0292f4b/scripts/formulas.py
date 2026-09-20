import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import openpyxl
import warnings
warnings.filterwarnings('ignore')

wb = openpyxl.load_workbook('ภาษาอังกฤษ   ป.1.xlsx', data_only=False)

target = sys.argv[1]
ws = wb[target]

print(f'=== Formulas in [{target}] ===')
seen_formulas = set()
for row in ws.iter_rows():
    for cell in row:
        v = cell.value
        if isinstance(v, str) and v.startswith('='):
            key = v[:60]
            if key not in seen_formulas:
                seen_formulas.add(key)
                print(f'  {cell.coordinate}: {v}')

print(f'\n=== All defined names ===')
for dn in wb.defined_names:
    print(f'  {dn}: {wb.defined_names[dn].value}')
