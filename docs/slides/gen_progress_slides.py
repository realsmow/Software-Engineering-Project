#!/usr/bin/env python3
"""สร้างสไลด์นำเสนอ "รายงานความก้าวหน้า ครั้งที่ 1" จากหัวข้อ 2, 4, 5, 7 ของรายงาน

    รันจาก docs/slides/ :  python3 gen_progress_slides.py
    ผลลัพธ์:               slides/progress-slides/*.svg   (1600x900 · 16:9)
    ออก PNG ด้วย:          python3 gen_progress_slides.py --png

ธีมดึงมาจาก slide_theme.py ซึ่งพาเลตต์มาจากเด็คต้นแบบ
resource/ULMs_Software_Project_Presentation_V.pdf โดยตรง (teal #16726D เป็นสีหลัก
ส้มเป็นสีเน้น) — องค์ประกอบที่ยกมาจากเด็คคือ แถบหัวสไลด์ teal พร้อมหัวเรื่องอังกฤษ
ตัวใหญ่บนคำแปลไทย · การ์ดหมายเลขในวงกลม · วงกลมจาง ๆ ที่มุมล่าง · เส้นคั่นท้ายสไลด์

เนื้อหาทั้งหมดอยู่ใน progress_data.py — ไฟล์นี้มีแต่โค้ดวาด ไม่มีถ้อยคำของรายงาน
"""

from __future__ import annotations

import sys
from pathlib import Path

import progress_data as D
from slide_theme import (ACCENT, BRAND, INK, LINE, MUTED, ROW_ALT, THAI, MONO,
                         esc, tint)
from text_metrics import require_raqm, width, wrap, wrap_runs

HERE = Path(__file__).parent
OUT = HERE / "progress-slides"

# ---------------------------------------------------------------- ผังหน้ากระดาษ
W, H = 1600, 900          # 16:9 เท่าเด็คต้นแบบ (1440x810) แต่ปัดเป็นเลขกลม
PAD = 60                  # ขอบซ้าย–ขวาของเนื้อหา
BAND = 118                # ความสูงแถบหัวสไลด์ teal
BODY = BAND + 30          # บรรทัดแรกของเนื้อหาเริ่มได้ตั้งแต่ตรงนี้
RULE_Y = 840              # เส้นคั่นเหนือท้ายสไลด์
RIGHT = W - PAD           # ขอบขวาของเนื้อหา

CARD_BG = tint(BRAND, 0.92)    # พื้นการ์ดโทน teal อ่อน
CARD_BG2 = tint(BRAND, 0.86)   # เข้มขึ้นอีกขั้น สำหรับการ์ดที่ต้องเด่นกว่า
DECO = "#F2F7F7"               # วงกลมตกแต่งมุมล่าง — สีพื้นอ่อนของเด็ค

FOOT_TEXT = "ULMs รายงานความก้าวหน้าโครงการ ครั้งที่ 1"


# ------------------------------------------------------------ ตัวช่วยสร้าง SVG
def txt(x: float, y: float, s: str, size: float, *, weight: str = "regular",
        fill: str = INK, family: str = THAI, anchor: str = "start",
        ls: float | None = None, opacity: float | None = None) -> str:
    """ข้อความหนึ่งบรรทัด — ตัวช่วยหลักที่ทุกสไลด์เรียกใช้"""
    a = [f'x="{x:.1f}"', f'y="{y:.1f}"', f'font-family="{family}"',
         f'font-size="{size:g}"', f'fill="{fill}"']
    if weight == "bold":
        a.append('font-weight="700"')
    if anchor != "start":
        a.append(f'text-anchor="{anchor}"')
    if ls is not None:
        a.append(f'letter-spacing="{ls:g}"')
    if opacity is not None:
        a.append(f'opacity="{opacity:g}"')
    return f'<text {" ".join(a)}>{esc(s)}</text>'


def runs_line(x: float, y: float, segments: list[tuple[str, str]], size: float,
              fill: str = INK) -> str:
    """หนึ่งบรรทัดที่มีทั้งตัวหนาและตัวปกติ — ใช้ <tspan> ต่อกันในบรรทัดเดียว

    ต้องมี xml:space="preserve" เพราะช่องว่างที่คั่นระหว่างช่วงตัวหนากับตัวปกติ
    อยู่ท้าย <tspan> ตัวก่อน ซึ่ง XML จะตัดทิ้งถ้าไม่สั่งให้เก็บไว้ — คำจะติดกัน
    """
    inner = "".join(
        f'<tspan{" font-weight=\"700\"" if wt == "bold" else ""}>{esc(t)}</tspan>'
        for t, wt in segments)
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{THAI}" '
            f'font-size="{size:g}" fill="{fill}" xml:space="preserve">'
            f'{inner}</text>')


