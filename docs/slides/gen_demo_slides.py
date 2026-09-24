"""สร้างสไลด์สาธิตระบบจากผลทดสอบจริงในไฟล์ข้อมูลของแต่ละรอบ

    cd docs/slides && python3 gen_demo_slides.py                       # รอบ 11 ก.ย. demo_data.py
    cd docs/slides && python3 gen_demo_slides.py --data demo_data_02   # รอบ 17 ก.ย.
    cd docs/slides && python3 gen_demo_slides.py --svg                 # SVG อย่างเดียว

ไฟล์ข้อมูลบอกโฟลเดอร์ของตัวเองด้วย SCREENS_DIR กับ OUT_DIR ไฟล์รอบเก่าที่ไม่มีสองค่านี้
ใช้ demo-screens/ กับ demo-slides/ เหมือนเดิม จึงสร้างซ้ำได้โดยไม่ทับกัน

สไลด์ 1920x1080 ฉายได้ทันที ต่างจากชุด ui-slides/ ที่ขนาดไม่คงที่เพราะทำไว้วางใน Canva
ภาพหน้าจอฝังเป็น base64 JPEG ไฟล์ SVG แต่ละไฟล์จึงจบในตัว

สามแบบของสไลด์กรณีทดสอบ
  zoom   ภาพเดียวแสดงขนาดจริง 1:1 ตัวหนังสือบนจอคมเท่าต้นฉบับ คำอธิบายอยู่คอลัมน์ขวา
  stack  สองภาพเตี้ยซ้อนกันแนวตั้งขนาดใกล้ 1:1 คำอธิบายอยู่คอลัมน์ขวา ใช้กับภาพกว้างแต่เตี้ย
  pair   สองภาพย่อ 0.74 เรียงซ้ายขวา คำอธิบายเป็นแถบสามคอลัมน์ด้านล่าง ใช้กับภาพสูง
"""

from __future__ import annotations

import base64
import importlib
import re
import sys
from pathlib import Path

from PIL import Image


def _data_module() -> str:
    """ชื่อไฟล์ข้อมูลของรอบที่จะสร้าง ค่าเริ่มต้นคือรอบแรก"""
    if "--data" in sys.argv:
        return sys.argv[sys.argv.index("--data") + 1]
    return "demo_data"


D = importlib.import_module(_data_module())
from slide_theme import ACCENT, BRAND, INK, LINE, MONO, MUTED, PANEL, ROW_ALT, esc, tint
from svg_to_png import render
import text_metrics

# Sarabun rather than the theme's Laksaman: the deck is edited in Canva, which has
# Sarabun but not Laksaman. Same metrics within 2%, so layouts barely move.
THAI = "Sarabun, Laksaman, Noto Sans Thai, sans-serif"


def thai_w(s: str, size: float, bold: bool = False) -> float:
    """Real advance width in Sarabun, not the theme's character-count estimate."""
    return text_metrics.width(s, size, "sarabun", "bold" if bold else "regular")


def wrap_thai(s: str, size: float, max_w: float) -> list[str]:
    # 3% slack: Canva shapes Thai slightly differently and re-wraps a line that
    # comes out a pixel too wide for its box.
    return text_metrics.wrap(s, size, max_w * 0.97, family="sarabun")

HERE = Path(__file__).parent
SCREENS = HERE / getattr(D, "SCREENS_DIR", "demo-screens")
OUT = HERE / getattr(D, "OUT_DIR", "demo-slides")

W, H = 1920, 1080
M = 44                  # ขอบกระดาษ
TOP = 140               # เนื้อหาเริ่มใต้แถบหัวเรื่อง
SRC_X, SRC_W = 240, 1200  # ครอปแถบเมนูซ้ายของภาพหน้าจอ 1440 px ทิ้ง

STATUS = {              # ป้ายผล และสีพื้นของป้าย (ตัวอักษรขาว คอนทราสต์ >= 4.5:1)
    D.PASS: ("ผ่าน", "#1F7A4D"),
    D.PARTIAL: ("ผ่านบางส่วน", ACCENT),
    D.FAIL: ("ไม่ผ่าน", "#B42318"),
    D.MOCK: ("ต้นแบบ UI", "#5B6B69"),
}
SEVERITY = {"สูง": "#B42318", "กลาง": ACCENT, "ต่ำ": "#5B6B69"}
SHOT_BORDER = "#C9D6D4"
SHOT_MAX_W = 1000        # widest a screenshot may get, so the text column keeps ~780 px


