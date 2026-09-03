"""ธีมและเครื่องมือที่สไลด์ทุกชุดใช้ร่วมกัน

พาเลตต์ตามเด็คนำเสนอ resource/ULMs_Software_Project_Presentation_V.pdf
(teal #16726D เป็นสีหลัก · ส้ม #FD914D เป็นสีเน้น · พื้นอ่อน #F2F7F7)

หมายเหตุเรื่องสี: ภาพ mockup ของหน้าจอใช้ "เขียว KU" ซึ่งคนละสีกับ teal ของเด็ค
ตั้งใจปล่อยไว้ตามนั้น เพราะภาพคือ UI จริงที่ทีมทำ ไม่ควรแก้สีให้เพี้ยนจากของจริง
กรอบ หัวสไลด์ และลูกศรที่เราวาดเองต่างหากที่เป็น teal เพื่อผูกกับเด็ค
"""

from __future__ import annotations

import html
import os
import shutil
import subprocess
from pathlib import Path

# ---------------------------------------------------------------- ฟอนต์และสี
MONO = "DejaVu Sans Mono, Consolas, monospace"
THAI = "Laksaman, Noto Sans Thai, sans-serif"
MONO_CH = 0.602       # อัตราส่วนความกว้างตัวอักษรของฟอนต์ mono (ใช้ประมาณตำแหน่ง)
THAI_CH = 0.50        # อัตราส่วนโดยประมาณของ Laksaman — ใช้ตัดบรรทัดแบบคร่าว ๆ

BRAND = "#16726D"     # teal หลักของเด็ค
INK = "#13211F"       # สีตัวอักษรหลัก — ดำอมเขียว
MUTED = "#7E8F8D"     # สีตัวอักษรรอง
LINE = "#DCE7E5"      # สีเส้นคั่น
PANEL = "#FFFFFF"     # พื้นหลังแผ่นงาน
ROW_ALT = "#F2F7F7"   # พื้นอ่อนของเด็ค
ACCENT = "#AD4E0C"    # ส้มของเด็คที่เข้มพอให้ตัวอักษรขาวได้ 5.4:1

MARGIN = 44           # ขอบกระดาษ
TITLE_H = 96          # แถบหัวเรื่องด้านบน
SCALE = 2.5           # ตัวคูณความละเอียดตอน export PNG (สไลด์ภาพหน้าจอใช้ 2.0)


def esc(s: str) -> str:
    return html.escape(s, quote=False)


def text_w(s: str, size: float) -> float:
    """ประมาณความกว้างข้อความฟอนต์ mono — ใช้จัดตำแหน่งไม่ให้ทับกัน"""
    return len(s) * size * MONO_CH


def thai_w(s: str, size: float) -> float:
    """ประมาณความกว้างข้อความไทย — หยาบกว่า text_w เพราะฟอนต์ไม่ใช่ความกว้างคงที่"""
    return len(s) * size * THAI_CH


def wrap_thai(s: str, size: float, max_w: float) -> list[str]:
    """ตัดบรรทัดข้อความไทยตามความกว้างที่กำหนด โดยตัดที่ช่องว่างเท่านั้น

    ภาษาไทยไม่มีช่องว่างระหว่างคำ จึงตัดได้แค่ตรงที่ผู้เขียนเว้นวรรคไว้เอง
    เวลาเขียนคำบรรยายจึงควรเว้นวรรคตามวลีให้ตัดบรรทัดสวย
    """
    words, lines, cur = s.split(" "), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if cur and thai_w(trial, size) > max_w:
            lines.append(cur)
            cur = w
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def tint(hex_color: str, amount: float) -> str:
    """ผสมสีกับขาว — ใช้ทำพื้นอ่อนที่ยังเป็นสีเดียวกับต้นทาง"""
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    mix = lambda c: round(c + (255 - c) * amount)
    return f"#{mix(r):02X}{mix(g):02X}{mix(b):02X}"


def slide_header(width: float, th: str, en: str, notes: tuple[str, str] = ()) -> list[str]:
    """แถบหัวสไลด์มาตรฐาน: ขีดสีเน้น + ชื่อไทย + บรรทัดอังกฤษตัวพิมพ์ใหญ่"""
    o = [f'<rect x="{MARGIN}" y="30" width="5" height="40" rx="2.5" fill="{BRAND}"/>',
         f'<text x="{MARGIN+18}" y="48" font-family="{THAI}" font-size="21" '
         f'font-weight="700" fill="{INK}">{esc(th)}</text>',
         f'<text x="{MARGIN+18}" y="66" font-family="{MONO}" font-size="11.5" '
         f'fill="{BRAND}" letter-spacing="0.6">{esc(en.upper())}</text>']
    for i, note in enumerate(notes):
        o.append(f'<text x="{width-MARGIN}" y="{48+i*18}" font-family="{THAI}" '
                 f'font-size="{12.5 if i == 0 else 11}" fill="{MUTED}" '
                 f'text-anchor="end">{esc(note)}</text>')
    return o


# --------------------------------------------------------------- SVG -> PNG
# ต้องใช้ rsvg-convert (แพ็กเกจ librsvg2-bin) เท่านั้น — ตัวอื่นบนเครื่องนี้ใช้ไม่ได้
#   · Inkscape ติดตั้งแบบ snap แล้วพังจาก glibc ไม่ตรงกัน
#   · gdk-pixbuf ของ Ubuntu 26.04 โหลด SVG ผ่านโพรเซสแยกที่ล้มเมื่อไม่มี session bus
#   · ตัวเรนเดอร์ในตัวของ ImageMagick วาด <path> แบบมีแต่ stroke ไม่ได้
#     จึงไม่ใช้เป็นทางสำรอง เพราะจะได้ภาพผิดแบบเงียบ ๆ
# librsvg ใช้ pango + harfbuzz จึงจัดสระ/วรรณยุกต์ภาษาไทยได้ถูกต้อง
def find_rsvg() -> str:
    exe = os.environ.get("RSVG_CONVERT") or shutil.which("rsvg-convert")
    if not exe:
        raise SystemExit(
            "ไม่พบ rsvg-convert — ไฟล์ SVG ถูกสร้างแล้ว แต่แปลงเป็น PNG ไม่ได้\n"
            "  ติดตั้งด้วย:  sudo apt install librsvg2-bin\n"
            "  หรือชี้ไปที่ไบนารีเองด้วย:  RSVG_CONVERT=/path/to/rsvg-convert "
            "python3 <script>.py")
    return exe


def rasterize(exe: str, svg_path: Path, png_path: Path,
              scale: float = SCALE) -> None:
    subprocess.run([exe, "-z", str(scale), "-o", str(png_path), str(svg_path)],
                   check=True, capture_output=True)
