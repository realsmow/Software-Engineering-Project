"""สร้างสไลด์สาธิตระบบ (demo-slides/) จากผลทดสอบจริงใน demo_data.py

    cd docs/slides && python3 gen_demo_slides.py          # SVG + PNG
    cd docs/slides && python3 gen_demo_slides.py --svg    # SVG อย่างเดียว

สไลด์ 1920x1080 ฉายได้ทันที ต่างจากชุด ui-slides/ ที่ขนาดไม่คงที่เพราะทำไว้วางใน Canva
ภาพหน้าจอฝังเป็น base64 JPEG ไฟล์ SVG แต่ละไฟล์จึงจบในตัว

สามแบบของสไลด์กรณีทดสอบ
  zoom   ภาพเดียวแสดงขนาดจริง 1:1 ตัวหนังสือบนจอคมเท่าต้นฉบับ คำอธิบายอยู่คอลัมน์ขวา
  stack  สองภาพเตี้ยซ้อนกันแนวตั้งขนาดใกล้ 1:1 คำอธิบายอยู่คอลัมน์ขวา ใช้กับภาพกว้างแต่เตี้ย
  pair   สองภาพย่อ 0.74 เรียงซ้ายขวา คำอธิบายเป็นแถบสามคอลัมน์ด้านล่าง ใช้กับภาพสูง
"""

from __future__ import annotations

import base64
import re
import sys
from pathlib import Path

from PIL import Image

import demo_data as D
from slide_theme import (ACCENT, BRAND, INK, LINE, MONO, MUTED, PANEL, ROW_ALT,
                         THAI, esc, thai_w, tint, wrap_thai)
from svg_to_png import render

HERE = Path(__file__).parent
SCREENS = HERE / "demo-screens"
OUT = HERE / "demo-slides"

W, H = 1920, 1080
M = 44                  # ขอบกระดาษ
TOP = 128               # เนื้อหาเริ่มใต้แถบหัวเรื่อง
SRC_X, SRC_W = 240, 1200  # ครอปแถบเมนูซ้ายของภาพหน้าจอ 1440 px ทิ้ง

STATUS = {              # ป้ายผล และสีพื้นของป้าย (ตัวอักษรขาว คอนทราสต์ >= 4.5:1)
    D.PASS: ("ผ่าน", "#1F7A4D"),
    D.PARTIAL: ("ผ่านบางส่วน", ACCENT),
    D.FAIL: ("ไม่ผ่าน", "#B42318"),
    D.MOCK: ("ต้นแบบ UI", "#5B6B69"),
}
SEVERITY = {"สูง": "#B42318", "กลาง": ACCENT, "ต่ำ": "#5B6B69"}
SHOT_BORDER = "#C9D6D4"


# ------------------------------------------------------------------ ชิ้นส่วนพื้นฐาน
def text(x, y, s, size=19, color=INK, weight=400, font=THAI, anchor="start", extra=""):
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{font}" font-size="{size}" '
            f'font-weight="{weight}" fill="{color}" text-anchor="{anchor}" {extra}>'
            f'{esc(s)}</text>')


def badge(x, y, status, size=20, anchor="start"):
    """ป้ายผลทดสอบแบบแคปซูล คืน (svg, ความกว้าง)"""
    label, color = STATUS[status]
    w = thai_w(label, size) + 36
    x0 = x - w if anchor == "end" else x
    return ([f'<rect x="{x0:.1f}" y="{y}" width="{w:.1f}" height="{size + 20}" '
             f'rx="{(size + 20) / 2}" fill="{color}"/>',
             text(x0 + w / 2, y + size + 4, label, size, "#FFFFFF", 700, anchor="middle")], w)


def header(title, en, right_lines=()):
    """แถบหัวสไลด์ ขีดสีเน้น ชื่อไทย และบรรทัดอังกฤษ ขยายจาก slide_header ให้อ่านได้บนจอฉาย"""
    o = [f'<rect x="{M}" y="34" width="7" height="60" rx="3.5" fill="{BRAND}"/>',
         text(M + 24, 66, title, 36, INK, 700),
         text(M + 24, 92, en.upper(), 15, BRAND, 400, MONO, extra='letter-spacing="1"')]
    for i, s in enumerate(right_lines):
        o.append(text(W - M, 62 + i * 26, s, 17 if i else 19, MUTED, anchor="end"))
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
    return [f'<circle cx="{x + 14}" cy="{y - 7}" r="14" fill="{ACCENT}"/>',
            text(x + 14, y - 1, str(n), 16, "#FFFFFF", 700, MONO, "middle"),
            text(x + 38, y, s, 19, INK, 600)]