# ------------------------------------------------------------------ ชิ้นส่วนพื้นฐาน
def text(x, y, s, size=24, color=INK, weight=400, font=THAI, anchor="start", extra=""):
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{font}" font-size="{size}" '
            f'font-weight="{weight}" fill="{color}" text-anchor="{anchor}" {extra}>'
            f'{esc(s)}</text>')


def badge(x, y, status, size=24, anchor="start"):
    """ป้ายผลทดสอบแบบแคปซูล คืน (svg, ความกว้าง)"""
    label, color = STATUS[status]
    w = thai_w(label, size, True) + 40
    x0 = x - w if anchor == "end" else x
    return ([f'<rect x="{x0:.1f}" y="{y}" width="{w:.1f}" height="{size + 20}" '
             f'rx="{(size + 20) / 2}" fill="{color}"/>',
             text(x0 + w / 2, y + size + 4, label, size, "#FFFFFF", 700, anchor="middle")], w)


def header(title, en, right_lines=()):
    """แถบหัวสไลด์ ขีดสีเน้น ชื่อไทย และบรรทัดอังกฤษ ขยายจาก slide_header ให้อ่านได้บนจอฉาย"""
    o = [f'<rect x="{M}" y="32" width="8" height="74" rx="4" fill="{BRAND}"/>',
         text(M + 26, 72, title, 44, INK, 700),
         text(M + 26, 102, en.upper(), 18, BRAND, 400, MONO, extra='letter-spacing="1"')]
    for i, s in enumerate(right_lines):
        o.append(text(W - M, 66 + i * 32, s, 20 if i else 23, MUTED, anchor="end"))
    return o


_cache: dict[str, tuple[str, int, int]] = {}


def load(key):
    """คืน (data uri, กว้าง, สูง) ของภาพหน้าจอ"""
    if key not in _cache:
        path = SCREENS / f"{key}.jpg"
        with Image.open(path) as im:
            w, h = im.size
        uri = "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode()
        _cache[key] = (uri, w, h)
    return _cache[key]


def crop_of(key):
    """SHOTS เก็บ (y, สูง) หรือ (y, สูง, x, กว้าง) ค่าเริ่มต้นตัดแถบเมนูซ้ายทิ้ง"""
    c = D.SHOTS[key]
    return c if len(c) == 4 else (*c, SRC_X, SRC_W)


def screenshot(key, x, y, scale):
    """วางภาพหน้าจอที่ครอปตาม SHOTS ด้วย <svg> ซ้อน viewBox ทำหน้าที่ตัดขอบ คืน (svg, กว้าง, สูง)"""
    uri, sw, sh = load(key)
    y0, ch, x0, cw = crop_of(key)
    ch = min(ch, sh - y0)
    dw, dh = cw * scale, ch * scale
    return ([f'<svg x="{x:.1f}" y="{y:.1f}" width="{dw:.1f}" height="{dh:.1f}" '
             f'viewBox="{x0} {y0} {cw} {ch}" preserveAspectRatio="none">'
             f'<image x="0" y="0" width="{sw}" height="{sh}" href="{uri}"/></svg>',
             f'<rect x="{x:.1f}" y="{y:.1f}" width="{dw:.1f}" height="{dh:.1f}" rx="4" '
             f'fill="none" stroke="{SHOT_BORDER}" stroke-width="1.5"/>'], dw, dh)


def shot_label(x, y, n, s):
    return [f'<circle cx="{x + 16}" cy="{y - 8}" r="16" fill="{ACCENT}"/>',
            text(x + 16, y - 1, str(n), 19, "#FFFFFF", 700, MONO, "middle"),
            text(x + 42, y, s, 23, INK, 600)]


def section(x, y, width, heading, items, size=24, bullet=BRAND, numbered=False):
    """หัวข้อย่อยพร้อมรายการที่ตัดบรรทัดแล้ว คืน (svg, y ถัดไป)"""
    lh = size * 1.4
    o = [text(x, y, heading, size + 2, BRAND, 700)]
    y += 12
    for i, item in enumerate(items, 1):
        lines = wrap_thai(item, size, width - 34)
        y += lh
        if numbered:
            o.append(text(x + 8, y, f"{i}", size - 3, bullet, 700, MONO, "middle"))
        else:
            o.append(f'<circle cx="{x + 8}" cy="{y - size * 0.33:.1f}" r="5" fill="{bullet}"/>')
        for j, line in enumerate(lines):
            o.append(text(x + 30, y + j * lh, line, size))
        y += (len(lines) - 1) * lh
    return o, y + 40


