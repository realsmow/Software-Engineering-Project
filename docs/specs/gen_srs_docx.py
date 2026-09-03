#!/usr/bin/env python3
"""Build the ULMs SRS as a Word document plus a PDF exported from it.

    cd docs/specs
    uv run --with python-docx --python 3.12 python gen_srs_docx.py

Content lives in srs_data.py; all the formatting lives in doc_builder.py.
"""

import doc_builder
import srs_data

if __name__ == "__main__":
    doc_builder.build(srs_data)
