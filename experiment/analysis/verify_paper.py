"""Verify LaTeX source structure, figure files, citations, references."""
import re, sys, os
sys.stdout.reconfigure(encoding="utf-8")

PATH = r"c:/Users/kosuk/yokai/paper/siggraph/siggraph_art_paper_draft.tex"
FIG_DIR = r"c:/Users/kosuk/yokai/paper/siggraph/figures"

with open(PATH, encoding="utf-8") as f:
    text = f.read()

dc = re.search(r"documentclass\[([^\]]+)\]", text)
print(f"Document class options: {dc.group(1) if dc else '(none)'}")
print(f"  sigconf (two-column): {'sigconf' in (dc.group(1) if dc else '')}")
has_begin = "\\begin{document}" in text
has_end = "\\end{document}" in text
print(f"Has begin/document: {has_begin}")
print(f"Has end/document: {has_end}")

from collections import Counter
begins = re.findall(r"\\begin\{([^}]+)\}", text)
ends   = re.findall(r"\\end\{([^}]+)\}", text)
b = Counter(begins); e = Counter(ends)
print("\nBegin/end balance:")
mismatches = 0
for k in sorted(set(list(b.keys()) + list(e.keys()))):
    if b[k] != e[k]:
        print(f"  MISMATCH {k}: begin={b[k]}, end={e[k]}")
        mismatches += 1
if mismatches == 0:
    print("  all balanced")

incs = re.findall(r"\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}", text)
print(f"\nIncluded figures ({len(incs)}):")
for inc in incs:
    base = inc.replace("figures/", "")
    full = os.path.join(FIG_DIR, base)
    exists = os.path.exists(full)
    size = os.path.getsize(full) if exists else 0
    print(f"  {inc}  exists={exists}  size={size}")

sections = re.findall(r"\\section\{[^}]+\}", text)
subsections = re.findall(r"\\subsection\{[^}]+\}", text)
tables = re.findall(r"\\begin\{table\}", text)
figures = re.findall(r"\\begin\{figure", text)
print(f"\nSections: {len(sections)}, Subsections: {len(subsections)}, Tables: {len(tables)}, Figure envs: {len(figures)}")
print(f"Total chars: {len(text)}, lines: {len(text.splitlines())}")

# Per-section subsection count
print("\nSubsections per section:")
from collections import defaultdict
counts = defaultdict(int)
current = None
for line in text.splitlines():
    m1 = re.match(r"\\section\{([^}]+)\}", line)
    m2 = re.match(r"\\subsection\{([^}]+)\}", line)
    if m1:
        current = m1.group(1)
    elif m2 and current:
        counts[current] += 1
for s in re.findall(r"\\section\{([^}]+)\}", text):
    print(f"  {s}: {counts.get(s, 0)} subsections")