def table(x, y, width, head, rows, col_w, size=22, row_h=48):
    """ตารางเล็กสำหรับตัวเลขหลักฐาน คอลัมน์แรกชิดซ้าย ที่เหลือจัดกลาง"""
    o = [f'<rect x="{x}" y="{y}" width="{width}" height="{row_h}" fill="{tint(BRAND, 0.86)}"/>']
    cx = [x + sum(col_w[:i]) for i in range(len(col_w))]
    for i, h in enumerate(head):
        o.append(text(cx[i] + (12 if i == 0 else col_w[i] / 2), y + row_h * 0.64, h,
                      size - 2, BRAND, 700, anchor="start" if i == 0 else "middle"))
    for r, row in enumerate(rows):
        ry = y + row_h * (r + 1)
        if r % 2:
            o.append(f'<rect x="{x}" y="{ry}" width="{width}" height="{row_h}" fill="{ROW_ALT}"/>')
        for i, cell in enumerate(row):
            font = MONO if i == 0 and cell.isascii() else THAI
            o.append(text(cx[i] + (12 if i == 0 else col_w[i] / 2), ry + row_h * 0.64, cell,
                          size, INK, 600 if i else 400, font,
                          "start" if i == 0 else "middle"))
    end = y + row_h * (len(rows) + 1)
    o.append(f'<rect x="{x}" y="{y}" width="{width}" height="{end - y}" fill="none" '
             f'stroke="{LINE}" stroke-width="1.5"/>')
    return o, end + 26


def frame(body):
    return "\n".join([f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
                      f'viewBox="0 0 {W} {H}">',
                      f'<rect x="0" y="0" width="{W}" height="{H}" fill="{PANEL}"/>',
                      *body, "</svg>"])


def footer(page):
    return [f'<line x1="{M}" y1="{H - 34}" x2="{W - M}" y2="{H - 34}" stroke="{LINE}"/>',
            text(M, H - 8, f"ULMs สาธิตระบบ  origin/main {D.COMMIT}  {D.TEST_DATE}",
                 17, MUTED),
            text(W - M, H - 8, str(page), 17, MUTED, 700, MONO, "end")]


def tally():
    counts = {s: 0 for s in STATUS}
    for c in D.CASES:
        counts[c["status"]] += 1
    return counts


# ------------------------------------------------------------------ สไลด์แต่ละแบบ
def slide_cover(page):
    dy = 60
    o = [f'<rect x="0" y="0" width="14" height="{H}" fill="{BRAND}"/>',
         text(110, 240, "SYSTEM DEMO", 26, BRAND, 700, MONO, extra='letter-spacing="3"'),
         text(110, 326, "สาธิตการทำงานระบบ ULMs", 76, INK, 700),
         text(110, 390, "ระบบบริหารจัดการการยืมคืนอุปกรณ์ มหาวิทยาลัยเกษตรศาสตร์", 30, MUTED),
         text(110, 476, "ทดสอบการใช้งานจริงครบ 4 บทบาท บนเครื่อง local", 30, INK),
         text(110, 522, f"origin/main {D.COMMIT}   {D.TEST_DATE}", 24, INK, 400, MONO),
         text(110, 564, "NestJS tRPC :3000   Vite React :5173   PostgreSQL :5432", 21, MUTED,
              400, MONO)]
    # ผลรวมทุกกรณีทดสอบ
    x = 110
    for status, n in tally().items():
        if not n:
            continue
        b, w = badge(x, 636, status, 26)
        o += b
        o.append(text(x + w + 16, 672, f"{n}", 40, INK, 700, MONO))
        x += w + 100
    o.append(text(110, 750, f"{len(D.CASES)} กรณีทดสอบ   ข้อบกพร่องที่พบ {len(D.FINDINGS)} รายการ",
                  26, MUTED))
    # บัญชีทดสอบ
    tx, ty = 1060, 250
    o.append(text(tx, ty - 26, "บัญชีทดสอบ", 26, INK, 700))
    t, _ = table(tx, ty, 780, ["บทบาท", "อีเมล KU", "บัญชีภายใน"],
                 [[r, e, u] for r, e, u, _ in D.ACCOUNTS], [220, 290, 270], 22, 58)
    o += t
    o.append(text(tx, ty + 58 * 5 + 44, "รหัสผ่าน ชื่อบทบาทตามด้วย 1234 เช่น borrower1234", 22, MUTED))
    # เลื่อนเนื้อหาทั้งก้อนลงให้กึ่งกลางแนวตั้ง แถบสีซ้ายอยู่กับที่
    o = [o[0], f'<g transform="translate(0,{dy})">', *o[1:], "</g>"]
    return frame(o + footer(page))


