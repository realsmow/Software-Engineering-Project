"""แปลง SVG เป็น PNG ผ่าน librsvg โดยเรียกจาก Python ตรง ๆ

ทำไมไม่ใช้ rasterize() ใน slide_theme.py — ตัวนั้นเรียกไบนารี rsvg-convert
(แพ็กเกจ librsvg2-bin) ซึ่งไม่ได้ติดตั้งบนเครื่องนี้ แต่ตัวไลบรารี librsvg เอง
มีอยู่แล้วและเรียกผ่าน GObject Introspection ได้ จึงไม่ต้องลงอะไรเพิ่ม
ตัวเรนเดอร์เป็นตัวเดียวกัน ผลที่ได้จึงเหมือน rsvg-convert ทุกประการ

ตัวเลือกอื่นบนเครื่องนี้ใช้ไม่ได้ (ตรงกับที่ README เตือนไว้):
  · Inkscape ติดตั้งแบบ snap แล้วพังจาก glibc ไม่ตรงกัน
  · ตัวเรนเดอร์ในตัวของ ImageMagick วาด stroke-only ไม่ได้
librsvg ใช้ pango + harfbuzz จึงจัดสระและวรรณยุกต์ภาษาไทยได้ถูกต้อง

PNG เป็นของแถม — ไฟล์ที่ใช้จริงคือ SVG ตัวแปลงนี้มีไว้ตรวจงานด้วยตาเป็นหลัก
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import gi

gi.require_version("Rsvg", "2.0")
from gi.repository import Rsvg  # noqa: E402  (ต้องเรียก require_version ก่อน)


def render(svg_path: Path | str, png_path: Path | str,
           scale: float = 2.0) -> None:
    """เขียน PNG จากไฟล์ SVG ที่ความละเอียด scale เท่าของขนาดจริง"""
    src = Path(svg_path).read_text(encoding="utf-8")

    # librsvg เรนเดอร์ตามขนาดที่ประกาศใน <svg> เท่านั้น (set_dpi ไม่มีผลกับ
    # SVG ที่ระบุ width/height เป็นพิกเซล) จึงขยายด้วยการเขียนค่า width/height
    # ใหม่เฉพาะในแท็กเปิด ส่วน viewBox ปล่อยไว้ ระบบพิกัดภายในจึงไม่เปลี่ยน
    head_end = src.index(">")
    head = re.sub(r'\b(width|height)="([\d.]+)"',
                  lambda m: f'{m.group(1)}="{float(m.group(2)) * scale:.0f}"',
                  src[:head_end])

    handle = Rsvg.Handle.new_from_data((head + src[head_end:]).encode())
    handle.get_pixbuf().savev(str(png_path), "png", [], [])


if __name__ == "__main__":
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".png")
    render(src, dst, float(sys.argv[3]) if len(sys.argv) > 3 else 2.0)
