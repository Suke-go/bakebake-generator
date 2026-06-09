"""Count words in the LaTeX paper, excluding markup and bibliography."""
import re, sys
sys.stdout.reconfigure(encoding="utf-8")

PATH = r"c:/Users/kosuk/yokai/paper/siggraph/siggraph_art_paper_draft.tex"
with open(PATH, encoding="utf-8") as f:
    text = f.read()

# Extract body between \begin{document} and bibliography
body_start = text.find("\\begin{document}")
bib_start = text.find("\\begin{thebibliography}")
body = text[body_start:bib_start]

# Remove comments
body = re.sub(r"(?<!\\)%.*?$", "", body, flags=re.MULTILINE)
# Remove latex commands with argument
body = re.sub(r"\\(?:cite|label|ref|cite\w*)\{[^}]*\}", "", body)
body = re.sub(r"\\(?:section|subsection|subsubsection|paragraph)\*?\{[^}]*\}", "\n", body)
body = re.sub(r"\\(?:textit|textbf|emph|texttt)\{([^}]*)\}", r"\1", body)
# Remove begin/end env markers
body = re.sub(r"\\begin\{[^}]+\}", "", body)
body = re.sub(r"\\end\{[^}]+\}", "", body)
# Remove remaining \commands
body = re.sub(r"\\[a-zA-Z*]+(?:\{[^}]*\})?", "", body)
# Remove math
body = re.sub(r"\$[^$]*\$", "", body)
# Collapse whitespace
body = re.sub(r"\s+", " ", body).strip()

# Count by section
sections = re.split(r"^(?:\\section|\\subsection)\*?\{([^}]+)\}", text, flags=re.MULTILINE)
# Simpler: just total

words = body.split()
print(f"Total body words: {len(words)}")
print(f"(target: ~2500 for SIGGRAPH Asia Art Papers)")

# Per-section breakdown
text_no_comments = re.sub(r"(?<!\\)%.*?$", "", text, flags=re.MULTILINE)
abstract_match = re.search(r"\\begin\{abstract\}(.*?)\\end\{abstract\}", text_no_comments, re.DOTALL)
if abstract_match:
    abs_text = abstract_match.group(1)
    abs_text = re.sub(r"\\(?:cite|label|ref|cite\w*)\{[^}]*\}", "", abs_text)
    abs_text = re.sub(r"\\(?:textit|textbf|emph|texttt)\{([^}]*)\}", r"\1", abs_text)
    abs_text = re.sub(r"\\[a-zA-Z*]+", "", abs_text)
    abs_text = re.sub(r"[{}]", "", abs_text)
    abs_text = re.sub(r"\s+", " ", abs_text).strip()
    print(f"\nAbstract: {len(abs_text.split())} words")

# Each section
section_starts = [(m.start(), m.group(1)) for m in re.finditer(r"\\section\{([^}]+)\}", text_no_comments)]
section_starts.append((bib_start, "END"))
for i in range(len(section_starts) - 1):
    start, name = section_starts[i]
    end = section_starts[i+1][0]
    section_text = text_no_comments[start:end]
    section_text = re.sub(r"\\(?:cite|label|ref|cite\w*)\{[^}]*\}", "", section_text)
    section_text = re.sub(r"\\(?:textit|textbf|emph|texttt)\{([^}]*)\}", r"\1", section_text)
    section_text = re.sub(r"\\begin\{[^}]+\}", "", section_text)
    section_text = re.sub(r"\\end\{[^}]+\}", "", section_text)
    section_text = re.sub(r"\\[a-zA-Z*]+(?:\{[^}]*\})?", "", section_text)
    section_text = re.sub(r"\$[^$]*\$", "", section_text)
    section_text = re.sub(r"[{}]", "", section_text)
    section_text = re.sub(r"\s+", " ", section_text).strip()
    print(f"  Section '{name}': {len(section_text.split())} words")