def para(x: float, y: float, runs: list[tuple[str, str]], size: float,
         max_w: float, lh: float, fill: str = INK) -> tuple[list[str], float]:
    """ย่อหน้าที่ตัดบรรทัดเอง คืนทั้งชิ้นส่วน SVG และตำแหน่ง y ของบรรทัดถัดไป"""
    out = []
    for i, line in enumerate(wrap_runs(runs, size, max_w)):
        out.append(runs_line(x, y + i * lh, line, size, fill))
    return out, y + len(wrap_runs(runs, size, max_w)) * lh


def lines_of(runs: list[tuple[str, str]], size: float, max_w: float) -> int:
    return len(wrap_runs(runs, size, max_w))


def rect(x: float, y: float, w: float, h: float, *, fill: str = "none",
         stroke: str | None = None, rx: float = 0, sw: float = 1,
         opacity: float | None = None) -> str:
    a = [f'x="{x:.1f}"', f'y="{y:.1f}"', f'width="{w:.1f}"',
         f'height="{h:.1f}"', f'fill="{fill}"']
    if rx:
        a.append(f'rx="{rx:g}"')
    if stroke:
        a.append(f'stroke="{stroke}"')
        a.append(f'stroke-width="{sw:g}"')
    if opacity is not None:
        a.append(f'opacity="{opacity:g}"')
    return f'<rect {" ".join(a)}/>'


def bullet(x: float, y: float, r: float = 3.5, fill: str = BRAND) -> str:
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:g}" fill="{fill}"/>'


def deco() -> list[str]:
    """วงกลมจาง ๆ ที่มุมล่างซ้ายและขวา — ลายเซ็นของเด็คต้นแบบ

    วาดก่อนทุกอย่าง การ์ดที่ทึบจะทับไปเอง จึงเห็นเฉพาะตรงขอบกระดาษ
    """
    return [f'<circle cx="-40" cy="980" r="330" fill="{DECO}"/>',
            f'<circle cx="{W+70}" cy="{H+40}" r="200" fill="{DECO}"/>']


def chrome(en: str, th: str, sec: int | None, page: int) -> list[str]:
    """แถบหัวสไลด์ + ท้ายสไลด์ ที่ทุกหน้าใช้ร่วมกัน"""
    o = [rect(0, 0, W, BAND, fill=BRAND),
         txt(PAD, 62, en.upper(), 40, weight="bold", fill="#FFFFFF", ls=1.4),
         txt(PAD, 96, th, 21, fill="#FFFFFF", opacity=0.86)]
    if sec is not None:
        # หมายเลขหัวข้อในวงกลมเส้นขอบ — ลายวงกลมของเด็คต้นแบบ
        cx, cy = RIGHT - 34, BAND / 2
        o += [txt(cx - 56, cy + 7, "หัวข้อที่", 19, fill="#FFFFFF", opacity=0.8,
                  anchor="end"),
              f'<circle cx="{cx}" cy="{cy}" r="30" fill="none" '
              f'stroke="#FFFFFF" stroke-width="2" opacity="0.85"/>',
              txt(cx, cy + 11, str(sec), 30, weight="bold", fill="#FFFFFF",
                  anchor="middle")]
    o += [f'<line x1="{PAD}" y1="{RULE_Y}" x2="{RIGHT}" y2="{RULE_Y}" '
          f'stroke="{LINE}" stroke-width="1.5"/>',
          txt(PAD, RULE_Y + 28, FOOT_TEXT, 15, fill=MUTED),
          txt(RIGHT, RULE_Y + 28, f"{page:02d}", 15, weight="bold", fill=BRAND,
              anchor="end")]
    return o


def svg(parts: list[str]) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}">'
            f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>'
            + "".join(parts) + '</svg>')


