#!/usr/bin/env python3
"""Adapt the canonical revised manuscript to the latest FOSS4G package."""

from __future__ import annotations

import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ISPRS = ROOT / "paper" / "isprs-yokai-geo"
FOSS4G = ROOT / "paper" / "foss4g-yokai-geo"


def extract_braced(text: str, command: str) -> str:
    start = text.index(command) + len(command)
    depth = 1
    cursor = start
    while cursor < len(text) and depth:
        if text[cursor] == "{":
            depth += 1
        elif text[cursor] == "}":
            depth -= 1
        cursor += 1
    if depth:
        raise ValueError(f"Unbalanced braces for {command}")
    return text[start : cursor - 1]


def main() -> None:
    source = (ISPRS / "main_submission.tex").read_text(encoding="utf-8")
    abstract = extract_braced(source, r"\abstract{")
    start = source.index(r"\section{Introduction}")
    end = source.index(r"\bibliography{refs_revised}")
    body = source[start:end]
    body = re.sub(r"\\cite\{", r"\\citep{", body)

    preamble = r"""\documentclass[9pt,twocolumn,a4paper]{extarticle}

\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{mathptmx}
\usepackage{microtype}
\usepackage{geometry}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{array}
\usepackage{natbib}
\usepackage{xcolor}
\usepackage{titlesec}
\usepackage[hidelinks]{hyperref}
\usepackage{xurl}
\usepackage{caption}
\usepackage{morefloats}
\usepackage{dblfloatfix}
\usepackage{amsmath}

\geometry{a4paper,top=25mm,bottom=25mm,left=20mm,right=20mm,columnsep=6mm}
\graphicspath{{figures/}}
\hypersetup{colorlinks=false,pdfborder={0 0 0}}
\captionsetup{font={stretch=1.0},labelsep=colon,justification=justified,singlelinecheck=true}

\titleformat{\section}{\normalfont\bfseries\filcenter}{\thesection.}{0.5em}{}
\titlespacing*{\section}{0pt}{\baselineskip}{\baselineskip}
\titleformat{name=\section,numberless}{\normalfont\bfseries\filcenter}{}{0pt}{}
\titlespacing*{name=\section,numberless}{0pt}{\baselineskip}{\baselineskip}
\titleformat{\subsection}{\normalfont\bfseries\raggedright}{\thesubsection}{0.5em}{}
\titlespacing*{\subsection}{0pt}{\baselineskip}{0.3\baselineskip}
\titleformat{\subsubsection}[runin]{\normalfont\bfseries}{\thesubsubsection}{0.5em}{}
\titlespacing*{\subsubsection}{0pt}{0.6\baselineskip}{0.5em}

\linespread{1.0}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.5\baselineskip}
\setlength{\textfloatsep}{\baselineskip}
\setlength{\floatsep}{\baselineskip}
\setlength{\intextsep}{\baselineskip}
\setcounter{dbltopnumber}{4}
\renewcommand{\dbltopfraction}{0.9}
\renewcommand{\dblfloatpagefraction}{0.7}
\renewcommand{\topfraction}{0.9}
\renewcommand{\bottomfraction}{0.9}
\renewcommand{\textfraction}{0.06}
\renewcommand{\floatpagefraction}{0.7}
\setlength{\bibhang}{0pt}
\setlength{\bibsep}{0pt}
\raggedbottom

\input{generated_numbers}

\begin{document}

\twocolumn[{%
\vspace*{0.5\baselineskip}
\begin{center}
{\fontsize{12}{14}\selectfont\bfseries
From Point Anchors to Geospatial Support: A Resolution-Aware Representation of Toponymic and Non-Toponymic Place Evidence in a Japanese Yokai Archive\par}
\vspace{1em}
{\fontsize{10}{12}\selectfont
Kosuke Shimizu\textsuperscript{1}, Hiroki Ichikura\textsuperscript{1}, Riri Ikebe\textsuperscript{2}, Mirai Hoshikawa\textsuperscript{1}\par}
\vspace{0.4em}
{\fontsize{9}{11}\selectfont
\textsuperscript{1} University of Tsukuba, 1-1-1 Tennodai, Tsukuba-shi, Ibaraki 305-8577, Japan -- shimizu@ai.iit.tsukuba.ac.jp\\
\textsuperscript{2} Japan Women's University, 2-8-1 Mejirodai, Bunkyo-ku, Tokyo 112-8681, Japan}
\end{center}
\vspace{1.2em}

{\noindent\textbf{Keywords:} Folklore geography, Geospatial support, Spatial humanities, Historical geocoding, Geographic resolution\par}
\vspace{\baselineskip}

{\noindent\textbf{Abstract}\par}
\vspace{0.4\baselineskip}
\noindent
"""
    ending = r"""

\begingroup
\small
\raggedright
\bibliographystyle{plainnat}
\bibliography{refs_revised}
\endgroup

\end{document}
"""
    manuscript = preamble + abstract + "\n\\vspace{1.5em}\n}]\n\n" + body + ending
    (FOSS4G / "main_submission_revised.tex").write_text(
        manuscript, encoding="utf-8"
    )

    shutil.copy2(ISPRS / "refs_revised.bib", FOSS4G / "refs_revised.bib")
    for name in (
        "generated_numbers.tex",
        "generated_table_channels_submission.tex",
        "generated_table_resolution_submission.tex",
        "generated_table_associations_submission.tex",
        "generated_table_robustness_submission.tex",
        "REVISION_SUMMARY.md",
        "SECTION_OUTLINE.md",
        "CHANGELOG_REVISED.md",
        "TODO_AUTHOR.md",
        "CLAIMS_SCOPE.md",
    ):
        shutil.copy2(ISPRS / name, FOSS4G / name)
    shutil.copy2(
        ISPRS / "requirements-isprs-lock.txt",
        FOSS4G / "requirements-paper-lock.txt",
    )

    figures = FOSS4G / "figures"
    figures.mkdir(exist_ok=True)
    for path in (ISPRS / "figures").glob("fig[1-4]_*.pdf"):
        shutil.copy2(path, figures / path.name)
    for path in (ISPRS / "figures").glob("fig[1-4]_*.png"):
        shutil.copy2(path, figures / path.name)
    print(f"Prepared {FOSS4G / 'main_submission_revised.tex'}")


if __name__ == "__main__":
    main()