def slide_summary(page):
    o = header("สรุปผลการทดสอบ", "Test summary", (f"{len(D.CASES)} กรณีทดสอบ",))
    x, y = M, TOP + 10
    # ความสูงแถวหดลงเมื่อรอบนั้นมีกรณีทดสอบเยอะ ตารางจึงจบในหน้าเดียวเสมอ
    rh = min(56, (H - TOP - 70) / (len(D.CASES) + 1))
    cols = [140, 650, 330, 230]          # TC หัวข้อ บทบาท ผล
    base = rh * 0.68                     # baseline inside a row, scales with the row
    o.append(f'<rect x="{x}" y="{y}" width="{sum(cols)}" height="{rh}" fill="{tint(BRAND, 0.86)}"/>')
    for i, h in enumerate(["TC", "หัวข้อ", "บทบาท", "ผล"]):
        o.append(text(x + sum(cols[:i]) + 16, y + base, h, 20, BRAND, 700))
    for r, c in enumerate(D.CASES):
        ry = y + rh * (r + 1)
        if r % 2:
            o.append(f'<rect x="{x}" y="{ry}" width="{sum(cols)}" height="{rh}" fill="{ROW_ALT}"/>')
        o.append(text(x + 16, ry + base, c["id"], 20, INK, 700, MONO))
        o.append(text(x + cols[0] + 16, ry + base, c["th"], 23))
        o.append(text(x + sum(cols[:2]) + 16, ry + base, c["role"], 20, MUTED))
        b, _ = badge(x + sum(cols[:3]) + 16, ry + (rh - 37) / 2, c["status"], 17)
        o += b
    # คอลัมน์ขวา นับผล
    rx = x + sum(cols) + 70
    o.append(text(rx, TOP + 46, "ผลรวม", 26, INK, 700))
    yy = TOP + 80
    for status, n in tally().items():
        if not n:
            continue
        b, _ = badge(rx, yy, status, 24)
        o += b
        o.append(text(W - M, yy + 36, str(n), 48, INK, 700, MONO, "end"))
        yy += 84
    notes = list(getattr(D, "SUMMARY_NOTES", (
        "ที่ไม่ผ่าน คือปุ่มฝั่งผู้ยืม ที่ยังไม่ต่อ backend",
        "backend ถูกต้อง ครบทุกขั้นของการยืม",
        "ต้นแบบ UI ไม่นับรวม")))
    s, _ = section(rx, yy + 30, W - M - rx, "ข้อสังเกต", notes, 22, ACCENT)
    o += s
    return frame(o + footer(page))


FLOW = [  # (ขั้น, บทบาท, TC, หน้าเว็บ, backend)  True ใช้ได้  None บางส่วน  False ยังไม่ได้
    ("ส่งคำขอ", "ผู้ยืม", "TC-03 04", False, True),
    ("อนุมัติ", "อาจารย์", "TC-05", None, True),
    ("จัดเตรียม", "เจ้าหน้าที่", "TC-06", True, True),
    ("ส่งมอบ รับของ", "เจ้าหน้าที่ ผู้ยืม", "TC-06 07", None, True),
    ("รับคืน", "เจ้าหน้าที่", "TC-08", True, True),
    ("ตรวจสภาพ", "เจ้าหน้าที่", "TC-08 09", None, True),
    ("หักเครดิต", "ระบบ", "TC-10", True, True),
]
SIDE = [
    ("ยกเลิกคำขอ", "ผู้ยืม", "TC-11", False, True),
    ("ระงับสิทธิ์", "เจ้าหน้าที่", "TC-12", True, None),
    ("รายงาน", "เจ้าหน้าที่ ผู้ดูแล", "TC-13", True, True),
    ("จองห้อง T3", "ผู้ยืม", "TC-15", None, False),
]
MARK = {True: ("ใช้ได้", "#1F7A4D"), None: ("บางส่วน", ACCENT), False: ("ยังไม่ได้", "#B42318")}

# รอบหลัง ๆ เขียนวงจรของตัวเองไว้ในไฟล์ข้อมูล รอบแรกไม่มีจึงใช้ค่าข้างบน
FLOW = getattr(D, "FLOW", FLOW)
SIDE = getattr(D, "SIDE", SIDE)
FLOW_NOTES = getattr(D, "FLOW_NOTES", (
    "ทุกขั้นทดสอบผ่านหน้าเว็บของบทบาทนั้นจริง ยกเว้นส่งคำขอ ซึ่งใช้ loan.create แทนปุ่มที่ยังไม่ต่อ",
    "จุดที่ขาดเกือบทั้งหมดอยู่ที่หน้าเว็บ",
    "backend ขาดเพียง API ห้อง และการคืนสิทธิ์ที่ยกเลิกบทลงโทษเกินขอบเขต"))