# ============================================================ 00 · หน้าปก
def slide_cover() -> str:
    m = D.MEETING
    o = deco()
    o.append(f'<circle cx="96" cy="86" r="25" fill="none" stroke="{BRAND}" '
             f'stroke-width="3.5"/>')

    o += [txt(88, 306, "ULMs", 132, weight="bold", fill=BRAND, ls=-2),
          txt(94, 352, "UNIVERSITY EQUIPMENT LENDING MANAGEMENT SYSTEM", 21,
              weight="bold", fill=INK, ls=1.2),
          txt(94, 392, "ระบบบริหารจัดการการยืม–คืนอุปกรณ์มหาวิทยาลัย", 25,
              fill=MUTED),
          f'<line x1="94" y1="436" x2="800" y2="436" stroke="{BRAND}" '
          f'stroke-width="2"/>',
          txt(94, 498, "รายงานความก้าวหน้าโครงการ ครั้งที่ 1", 40,
              weight="bold", fill=BRAND),
          txt(94, 540, f'รอบรายงาน {m["period"]}', 21, fill=MUTED)]

    # การ์ดสรุปตัวเลขด้านขวา — ให้อาจารย์เห็นสถานะทั้งหมดตั้งแต่หน้าแรก
    cx, cy, cw = 900, 150, 640
    o.append(rect(cx, cy, cw, 570, fill=CARD_BG, rx=22))
    # ตัวเลขใหญ่กว้างไม่เท่ากันตามจำนวนหลัก จึงวัดจริงแล้ววางข้อความถัดไปต่อท้าย
    # ไม่ใช้ระยะคงที่ ซึ่งจะทับกันทันทีที่ตัวเลขเปลี่ยนเป็นสามหลัก
    big = f'{m["actual"]}%'
    delta = m["actual"] - m["plan"]
    big_end = cx + 44 + width(big, 108, weight="bold") + 26
    o += [txt(cx + 44, cy + 74, "ความก้าวหน้า ณ วันรายงาน", 19, fill=BRAND),
          txt(cx + 44, cy + 178, big, 108, weight="bold", fill=BRAND),
          txt(big_end, cy + 158, f'เทียบแผน {m["plan"]}%', 24, fill=INK),
          # คำนวณจาก MEETING เสมอ ไม่ฮาร์ดโค้ด ทิศทางจึงพลิกตามตัวเลขได้เอง
          txt(big_end, cy + 192,
              (f'สูงกว่าแผน {delta}%' if delta > 0 else
               f'ต่ำกว่าแผน {-delta}%' if delta < 0 else "ตรงตามแผน"),
              20, weight="bold", fill=BRAND if delta >= 0 else ACCENT),
          f'<line x1="{cx+44}" y1="{cy+240}" x2="{cx+cw-44}" y2="{cy+240}" '
          f'stroke="{BRAND}" stroke-width="1" opacity="0.3"/>']
    for i, (k, v) in enumerate([("สถานะ Sprint", m["sprint"]),
                                ("งบประมาณ", m["budget"]),
                                ("กำหนดเสร็จ", m["due"])]):
        ly = cy + 296 + i * 88
        o += [txt(cx + 44, ly, k, 18, fill=MUTED),
              txt(cx + 44, ly + 32, v, 21, weight="bold", fill=INK)]

    o += [f'<line x1="{PAD}" y1="792" x2="{RIGHT}" y2="792" stroke="{BRAND}" '
          f'stroke-width="2"/>',
          txt(PAD, 832, "ภาควิชาวิศวกรรมคอมพิวเตอร์ คณะวิศวกรรมศาสตร์ "
              "มหาวิทยาลัยเกษตรศาสตร์", 19, fill=MUTED),
          txt(RIGHT, 832, f'กลุ่ม : {m["team"]}', 21, weight="bold", fill=BRAND,
              anchor="end")]
    return svg(o)