def section(x, y, width, heading, items, size=19, bullet=BRAND, numbered=False):
    """หัวข้อย่อยพร้อมรายการที่ตัดบรรทัดแล้ว คืน (svg, y ถัดไป)"""
    lh = size * 1.45
    o = [text(x, y, heading, 19, BRAND, 700)]
    y += 10
    for i, item in enumerate(items, 1):
        lines = wrap_thai(item, size, width - 30)
        y += lh
        if numbered:
            o.append(text(x + 8, y, f"{i}", size - 3, bullet, 700, MONO, "middle"))
        else:
            o.append(f'<circle cx="{x + 7}" cy="{y - size * 0.33:.1f}" r="4" fill="{bullet}"/>')
        for j, line in enumerate(lines):
            o.append(text(x + 26, y + j * lh, line, size))
        y += (len(lines) - 1) * lh
    return o, y + 36


def table(x, y, width, head, rows, col_w, size=18, row_h=40):
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
    return [f'<line x1="{M}" y1="{H - 30}" x2="{W - M}" y2="{H - 30}" stroke="{LINE}"/>',
            text(M, H - 10, f"ULMs สาธิตระบบ  origin/main {D.COMMIT}  {D.TEST_DATE}",
                 14, MUTED),
            text(W - M, H - 10, str(page), 14, MUTED, 700, MONO, "end")]


def tally():
    counts = {s: 0 for s in STATUS}
    for c in D.CASES:
        counts[c["status"]] += 1
    return counts


# ------------------------------------------------------------------ สไลด์แต่ละแบบ
def slide_cover(page):
    dy = 60
    o = [f'<rect x="0" y="0" width="14" height="{H}" fill="{BRAND}"/>',
         text(110, 250, "SYSTEM DEMO", 24, BRAND, 700, MONO, extra='letter-spacing="3"'),
         text(110, 330, "สาธิตการทำงานระบบ ULMs", 68, INK, 700),
         text(110, 390, "ระบบบริหารจัดการการยืมคืนอุปกรณ์ มหาวิทยาลัยเกษตรศาสตร์", 28, MUTED),
         text(110, 480, "ทดสอบการใช้งานจริงครบ 4 บทบาท บนเครื่อง local", 26, INK),
         text(110, 522, f"origin/main {D.COMMIT}   {D.TEST_DATE}", 22, INK, 400, MONO),
         text(110, 562, "NestJS tRPC :3000   Vite React :5173   PostgreSQL :5432", 20, MUTED,
              400, MONO)]
    # ผลรวมทุกกรณีทดสอบ
    x = 110
    for status, n in tally().items():
        b, w = badge(x, 640, status, 22)
        o += b
        o.append(text(x + w + 14, 670, f"{n}", 34, INK, 700, MONO))
        x += w + 90
    o.append(text(110, 740, f"{len(D.CASES)} กรณีทดสอบ   ข้อบกพร่องที่พบ {len(D.FINDINGS)} รายการ",
                  22, MUTED))
    # บัญชีทดสอบ
    tx, ty = 1120, 250
    o.append(text(tx, ty - 24, "บัญชีทดสอบ", 22, INK, 700))
    t, _ = table(tx, ty, 700, ["บทบาท", "อีเมล KU", "บัญชีภายใน"],
                 [[r, e, u] for r, e, u, _ in D.ACCOUNTS], [200, 270, 230], 18, 50)
    o += t
    o.append(text(tx, ty + 50 * 5 + 40, "รหัสผ่าน ชื่อบทบาทตามด้วย 1234 เช่น borrower1234", 18, MUTED))
    # เลื่อนเนื้อหาทั้งก้อนลงให้กึ่งกลางแนวตั้ง แถบสีซ้ายอยู่กับที่
    o = [o[0], f'<g transform="translate(0,{dy})">', *o[1:], "</g>"]
    return frame(o + footer(page))