def flow_box(x, y, w, h, step):
    name, role, tc, fe, be = step
    worst = "#B42318" if False in (fe, be) else ACCENT if None in (fe, be) else "#1F7A4D"
    o = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{PANEL}" '
         f'stroke="{LINE}" stroke-width="2"/>',
         f'<rect x="{x}" y="{y}" width="{w}" height="8" rx="4" fill="{worst}"/>',
         text(x + w / 2, y + 58, name, 30, INK, 700, anchor="middle"),
         text(x + w / 2, y + 92, role, 21, MUTED, anchor="middle"),
         text(x + w / 2, y + 124, tc, 19, BRAND, 700, MONO, "middle")]
    for i, (layer, ok) in enumerate((("หน้าเว็บ", fe), ("backend", be))):
        ly = y + 150 + i * 46
        label, color = MARK[ok]
        o.append(text(x + 14, ly + 25, layer, 20, INK))
        o.append(f'<rect x="{x + w - 14 - 104}" y="{ly}" width="104" height="36" rx="18" '
                 f'fill="{tint(color, 0.85)}"/>')
        o.append(text(x + w - 14 - 52, ly + 25, label, 18, color, 700, anchor="middle"))
    return o


def slide_flow(page):
    o = header("เส้นทางการยืมที่ทดสอบ", "Borrowing flow tested end to end",
               ("แยกผลตามชั้นหน้าเว็บและ backend",))
    n, gap = len(FLOW), 30
    bw = (W - 2 * M - gap * (n - 1)) / n
    y, bh = TOP + 50, 250
    for i, step in enumerate(FLOW):
        x = M + i * (bw + gap)
        o += flow_box(x, y, bw, bh, step)
        if i < n - 1:
            ax = x + bw + 4
            o.append(f'<path d="M{ax:.1f} {y + bh / 2} l{gap - 8} 0 m-9 -8 l9 8 l-9 8" '
                     f'fill="none" stroke="{BRAND}" stroke-width="3"/>')
    o.append(text(M, y + bh + 80, "งานข้างเคียง", 28, INK, 700))
    sy = y + bh + 110
    for i, step in enumerate(SIDE):
        o += flow_box(M + i * (bw + gap), sy, bw, bh, step)
    # notes take whatever columns the side row leaves free (4 boxes last round, 5 now)
    nx = M + len(SIDE) * (bw + gap) + 10
    s, _ = section(nx, sy + 10, W - M - nx, "สรุป", list(FLOW_NOTES), 22, ACCENT)
    o += s
    return frame(o + footer(page))


def case_header(c):
    label, _ = STATUS[c["status"]]
    o = header(f'{c["id"]}  {c["th"]}', c["en"])
    b, _ = badge(W - M, 30, c["status"], 26, "end")
    o += b
    o.append(text(W - M, 114, f'บทบาท {c["role"]}', 21, MUTED, anchor="end"))
    return o


def right_column(c, cx, cw):
    """คอลัมน์คำอธิบายด้านขวาของสไลด์ zoom และ stack"""
    o, y = [], TOP + 22
    s, y = section(cx, y, cw, "ขั้นตอน", c["steps"], 24, BRAND, numbered=True)
    o += s
    s, y = section(cx, y, cw, "ผลที่ได้", c["result"], 24)
    o += s
    if "table" in c:
        t = c["table"]
        first = 220 if len(t["head"]) > 3 else 250
        rest = (cw - first) / (len(t["head"]) - 1)
        s, y = table(cx, y, cw, t["head"], t["rows"], [first] + [rest] * (len(t["head"]) - 1),
                     20 if len(t["head"]) > 3 else 22, 46)
        o += s
    if c.get("notes"):
        s, y = section(cx, y, cw, "ข้อสังเกต", c["notes"], 24, ACCENT)
        o += s
    if y > H - 40:
        print(f"  คำเตือน {c['id']} ข้อความยาวเกินสไลด์ ({y:.0f} px)")
    return o


def slide_zoom(c, page):
    o = case_header(c)
    key, label = c["shots"][0]
    _, ch, _, cw0 = crop_of(key)
    scale = min(1.0, (H - TOP - 30 - 70) / ch, SHOT_MAX_W / cw0)
    o += shot_label(M, TOP + 22, 1, label)
    img, dw, _ = screenshot(key, M, TOP + 42, scale)
    o += img
    cx = M + dw + 48
    o += right_column(c, cx, W - M - cx)
    return frame(o + footer(page))