# ================================================ 01 · §2 แผนภาพรวม 6 Sprint
def slide_roadmap() -> str:
    o = deco() + chrome("Sprint Roadmap", "แผนภาพรวมทั้ง 6 Sprint", 2, 1)
    o.append(txt(PAD, BODY + 22, "โครงการแบ่งเป็น 6 Sprint บนกรอบเวลา 10 สัปดาห์ "
                 "ผ่านมาแล้ว 3 Sprint", 20, fill=MUTED))

    n = len(D.SPRINTS)
    gap = 14
    cw = (W - 2 * PAD - gap * (n - 1)) / n
    top, bot = 272, 812
    rail = 232

    o.append(f'<line x1="{PAD+cw/2}" y1="{rail}" x2="{RIGHT-cw/2}" y2="{rail}" '
             f'stroke="{LINE}" stroke-width="3"/>')
    # ส่วนของรางที่ผ่านมาแล้ว ทับด้วยสีหลักให้เห็นว่าเดินมาถึงไหน
    done_x = PAD + cw / 2 + (cw + gap) * 2
    o.append(f'<line x1="{PAD+cw/2}" y1="{rail}" x2="{done_x}" y2="{rail}" '
             f'stroke="{BRAND}" stroke-width="3"/>')

    for i, sp in enumerate(D.SPRINTS):
        x = PAD + i * (cw + gap)
        cx = x + cw / 2
        st = sp["status"]
        accent = {"done": BRAND, "active": ACCENT, "missed": ACCENT,
                  "plan": MUTED}[st]
        bg = {"done": CARD_BG, "active": tint(ACCENT, 0.93),
              "missed": tint(ACCENT, 0.93), "plan": "#FFFFFF"}[st]

        # หมุดบนราง
        if st in ("active", "missed"):
            o.append(f'<circle cx="{cx}" cy="{rail}" r="15" fill="#FFFFFF"/>')
            o.append(f'<circle cx="{cx}" cy="{rail}" r="11" fill="{accent}"/>')
            o.append(txt(cx, rail - 26, "อยู่ตรงนี้", 17, weight="bold",
                         fill=ACCENT, anchor="middle"))
        else:
            o.append(f'<circle cx="{cx}" cy="{rail}" r="9" fill="#FFFFFF" '
                     f'stroke="{accent}" stroke-width="3"/>')

        o.append(rect(x, top, cw, bot - top, fill=bg, rx=14,
                      stroke=accent if st != "plan" else LINE,
                      sw=1.6 if st != "plan" else 1))
        o.append(rect(x, top, cw, 5, fill=accent, rx=2.5))

        o += [txt(x + 20, top + 40, sp["id"], 15, weight="bold", fill=accent,
                  family=MONO, ls=0.8),
              txt(x + 20, top + 66, sp["dates"], 16, fill=MUTED)]
        o.append(f'<line x1="{x+20}" y1="{top+84}" x2="{x+cw-20}" '
                 f'y2="{top+84}" stroke="{accent}" stroke-width="1" '
                 f'opacity="0.35"/>')

        ty = top + 116
        for line in wrap(sp["theme"], 19, cw - 40, weight="bold"):
            o.append(txt(x + 20, ty, line, 19, weight="bold", fill=INK))
            ty += 26

        ty += 18
        for task in sp["tasks"]:
            o.append(bullet(x + 25, ty - 5, 3, accent))
            for j, line in enumerate(wrap(task, 15.5, cw - 56)):
                o.append(txt(x + 38, ty, line, 15.5, fill=INK if st != "plan"
                             else MUTED))
                ty += 21
            ty += 8

        # ป้ายสถานะยึดขอบล่างของการ์ด ไม่ลอยตามความยาวเนื้อหา
        label = D.STATUS_LABEL[st]
        bw = width(label, 15, weight="bold") + 30
        by = bot - 46
        o.append(rect(x + 20, by, bw, 30,
                      fill=accent if st != "plan" else "#FFFFFF", rx=15,
                      stroke=None if st != "plan" else MUTED))
        o.append(txt(x + 20 + bw / 2, by + 21, label, 15, weight="bold",
                     fill="#FFFFFF" if st != "plan" else MUTED,
                     anchor="middle"))
    return svg(o)


# ============================================ 02 · §4 กราฟแท่งรายมิติ
def slide_dimension_chart() -> str:
    o = deco() + chrome("Progress by Dimension",
                        "ความก้าวหน้าแยกตามมิติของงาน", 4, 2)

    # แถบตัวเลขรวม — คำตอบของสไลด์อยู่บรรทัดนี้ ที่เหลือคือที่มา
    tiles = [("ผลจริง", f'{D.MEETING["actual"]}%', BRAND, True),
             ("แผน", f'{D.MEETING["plan"]}%', MUTED, False),
             ("ผลต่าง", "+1%", ACCENT, False)]
    tw = (W - 2 * PAD - 40) / 3
    for i, (label, val, col, strong) in enumerate(tiles):
        x = PAD + i * (tw + 20)
        o.append(rect(x, 148, tw, 104, fill=CARD_BG if strong else "#FFFFFF",
                      rx=12, stroke=None if strong else LINE))
        o += [txt(x + 28, 190, label, 19, fill=MUTED),
              txt(x + 28, 228, val, 40, weight="bold", fill=col)]
        if strong:
            o.append(txt(x + tw - 28, 228, "รวมถ่วงน้ำหนักทั้ง 6 มิติ", 17,
                         fill=MUTED, anchor="end"))

    bx0, bx1 = 430, 1380
    gy0, gy1 = 300, 790
    rowh = (gy1 - gy0 - 20) / len(D.DIMENSIONS)

    def bar_x(v: float) -> float:
        return bx0 + v / 100 * (bx1 - bx0)

    for v in range(0, 101, 20):
        o.append(f'<line x1="{bar_x(v)}" y1="{gy0}" x2="{bar_x(v)}" y2="{gy1}" '
                 f'stroke="{LINE}" stroke-width="1"/>')
        o.append(txt(bar_x(v), gy0 - 12, str(v), 15, fill=MUTED,
                     anchor="middle"))
    o.append(txt(bx1 + 40, gy0 - 12, "%", 15, fill=MUTED))

    for i, (name, _sub, wt, plan, act, _fact) in enumerate(D.DIMENSIONS):
        cy = gy0 + 16 + rowh * i + rowh / 2
        o += [txt(bx0 - 26, cy - 2, name, 20, weight="bold", fill=INK,
                  anchor="end"),
              txt(bx0 - 26, cy + 22, f"น้ำหนัก {wt}%", 15, fill=MUTED,
                  anchor="end")]
        o.append(rect(bx0, cy - 25, bar_x(plan) - bx0, 21, fill="#C9D6D4",
                      rx=3))
        o.append(rect(bx0, cy + 4, bar_x(act) - bx0, 21, fill=BRAND, rx=3))
        o += [txt(bar_x(plan) + 10, cy - 9, str(plan), 15, fill="#6B7C7A"),
              txt(bar_x(act) + 10, cy + 21, str(act), 15, weight="bold",
                  fill=BRAND)]
        # ผลต่างชิดขวาสุด ให้กวาดตาลงมาเทียบกันได้เป็นคอลัมน์
        diff = act - plan
        o.append(txt(RIGHT, cy + 6, f"{diff:+d}" if diff else "0", 20,
                     weight="bold",
                     fill=ACCENT if diff < 0 else (BRAND if diff else MUTED),
                     anchor="end"))

    o += [rect(bx0, 806, 34, 15, fill="#C9D6D4", rx=3),
          txt(bx0 + 44, 819, "แผน", 17, fill=MUTED),
          rect(bx0 + 110, 806, 34, 15, fill=BRAND, rx=3),
          txt(bx0 + 154, 819, "ผลจริง", 17, fill=INK),
          txt(RIGHT, 819, "ผลต่าง (จริง − แผน)", 16, fill=MUTED, anchor="end")]
    return svg(o)