def slide_summary(page):
    o = header("สรุปผลการทดสอบ", "Test summary", (f"{len(D.CASES)} กรณีทดสอบ",))
    x, y, rh = M, TOP + 10, 56
    cols = [150, 620, 330, 260]          # TC หัวข้อ บทบาท ผล
    o.append(f'<rect x="{x}" y="{y}" width="{sum(cols)}" height="{rh}" fill="{tint(BRAND, 0.86)}"/>')
    for i, h in enumerate(["TC", "หัวข้อ", "บทบาท", "ผล"]):
        o.append(text(x + sum(cols[:i]) + 16, y + 36, h, 18, BRAND, 700))
    for r, c in enumerate(D.CASES):
        ry = y + rh * (r + 1)
        if r % 2:
            o.append(f'<rect x="{x}" y="{ry}" width="{sum(cols)}" height="{rh}" fill="{ROW_ALT}"/>')
        o.append(text(x + 16, ry + 36, c["id"], 18, INK, 700, MONO))
        o.append(text(x + cols[0] + 16, ry + 36, c["th"], 20))
        o.append(text(x + sum(cols[:2]) + 16, ry + 36, c["role"], 18, MUTED))
        b, _ = badge(x + sum(cols[:3]) + 16, ry + 9, c["status"], 17)
        o += b
    # คอลัมน์ขวา นับผล
    rx = x + sum(cols) + 70
    o.append(text(rx, TOP + 46, "ผลรวม", 22, INK, 700))
    yy = TOP + 80
    for status, n in tally().items():
        b, _ = badge(rx, yy, status, 20)
        o += b
        o.append(text(W - M, yy + 30, str(n), 40, INK, 700, MONO, "end"))
        yy += 76
    notes = ["ที่ไม่ผ่าน คือปุ่มฝั่งผู้ยืม ที่ยังไม่ต่อ backend",
             "backend ถูกต้อง ครบทุกขั้นของการยืม",
             "ต้นแบบ UI ไม่นับรวม"]
    s, _ = section(rx, yy + 30, W - M - rx, "ข้อสังเกต", notes, 18, ACCENT)
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


def flow_box(x, y, w, h, step):
    name, role, tc, fe, be = step
    worst = "#B42318" if False in (fe, be) else ACCENT if None in (fe, be) else "#1F7A4D"
    o = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{PANEL}" '
         f'stroke="{LINE}" stroke-width="2"/>',
         f'<rect x="{x}" y="{y}" width="{w}" height="8" rx="4" fill="{worst}"/>',
         text(x + w / 2, y + 56, name, 26, INK, 700, anchor="middle"),
         text(x + w / 2, y + 88, role, 18, MUTED, anchor="middle"),
         text(x + w / 2, y + 118, tc, 16, BRAND, 700, MONO, "middle")]
    for i, (layer, ok) in enumerate((("หน้าเว็บ", fe), ("backend", be))):
        ly = y + 150 + i * 44
        label, color = MARK[ok]
        o.append(text(x + 16, ly + 21, layer, 17, INK))
        o.append(f'<rect x="{x + w - 16 - 92}" y="{ly}" width="92" height="30" rx="15" '
                 f'fill="{tint(color, 0.85)}"/>')
        o.append(text(x + w - 16 - 46, ly + 21, label, 15, color, 700, anchor="middle"))
    return o


