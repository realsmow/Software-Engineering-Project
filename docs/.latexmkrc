# latexmk configuration — read automatically when you run `latexmk` here.
#
# This document contains Thai text, so it MUST be built with XeLaTeX
# (pdflatex cannot render Thai — fontspec aborts under pdflatex).
$pdf_mode = 5;          # 5 = xelatex (used for a plain `latexmk` run)

# Some editors (e.g. VS Code LaTeX Workshop's default recipe) invoke
# `latexmk -pdf`, and that -pdf flag overrides $pdf_mode above and forces the
# *pdflatex* rule — which then crashes on fontspec/Thai. To stay safe no matter
# how latexmk is called, we redefine the "pdflatex" command itself to run
# xelatex. So even the -pdf path ends up using XeLaTeX.
$pdflatex = 'xelatex %O %S';

$bibtex_use = 2;        # run biber/bibtex as needed
$out_dir = 'build';     # keep generated junk out of the source folder