# ============================================ 03 · §4 ตารางรายมิติ
def slide_dimension_table() -> str:
    o = deco() + chrome("Progress by Dimension",
                        "ความก้าวหน้าแยกตามมิติของงาน และข้อเท็จจริงประกอบ", 4, 3)

    cols = [("มิติงาน", PAD + 18, "start"), ("น้ำหนัก", 470, "middle"),
            ("แผน", 560, "middle"), ("จริง", 645, "middle"),
            ("ผลต่าง", 740, "middle"), ("ข้อเท็จจริงประกอบ", 820, "start")]
    fact_w = RIGHT - 820 - 18

    hy = 158
    o.append(rect(PAD, hy, W - 2 * PAD, 46, fill=BRAND, rx=8))
    for label, x, anchor in cols:
        o.append(txt(x, hy + 30, label, 18, weight="bold", fill="#FFFFFF",
                     anchor=anchor))

    y = hy + 46
    for i, (name, sub, wt, plan, act, fact) in enumerate(D.DIMENSIONS):
        fact_lines = wrap(fact, 17, fact_w)
        rh = max(64, len(fact_lines) * 25 + 30)
        if i % 2 == 0:
            o.append(rect(PAD, y, W - 2 * PAD, rh, fill=ROW_ALT))
        o.append(txt(PAD + 18, y + (30 if sub else 38), name, 18.5,
                     weight="bold", fill=INK))
        if sub:
            o.append(txt(PAD + 18, y + 51, sub, 14.5, fill=MUTED))
        mid = y + rh / 2 + 6
        o += [txt(470, mid, f"{wt}%", 18, fill=MUTED, anchor="middle"),
              txt(560, mid, str(plan), 18, fill=MUTED, anchor="middle"),
              txt(645, mid, str(act), 19, weight="bold", fill=BRAND,
                  anchor="middle")]
        diff = act - plan
        o.append(txt(740, mid, f"{diff:+d}" if diff else "0", 18.5,
                     weight="bold",
                     fill=ACCENT if diff < 0 else (BRAND if diff else MUTED),
                     anchor="middle"))
        for j, line in enumerate(fact_lines):
            o.append(txt(820, y + 32 + j * 25, line, 17, fill=INK))
        y += rh

    total_diff = D.MEETING["actual"] - D.MEETING["plan"]
    o.append(rect(PAD, y, W - 2 * PAD, 52, fill=CARD_BG2, rx=8))
    o += [txt(PAD + 18, y + 34, "รวมถ่วงน้ำหนัก", 19, weight="bold", fill=INK),
          txt(470, y + 34, "100%", 18, weight="bold", fill=INK,
              anchor="middle"),
          txt(560, y + 34, str(D.MEETING["plan"]), 18, weight="bold", fill=INK,
              anchor="middle"),
          txt(645, y + 34, str(D.MEETING["actual"]), 20, weight="bold",
              fill=BRAND, anchor="middle"),
          txt(740, y + 34, f"{total_diff:+d}" if total_diff else "0", 19,
              weight="bold",
              fill=ACCENT if total_diff < 0 else (BRAND if total_diff
                                                  else MUTED),
              anchor="middle")]

    # กล่องข้อสังเกตสูงตามจำนวนบรรทัดจริง ไม่ใช่ยืดเต็มที่ว่างที่เหลือ
    note_runs = [("มิติที่ต้องเฝ้าระวัง — ", "bold"),
                 (D.DIM_NOTE, "regular")]
    note_w = W - 2 * PAD - 48
    nh = lines_of(note_runs, 18, note_w) * 27 + 34
    ny = y + 76
    o.append(rect(PAD, ny, W - 2 * PAD, nh, fill=tint(ACCENT, 0.94), rx=10))
    o.append(rect(PAD, ny, 5, nh, fill=ACCENT, rx=2.5))
    note, _ = para(PAD + 24, ny + 32, note_runs, 18, note_w, 27)
    o += note
    return svg(o)