def slide_stack(c, page):
    """สองภาพเตี้ยและกว้างซ้อนกันแนวตั้งด้านซ้าย ขนาดใกล้ 1:1 ให้อ่านตัวหนังสือในภาพได้"""
    o = case_header(c)
    crops = [crop_of(k) for k, _ in c["shots"]]
    label_h, gap = 44, 24
    avail = H - TOP - 50 - len(crops) * label_h - gap * (len(crops) - 1)
    scale = min(1.0, avail / sum(cr[1] for cr in crops), min(SHOT_MAX_W / cr[3] for cr in crops))
    y = TOP + 22
    dw = 0
    for i, ((key, label), cr) in enumerate(zip(c["shots"], crops)):
        o += shot_label(M, y, i + 1, label)
        img, dw, dh = screenshot(key, M, y + 20, scale)
        o += img
        y += 20 + dh + gap + label_h - 20
    cx = M + dw + 48
    o += right_column(c, cx, W - M - cx)
    return frame(o + footer(page))


def slide_pair(c, page):
    o = case_header(c)
    colw, gap = (W - 2 * M - 56) / 2, 56
    parts = [("ขั้นตอน", c["steps"], BRAND, True), ("ผลที่ได้", c["result"], BRAND, False)]
    if c.get("notes"):
        parts.append(("ข้อสังเกต", c["notes"], ACCENT, False))
    cw = (W - 2 * M - 40 * (len(parts) - 1)) / len(parts)
    # Lay the text strip out once at y=0 to learn its height, then give the
    # screenshots everything above it instead of a fixed guess.
    strip_h = max(section(0, 0, cw, h, items, 22, col, num)[1]
                  for h, items, col, num in parts) - 40
    max_h = H - 80 - strip_h - (TOP + 42) - 74    # section() pads 40 below its last line
    tallest = 0
    for i, (key, label) in enumerate(c["shots"]):
        x = M + i * (colw + gap)
        _, ch, _, cw0 = crop_of(key)
        scale = min(1.0, colw / cw0, max_h / ch)
        o += shot_label(x, TOP + 22, i + 1, label)
        img, _, dh = screenshot(key, x, TOP + 42, scale)
        o += img
        tallest = max(tallest, dh)
    by = TOP + 42 + tallest + 74
    o.append(f'<line x1="{M}" y1="{by - 30}" x2="{W - M}" y2="{by - 30}" stroke="{LINE}" '
             f'stroke-width="1.5"/>')
    for i, (head, items, color, num) in enumerate(parts):
        s, y = section(M + i * (cw + 40), by, cw, head, items, 22, color, num)
        o += s
        if y > H - 40:
            print(f"  คำเตือน {c['id']} คอลัมน์ {head} ยาวเกินสไลด์ ({y:.0f} px)")
    return frame(o + footer(page))


def slide_findings(page, rows, part, parts):
    o = header("ข้อบกพร่องที่พบ", f"Findings {part}/{parts}",
               (f"ทั้งหมด {len(D.FINDINGS)} รายการ เรียงตามความรุนแรง",))
    x, y, rh = M, TOP + 10, 100
    cols = [140, 880, 480, 180, 152]
    heads = ["ระดับ", "ปัญหา", "ตำแหน่ง", "ฝ่าย", "TC"]
    o.append(f'<rect x="{x}" y="{y}" width="{sum(cols)}" height="58" fill="{tint(BRAND, 0.86)}"/>')
    for i, h in enumerate(heads):
        o.append(text(x + sum(cols[:i]) + 16, y + 39, h, 22, BRAND, 700))
    y += 58
    for r, (sev, issue, where, owner, tc) in enumerate(rows):
        ry = y + rh * r
        if r % 2:
            o.append(f'<rect x="{x}" y="{ry}" width="{sum(cols)}" height="{rh}" fill="{ROW_ALT}"/>')
        color = SEVERITY[sev]
        o.append(f'<rect x="{x + 16}" y="{ry + 29}" width="92" height="42" rx="21" fill="{color}"/>')
        o.append(text(x + 62, ry + 58, sev, 22, "#FFFFFF", 700, anchor="middle"))
        lines = wrap_thai(issue, 25, cols[1] - 30)
        for j, line in enumerate(lines[:2]):
            o.append(text(x + cols[0] + 16, ry + (60 if len(lines) == 1 else 44 + j * 34), line, 25))
        o.append(text(x + sum(cols[:2]) + 16, ry + 58, where, 19, INK, 400, MONO))
        o.append(text(x + sum(cols[:3]) + 16, ry + 58, owner, 21, INK, 700, MONO))
        o.append(text(x + sum(cols[:4]) + 16, ry + 58, tc, 20, MUTED, 400, MONO))
    return frame(o + footer(page))


