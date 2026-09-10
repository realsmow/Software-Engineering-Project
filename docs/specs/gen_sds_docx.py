#!/usr/bin/env python3
"""Build the ULMs SDS as a Word document plus a PDF exported from it.

    cd docs/specs
    uv run --with python-docx --python 3.12 python gen_sds_docx.py

Content lives in sds_data.py; all the formatting lives in doc_builder.py.
"""

import doc_builder
import sds_data

if __name__ == "__main__":
    doc_builder.build(sds_data)