# ============================================ 04 · §5 กราฟเทียบแผน
def slide_curve() -> str:
    o = deco() + chrome("Planned vs Actual", "กราฟความก้าวหน้าเทียบแผน", 5, 4)

    cx0, cx1 = 150, 1040
    cy0, cy1 = 762, 240          # cy0 = 0% · cy1 = 100%
    wk_max = D.PLAN_CURVE[-1][0]

    def px(week: float) -> float:
        return cx0 + week / wk_max * (cx1 - cx0)

    def py(pct: float) -> float:
        return cy0 - pct / 100 * (cy0 - cy1)

    # ช่วงที่เดินมาแล้ว ระบายจาง ๆ ให้เห็นว่ากราฟส่วนที่เหลือเป็นแผนล้วน
    o.append(rect(cx0, cy1, px(D.ACTUAL_CURVE[-1][0]) - cx0, cy0 - cy1,
                  fill=BRAND, opacity=0.05))

    for v in range(0, 101, 20):
        o.append(f'<line x1="{cx0}" y1="{py(v)}" x2="{cx1}" y2="{py(v)}" '
                 f'stroke="{LINE}" stroke-width="1"/>')
        o.append(txt(cx0 - 14, py(v) + 6, str(v), 15, fill=MUTED, anchor="end"))
    # คำอธิบายแกนตั้งวางสูงกว่าป้าย Sprint หนึ่งชั้น — ถ้าอยู่ระดับเดียวกัน
    # จะชนกับป้าย S0 ซึ่งอยู่ชิดแกนตั้งพอดี
    o.append(txt(cx0 - 38, cy1 - 58, "% ความก้าวหน้าสะสม", 16, fill=MUTED))

    for wk, label in D.CURVE_TICKS:
        o.append(f'<line x1="{px(wk)}" y1="{cy1-16}" x2="{px(wk)}" y2="{cy0}" '
                 f'stroke="{LINE}" stroke-width="1" stroke-dasharray="4 5"/>')
        o.append(txt(px(wk), cy0 + 30, label, 15, fill=MUTED, anchor="middle"))
    for wk, label in D.CURVE_BANDS:
        o.append(txt(px(wk), cy1 - 26, label, 17, weight="bold", fill=MUTED,
                     anchor="middle", family=MONO))

    o.append(f'<line x1="{cx0}" y1="{cy0}" x2="{cx1}" y2="{cy0}" '
             f'stroke="{INK}" stroke-width="1.6"/>')

    plan_pts = " ".join(f"{px(w):.1f},{py(p):.1f}" for w, p in D.PLAN_CURVE)
    o.append(f'<polyline points="{plan_pts}" fill="none" stroke="{MUTED}" '
             f'stroke-width="2.6" stroke-dasharray="9 7"/>')
    for w, p in D.PLAN_CURVE:
        o.append(f'<circle cx="{px(w):.1f}" cy="{py(p):.1f}" r="4.5" '
                 f'fill="{MUTED}"/>')

    act_pts = " ".join(f"{px(w):.1f},{py(p):.1f}" for w, p in D.ACTUAL_CURVE)
    o.append(f'<polyline points="{act_pts}" fill="none" stroke="{BRAND}" '
             f'stroke-width="4.5" stroke-linejoin="round"/>')
    for w, p in D.ACTUAL_CURVE:
        o.append(f'<circle cx="{px(w):.1f}" cy="{py(p):.1f}" r="6" '
                 f'fill="{BRAND}"/>')

    # ป้ายจุดปัจจุบัน — วางเหนือจุด เพราะพื้นที่เหนือเส้นช่วงนี้ยังว่าง
    lw, lp = D.ACTUAL_CURVE[-1]
    o.append(f'<circle cx="{px(lw):.1f}" cy="{py(lp):.1f}" r="11" fill="none" '
             f'stroke="{BRAND}" stroke-width="2.5"/>')
    o += [txt(px(lw) + 26, py(lp) - 58, D.MEETING["date_short"], 18,
              weight="bold", fill=BRAND),
          txt(px(lw) + 26, py(lp) - 32, f'ผลจริง {D.MEETING["actual"]}% '
              f'เทียบแผน {D.MEETING["plan"]}%', 18, fill=INK),
          f'<line x1="{px(lw)+16:.1f}" y1="{py(lp)-24:.1f}" '
          f'x2="{px(lw)+6:.1f}" y2="{py(lp)-12:.1f}" stroke="{BRAND}" '
          f'stroke-width="1.5"/>']

    lx, ly = 700, 660
    o.append(rect(lx, ly, 330, 74, fill="#FFFFFF", rx=10, stroke=LINE))
    o += [f'<line x1="{lx+22}" y1="{ly+26}" x2="{lx+64}" y2="{ly+26}" '
          f'stroke="{MUTED}" stroke-width="2.6" stroke-dasharray="9 7"/>',
          txt(lx + 78, ly + 32, "แผน (Planned)", 17, fill=MUTED),
          f'<line x1="{lx+22}" y1="{ly+54}" x2="{lx+64}" y2="{ly+54}" '
          f'stroke="{BRAND}" stroke-width="4.5"/>',
          txt(lx + 78, ly + 60, "ผลจริง (Actual)", 17, weight="bold",
              fill=INK)]

    nx, nw = 1100, RIGHT - 1100
    ny = 178
    for head, body in D.CURVE_NOTES:
        blines = wrap(body, 17, nw - 44)
        bh = 44 + len(blines) * 25 + 22
        o.append(rect(nx, ny, nw, bh, fill=CARD_BG, rx=12))
        o.append(txt(nx + 22, ny + 34, head, 18.5, weight="bold", fill=BRAND))
        for i, line in enumerate(blines):
            o.append(txt(nx + 22, ny + 62 + i * 25, line, 17, fill=INK))
        ny += bh + 18
    return svg(o)