FIX_MARK = {True: ("แก้แล้ว", "#1F7A4D"), False: ("ยังไม่แก้", "#B42318")}


def slide_prev_findings(page, rows, part, parts):
    """Each finding of the previous round, re-checked on today's commit."""
    fixed = sum(1 for r in D.PREV_FINDINGS if r[3])
    o = header("ข้อบกพร่องจากรอบก่อน", f"Previous findings re-checked {part}/{parts}",
               (f"แก้แล้ว {fixed} จาก {len(D.PREV_FINDINGS)} รายการ",
                f"รอบ {D.PREV_DATE} {D.PREV_COMMIT}"))
    x, y, rh = M, TOP + 10, 98
    cols = [130, 720, 210, 632, 140]
    heads = ["ระดับ", f"ปัญหาเมื่อ {D.PREV_DATE}", "รอบนี้", "หลักฐาน", "TC"]
    o.append(f'<rect x="{x}" y="{y}" width="{sum(cols)}" height="58" fill="{tint(BRAND, 0.86)}"/>')
    for i, h in enumerate(heads):
        o.append(text(x + sum(cols[:i]) + 16, y + 39, h, 22, BRAND, 700))
    y += 58
    for r, (sev, issue, tc, ok, evidence) in enumerate(rows):
        ry = y + rh * r
        if r % 2:
            o.append(f'<rect x="{x}" y="{ry}" width="{sum(cols)}" height="{rh}" fill="{ROW_ALT}"/>')
        o.append(f'<rect x="{x + 16}" y="{ry + 28}" width="88" height="42" rx="21" '
                 f'fill="{SEVERITY[sev]}"/>')
        o.append(text(x + 60, ry + 57, sev, 22, "#FFFFFF", 700, anchor="middle"))
        lines = wrap_thai(issue, 25, cols[1] - 30)
        for j, line in enumerate(lines[:2]):
            o.append(text(x + cols[0] + 16, ry + (59 if len(lines) == 1 else 43 + j * 34), line, 25))
        label, color = FIX_MARK[ok]
        bx = x + sum(cols[:2]) + 16
        o.append(f'<rect x="{bx}" y="{ry + 28}" width="150" height="42" rx="21" fill="{color}"/>')
        o.append(text(bx + 75, ry + 57, label, 22, "#FFFFFF", 700, anchor="middle"))
        lines = wrap_thai(evidence, 22, cols[3] - 30)
        for j, line in enumerate(lines[:2]):
            o.append(text(x + sum(cols[:3]) + 16, ry + (57 if len(lines) == 1 else 43 + j * 30),
                          line, 22, INK if ok else "#B42318"))
        o.append(text(x + sum(cols[:4]) + 16, ry + 57, tc, 20, MUTED, 400, MONO))
    return frame(o + footer(page))


