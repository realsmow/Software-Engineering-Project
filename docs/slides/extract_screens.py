#!/usr/bin/env python3
"""แตกภาพหน้าจอ 18 จอ และผังการไหล ออกจาก flow board มาเก็บเป็นไฟล์แยก

รันจาก docs/slides/ :  python3 extract_screens.py
ต้นทาง:  ../resource/ULMS_FlowBoard_standalone.html  (2.5 MB, ภาพฝังเป็น base64)
ผลลัพธ์: screens/<id>.jpg  +  screens/flow.json  (ROWS + EDGES ที่บอร์ดใช้จริง)

แยกออกมาเพราะตัวสร้างสไลด์ต้องอ่านภาพซ้ำหลายรอบ การ decode base64 จากไฟล์
2.5 MB ทุกครั้งช้าโดยไม่จำเป็น และการมีภาพเป็นไฟล์ทำให้ตรวจ/ครอปด้วยตาได้ง่าย
"""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path

BOARD = Path(__file__).parent.parent / "resource" / "ULMS_FlowBoard_standalone.html"
OUT = Path(__file__).parent / "screens"


def main() -> int:
    OUT.mkdir(exist_ok=True)
    html = BOARD.read_text(encoding="utf-8")

    # ROWS = การจัดกลุ่มหน้าจอตามบทบาท · EDGES = เส้นการไหลพร้อมป้ายภาษาไทย
    # ทั้งคู่เป็น JSON ตรง ๆ ในสคริปต์ของบอร์ด จึงดึงมาใช้ต่อได้เลย ไม่ต้องพิมพ์ใหม่
    rows = json.loads(re.search(r"const ROWS = (\[.*?\]);", html, re.S).group(1))
    edges = json.loads(re.search(r"const EDGES = (\[.*?\]);", html, re.S).group(1))

    screens = {}
    pattern = (r'data-id="([^"]+)".*?<div class="fb-name">([^<]*)<'
               r'.*?base64,([A-Za-z0-9+/=]+)"\s+width="(\d+)"\s+height="(\d+)"')
    for m in re.finditer(pattern, html, re.S):
        sid, name, b64, w, h = m.groups()
        (OUT / f"{sid}.jpg").write_bytes(base64.b64decode(b64))
        screens[sid] = {"name": name, "w": int(w), "h": int(h)}

    (OUT / "flow.json").write_text(
        json.dumps({"rows": rows, "edges": edges, "screens": screens},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"แตกภาพ {len(screens)} จอ · {len(rows)} แถว · {len(edges)} เส้นเชื่อม "
          f"-> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