# ============================================ 05 · §7 ภาพรวมผลงาน
def slide_delivered_overview() -> str:
    o = deco() + chrome("Delivered", "ผลงานที่ส่งมอบแล้ว", 7, 5)
    o.append(txt(PAD, BODY + 22, "รายงานเฉพาะสิ่งที่ทำงานได้จริง "
                 "และตรวจสอบได้ในระบบจัดเก็บโค้ด ไม่รวมกิจกรรมระหว่างดำเนินงาน",
                 20, fill=MUTED))

    n = len(D.DELIVERED_OVERVIEW)
    gap = 20
    cw = (W - 2 * PAD - gap * (n - 1)) / n

    # จัดวางจากจำนวนบรรทัด "มากที่สุด" ของทั้งสี่ใบ แทนที่จะยืดการ์ดให้สูงเท่ากัน
    # แล้วดันตัวเลขไปติดขอบล่าง — วิธีหลังทำให้ใบที่ข้อความสั้นมีช่องโหว่กลางการ์ด
    wrapped = [(wrap(t, 27, cw - 56, weight="bold"), wrap(d, 20, cw - 56),
                wrap(mt, 19, cw - 40)) for t, d, mt in D.DELIVERED_OVERVIEW]
    t_max = max(len(w[0]) for w in wrapped)
    d_max = max(len(w[1]) for w in wrapped)
    m_max = max(len(w[2]) for w in wrapped)

    head_h, t_lh, d_lh, m_lh = 212, 36, 30, 26
    rule_off = head_h + t_max * t_lh + 16 + d_max * d_lh + 34
    metric_off = rule_off + 38
    card_h = metric_off + m_max * m_lh + 24
    # การ์ดสูงตามเนื้อหา แล้ววางกึ่งกลางพื้นที่ที่เหลือ ที่ว่างบน–ล่างจึงเท่ากัน
    top = 236 + max(0, (812 - 236 - card_h) / 2)

    for i, (title_lines, desc_lines, metric_lines) in enumerate(wrapped):
        x = PAD + i * (cw + gap)
        cxx = x + cw / 2
        o.append(rect(x, top, cw, card_h, fill=CARD_BG, rx=16))
        o.append(f'<circle cx="{cxx}" cy="{top+100}" r="52" fill="{BRAND}"/>')
        o.append(txt(cxx, top + 120, str(i + 1), 50, weight="bold",
                     fill="#FFFFFF", anchor="middle", family=MONO))

        ty = top + head_h
        for line in title_lines:
            o.append(txt(cxx, ty, line, 27, weight="bold", fill=INK,
                         anchor="middle"))
            ty += t_lh
        ty = top + head_h + t_max * t_lh + 16
        for line in desc_lines:
            o.append(txt(cxx, ty, line, 20, fill=INK, anchor="middle"))
            ty += d_lh

        o.append(f'<line x1="{x+28}" y1="{top+rule_off}" x2="{x+cw-28}" '
                 f'y2="{top+rule_off}" stroke="{BRAND}" stroke-width="1" '
                 f'opacity="0.3"/>')
        my = top + metric_off
        for line in metric_lines:
            o.append(txt(cxx, my, line, 19, weight="bold", fill=BRAND,
                         anchor="middle"))
            my += m_lh
    return svg(o)