def chunks(rows, size):
    """Split into near-equal pages of at most `size` rows (11 at 7 a page gives 6 + 5)."""
    n = -(-len(rows) // size)
    per = -(-len(rows) // n)
    return [rows[i:i + per] for i in range(0, len(rows), per)]


def slide_table(c, page):
    """กรณีที่พิสูจน์ด้วยคำตอบของ API ล้วน ไม่มีภาพหน้าจอ ตารางจึงเป็นพระเอกของสไลด์"""
    o = case_header(c)
    colw = (W - 2 * M - 70) / 2
    y = TOP + 22
    s, y1 = section(M, y, colw, "ขั้นตอน", c["steps"], 25, BRAND, numbered=True)
    o += s
    s, y1 = section(M, y1, colw, "ผลที่ได้", c["result"], 25)
    o += s
    cx = M + colw + 70
    y2 = y
    if "table" in c:
        t = c["table"]
        first = 420 if len(t["head"]) <= 3 else 300
        rest = (colw - first) / (len(t["head"]) - 1)
        s, y2 = table(cx, y2, colw, t["head"], t["rows"], [first] + [rest] * (len(t["head"]) - 1),
                      23, 54)
        o += s
    if c.get("notes"):
        s, y2 = section(cx, y2 + 10, colw, "ข้อสังเกต", c["notes"], 25, ACCENT)
        o += s
    bottom = max(y1, y2)
    if bottom > H - 40:
        print(f"  คำเตือน {c['id']} ข้อความยาวเกินสไลด์ ({bottom:.0f} px)")
    # สไลด์แบบตารางมักสั้นกว่าสไลด์ที่มีภาพ ดันเนื้อหาลงมาให้อยู่กลางกรอบแทนที่จะลอยบน
    head, rest = o[:6], o[6:]   # หัวสไลด์ ป้ายผล และบรรทัดบทบาท อยู่กับที่
    dy = max(0.0, min(150.0, (H - 60 - bottom) / 2))
    return frame(head + [f'<g transform="translate(0,{dy:.0f})">', *rest, "</g>"] + footer(page))


CHANGE_MARK = {"up": ("ดีขึ้น", "#1F7A4D"), "new": ("ของใหม่", BRAND), "same": ("เท่าเดิม", ACCENT)}


def slide_changes(page):
    """เทียบกับเด็คสาธิตรอบก่อน เพื่อให้เห็นว่าอะไรขยับในหนึ่งสัปดาห์"""
    rows = D.CHANGES
    counts = {k: sum(1 for r in rows if r[3] == k) for k in CHANGE_MARK}
    o = header("เปลี่ยนจากสาธิตรอบก่อน", "What changed in a week",
               (f"เทียบ {getattr(D, 'PREV_DATE', '11 ก.ย. 2569')} กับ {D.TEST_DATE}",
                f"ดีขึ้น {counts['up']}   ของใหม่ {counts['new']}   เท่าเดิม {counts['same']}"))
    x, y, rh = M, TOP + 6, 74
    cols = [150, 470, 530, 682]
    heads = ["", "เรื่อง", f"รอบก่อน {getattr(D, 'PREV_COMMIT', 'c8ed505')}", f"วันนี้ {D.COMMIT}"]
    o.append(f'<rect x="{x}" y="{y}" width="{sum(cols)}" height="50" fill="{tint(BRAND, 0.86)}"/>')
    for i, h in enumerate(heads):
        o.append(text(x + sum(cols[:i]) + 16, y + 33, h, 17, BRAND, 700))
    y += 50
    for r, (topic, before, after, kind) in enumerate(rows):
        ry = y + rh * r
        if r % 2:
            o.append(f'<rect x="{x}" y="{ry}" width="{sum(cols)}" height="{rh}" fill="{ROW_ALT}"/>')
        label, color = CHANGE_MARK[kind]
        w = thai_w(label, 17) + 30
        o.append(f'<rect x="{x + 16}" y="{ry + 20}" width="{w:.1f}" height="34" rx="17" fill="{color}"/>')
        o.append(text(x + 16 + w / 2, ry + 44, label, 17, "#FFFFFF", 700, anchor="middle"))
        for i, (cell, size) in enumerate(((topic, 19), (before, 18), (after, 18))):
            lines = wrap_thai(cell, size, cols[i + 1] - 32)
            for j, line in enumerate(lines[:2]):
                o.append(text(x + sum(cols[:i + 1]) + 16,
                              ry + (46 if len(lines) == 1 else 32 + j * 26), line, size,
                              INK if i < 2 else INK, 600 if i == 0 else 400))
    return frame(o + footer(page))


# ------------------------------------------------------------------ main
def build():
    slides = [("cover", slide_cover), ("summary", slide_summary)]
    if hasattr(D, "PREV_FINDINGS"):
        parts = chunks(D.PREV_FINDINGS, 8)
        for i, rows in enumerate(parts):
            slides.append((f"previous-findings-{i + 1}",
                           lambda page, rows=rows, i=i: slide_prev_findings(page, rows, i + 1, len(parts))))
    elif hasattr(D, "CHANGES"):
        slides.append(("changes", slide_changes))
    slides.append(("flow", slide_flow))
    for c in D.CASES:
        slug = re.sub(r"[^a-z0-9]+", "-", c["en"].lower()).strip("-")
        name = f'{c["id"].lower().replace("-", "")}-{slug}'
        fn = {"zoom": slide_zoom, "stack": slide_stack, "pair": slide_pair,
              "table": slide_table}[c["layout"]]
        slides.append((name, lambda page, c=c, fn=fn: fn(c, page)))
    # findings already sorted by severity in the data file; at most 7 rows a page
    parts = chunks(D.FINDINGS, 7)
    for i, rows in enumerate(parts):
        slides.append((f"findings-{i + 1}",
                       lambda page, rows=rows, i=i: slide_findings(page, rows, i + 1, len(parts))))
    return slides


def main() -> int:
    svg_only = "--svg" in sys.argv
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.*"):
        old.unlink()
    for i, (name, fn) in enumerate(build()):
        path = OUT / f"{i:02d}-{name}.svg"
        path.write_text(fn(i + 1), encoding="utf-8")
        if not svg_only:
            render(path, path.with_suffix(".png"), 1.0)
        print(f"  {path.name}")
    print(f"สร้าง {i + 1} สไลด์ใน {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