def slide_flow(page):
    o = header("เส้นทางการยืมที่ทดสอบ", "Borrowing flow tested end to end",
               ("แยกผลตามชั้นหน้าเว็บและ backend",))
    n, gap = len(FLOW), 30
    bw = (W - 2 * M - gap * (n - 1)) / n
    y, bh = TOP + 70, 250
    for i, step in enumerate(FLOW):
        x = M + i * (bw + gap)
        o += flow_box(x, y, bw, bh, step)
        if i < n - 1:
            ax = x + bw + 4
            o.append(f'<path d="M{ax:.1f} {y + bh / 2} l{gap - 8} 0 m-9 -8 l9 8 l-9 8" '
                     f'fill="none" stroke="{BRAND}" stroke-width="3"/>')
    o.append(text(M, y + bh + 90, "งานข้างเคียง", 24, INK, 700))
    sy = y + bh + 120
    for i, step in enumerate(SIDE):
        o += flow_box(M + i * (bw + gap), sy, bw, bh, step)
    notes = ["ทุกขั้นทดสอบผ่านหน้าเว็บของบทบาทนั้นจริง ยกเว้นส่งคำขอ ซึ่งใช้ loan.create แทนปุ่มที่ยังไม่ต่อ",
             "จุดที่ขาดเกือบทั้งหมดอยู่ที่หน้าเว็บ",
             "backend ขาดเพียง API ห้อง และการคืนสิทธิ์ที่ยกเลิกบทลงโทษเกินขอบเขต"]
    s, _ = section(M + 4 * (bw + gap) + 20, sy + 10, W - M - (M + 4 * (bw + gap) + 20),
                   "สรุป", notes, 19, ACCENT)
    o += s
    return frame(o + footer(page))


def case_header(c):
    label, _ = STATUS[c["status"]]
    o = header(f'{c["id"]}  {c["th"]}', c["en"])
    b, _ = badge(W - M, 38, c["status"], 22, "end")
    o += b
    o.append(text(W - M, 104, f'บทบาท {c["role"]}', 18, MUTED, anchor="end"))
    return o


def right_column(c, cx, cw):
    """คอลัมน์คำอธิบายด้านขวาของสไลด์ zoom และ stack"""
    o, y = [], TOP + 22
    s, y = section(cx, y, cw, "ขั้นตอน", c["steps"], 19, BRAND, numbered=True)
    o += s
    s, y = section(cx, y, cw, "ผลที่ได้", c["result"], 19)
    o += s
    if "table" in c:
        t = c["table"]
        first = 200 if len(t["head"]) > 3 else 230
        rest = (cw - first) / (len(t["head"]) - 1)
        s, y = table(cx, y, cw, t["head"], t["rows"], [first] + [rest] * (len(t["head"]) - 1))
        o += s
    if c.get("notes"):
        s, y = section(cx, y, cw, "ข้อสังเกต", c["notes"], 19, ACCENT)
        o += s
    if y > H - 40:
        print(f"  คำเตือน {c['id']} ข้อความยาวเกินสไลด์ ({y:.0f} px)")
    return o


def slide_zoom(c, page):
    o = case_header(c)
    key, label = c["shots"][0]
    _, ch, _, cw0 = crop_of(key)
    scale = min(1.0, (H - TOP - 30 - 60) / ch, 1200 / cw0)
    o += shot_label(M, TOP + 22, 1, label)
    img, dw, _ = screenshot(key, M, TOP + 40, scale)
    o += img
    cx = M + dw + 48
    o += right_column(c, cx, W - M - cx)
    return frame(o + footer(page))


def slide_stack(c, page):
    """สองภาพเตี้ยและกว้างซ้อนกันแนวตั้งด้านซ้าย ขนาดใกล้ 1:1 ให้อ่านตัวหนังสือในภาพได้"""
    o = case_header(c)
    crops = [crop_of(k) for k, _ in c["shots"]]
    label_h, gap = 40, 26
    avail = H - TOP - 50 - len(crops) * label_h - gap * (len(crops) - 1)
    scale = min(1.0, avail / sum(cr[1] for cr in crops), min(1200 / cr[3] for cr in crops))
    y = TOP + 22
    dw = 0
    for i, ((key, label), cr) in enumerate(zip(c["shots"], crops)):
        o += shot_label(M, y, i + 1, label)
        img, dw, dh = screenshot(key, M, y + 18, scale)
        o += img
        y += 18 + dh + gap + label_h - 18
    cx = M + dw + 48
    o += right_column(c, cx, W - M - cx)
    return frame(o + footer(page))