def _detail_slide(en: str, th: str, page: int, items: list[tuple[str, str]],
                  size: float = 19.5, lh: float = 28) -> str:
    """สไลด์รายละเอียดฝั่งเดียว: หัวข้อย่อยเป็นรายการเดียวเต็มหน้า"""
    o = deco() + chrome(en, th, 7, page)
    tw = RIGHT - PAD - 42

    y = BODY + 30
    room = RULE_Y - 30 - y
    used = sum(lines_of([(lead, "bold"), (" " + body, "regular")], size, tw)
               * lh + 16 for lead, body in items)
    # เกลี่ยที่ว่างที่เหลือลงช่องไฟระหว่างข้อ ไม่ใช่ขยายตัวอักษร — ขนาดตัวอักษร
    # คือสิ่งที่ทำให้อ่านออกจากท้ายห้อง จึงตรึงไว้ แล้วให้ระยะห่างเป็นตัวปรับ
    space = max(4, (room - used + 16 * len(items)) / max(1, len(items)))

    for lead, body in items:
        runs = [(lead, "bold"), (" " + body, "regular")]
        o.append(bullet(PAD + 8, y - 7, 4.5, BRAND))
        parts, y = para(PAD + 28, y, runs, size, tw, lh)
        o += parts
        y += space
    return svg(o)


# ============================================ 06 · §7 Back-End
def slide_backend() -> str:
    return _detail_slide("Back-End", "ผลงานที่ส่งมอบแล้ว — ฝั่ง Back-End", 6,
                         D.BACKEND)


# ============================================ 07 · §7 Front-End
def slide_frontend() -> str:
    return _detail_slide("Front-End", "ผลงานที่ส่งมอบแล้ว — ฝั่ง Front-End", 7,
                         D.FRONTEND)


# ============================================ 08 · §7 เครื่องมือ + เอกสาร
def slide_tooling_docs() -> str:
    o = deco() + chrome("Tooling & Docs",
                        "ผลงานที่ส่งมอบแล้ว — เครื่องมือ กระบวนการ และเอกสาร",
                        7, 8)
    gap = 40
    cw = (W - 2 * PAD - gap) / 2
    columns = [("เครื่องมือและกระบวนการ", D.TOOLING),
               ("เอกสารและการออกแบบ", D.DOCS)]
    tw = cw - 44
    top = BODY + 104

    for i, (head, items) in enumerate(columns):
        x = PAD + i * (cw + gap)
        o.append(rect(x, BODY, cw, 60, fill=BRAND, rx=10))
        o.append(txt(x + 24, BODY + 40, head, 23, weight="bold", fill="#FFFFFF"))

        # ช่องไฟคงที่ทั้งสองคอลัมน์ ไม่เกลี่ยให้ยาวเท่ากัน — คอลัมน์ซ้ายมีแค่ 3 ข้อ
        # ถ้ายืดให้จบพร้อมคอลัมน์ขวา ช่องไฟจะกว้างจนอ่านไม่ออกว่าข้อไหนคู่กับข้อไหน
        # ปล่อยให้ซ้ายจบก่อนแล้วเหลือที่ว่างด้านล่างอ่านง่ายกว่า
        y = top
        for lead, body in items:
            runs = [(lead, "bold"), (" " + body, "regular")]
            o.append(bullet(x + 8, y - 7, 4, BRAND))
            parts, y = para(x + 26, y, runs, 20, tw, 30)
            o += parts
            y += 44
    return svg(o)


# ------------------------------------------------------------------------ main
SLIDES = [
    ("00-cover", slide_cover),
    ("01-sprint-roadmap", slide_roadmap),
    ("02-dimension-chart", slide_dimension_chart),
    ("03-dimension-table", slide_dimension_table),
    ("04-plan-vs-actual", slide_curve),
    ("05-delivered-overview", slide_delivered_overview),
    ("06-delivered-backend", slide_backend),
    ("07-delivered-frontend", slide_frontend),
    ("08-delivered-tooling-docs", slide_tooling_docs),
]


def main() -> int:
    require_raqm()
    OUT.mkdir(exist_ok=True)
    want_png = "--png" in sys.argv
    for name, fn in SLIDES:
        path = OUT / f"{name}.svg"
        path.write_text(fn(), encoding="utf-8")
        print(f"  {name}.svg")
        if want_png:
            from svg_to_png import render
            render(path, path.with_suffix(".png"), scale=2.0)
    print(f"\nเสร็จ: {len(SLIDES)} สไลด์ ที่ {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
