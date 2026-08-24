# Original Grade-book Reference

`ภาษาอังกฤษ-ป1.xlsx` is the original Thai grade-book workbook retained for layout,
formula, and curriculum-reference checks. It is reference data, not an application
runtime dependency.

## Optional inspection tools

Create an isolated Python environment and install the only dependency:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r reference/gradebook-template/requirements.txt
```

Run the tools from any directory:

```sh
python3 reference/gradebook-template/tools/explore_workbook.py
python3 reference/gradebook-template/tools/dump_workbook.py --sheet 0 --max-rows 10
python3 reference/gradebook-template/tools/list_formulas.py "คะแนน2"
```

Each tool uses the bundled workbook by default. Pass `--workbook PATH` where
supported, or a positional workbook path to `explore_workbook.py`, to inspect a
different file.