def slide_pair(c, page):
    o = case_header(c)
    colw, gap = (W - 2 * M - 56) / 2, 56
    max_h = 590
    tallest = 0
    for i, (key, label) in enumerate(c["shots"]):
        x = M + i * (colw + gap)
        _, ch, _, cw0 = crop_of(key)
        scale = min(colw / cw0, max_h / ch)
        o += shot_label(x, TOP + 22, i + 1, label)
        img, _, dh = screenshot(key, x, TOP + 40, scale)
        o += img
        tallest = max(tallest, dh)
    # แถบคำอธิบายด้านล่าง สามคอลัมน์ ชิดใต้ภาพที่สูงที่สุด
    by = TOP + 40 + tallest + 76
    o.append(f'<line x1="{M}" y1="{by - 30}" x2="{W - M}" y2="{by - 30}" stroke="{LINE}" '
             f'stroke-width="1.5"/>')
    parts = [("ขั้นตอน", c["steps"], BRAND, True), ("ผลที่ได้", c["result"], BRAND, False)]
    if c.get("notes"):
        parts.append(("ข้อสังเกต", c["notes"], ACCENT, False))
    cw = (W - 2 * M - 40 * (len(parts) - 1)) / len(parts)
    for i, (head, items, color, num) in enumerate(parts):
        s, y = section(M + i * (cw + 40), by, cw, head, items, 18, color, num)
        o += s
        if y > H - 40:
            print(f"  คำเตือน {c['id']} คอลัมน์ {head} ยาวเกินสไลด์ ({y:.0f} px)")
    return frame(o + footer(page))


def slide_findings(page, rows, part, parts):
    o = header("ข้อบกพร่องที่พบ", f"Findings {part}/{parts}",
               (f"ทั้งหมด {len(D.FINDINGS)} รายการ เรียงตามความรุนแรง",))
    x, y, rh = M, TOP + 10, 76
    cols = [140, 900, 470, 170, 152]
    heads = ["ระดับ", "ปัญหา", "ตำแหน่ง", "ฝ่าย", "TC"]
    o.append(f'<rect x="{x}" y="{y}" width="{sum(cols)}" height="52" fill="{tint(BRAND, 0.86)}"/>')
    for i, h in enumerate(heads):
        o.append(text(x + sum(cols[:i]) + 16, y + 34, h, 18, BRAND, 700))
    y += 52
    for r, (sev, issue, where, owner, tc) in enumerate(rows):
        ry = y + rh * r
        if r % 2:
            o.append(f'<rect x="{x}" y="{ry}" width="{sum(cols)}" height="{rh}" fill="{ROW_ALT}"/>')
        color = SEVERITY[sev]
        o.append(f'<rect x="{x + 16}" y="{ry + 21}" width="80" height="34" rx="17" fill="{color}"/>')
        o.append(text(x + 56, ry + 45, sev, 18, "#FFFFFF", 700, anchor="middle"))
        lines = wrap_thai(issue, 20, cols[1] - 30)
        for j, line in enumerate(lines[:2]):
            o.append(text(x + cols[0] + 16, ry + (46 if len(lines) == 1 else 32 + j * 28), line, 21))
        o.append(text(x + sum(cols[:2]) + 16, ry + 46, where, 17, INK, 400, MONO))
        o.append(text(x + sum(cols[:3]) + 16, ry + 46, owner, 18, INK, 700, MONO))
        o.append(text(x + sum(cols[:4]) + 16, ry + 46, tc, 17, MUTED, 400, MONO))
    return frame(o + footer(page))


# ------------------------------------------------------------------ main
def build():
    slides = [("cover", slide_cover), ("summary", slide_summary), ("flow", slide_flow)]
    for c in D.CASES:
        slug = re.sub(r"[^a-z0-9]+", "-", c["en"].lower()).strip("-")
        name = f'{c["id"].lower().replace("-", "")}-{slug}'
        fn = {"zoom": slide_zoom, "stack": slide_stack, "pair": slide_pair}[c["layout"]]
        slides.append((name, lambda page, c=c, fn=fn: fn(c, page)))
    # ข้อบกพร่องแยกสองหน้า สูงและกลางหน้าแรก ต่ำหน้าสอง
    high = [f for f in D.FINDINGS if f[0] != "ต่ำ"]
    low = [f for f in D.FINDINGS if f[0] == "ต่ำ"]
    slides.append(("findings-1", lambda page: slide_findings(page, high, 1, 2)))
    slides.append(("findings-2", lambda page: slide_findings(page, low, 2, 2)))
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
