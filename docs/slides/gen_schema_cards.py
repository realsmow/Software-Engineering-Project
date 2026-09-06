#!/usr/bin/env python3
"""สร้างการ์ด schema แยกตาม feature เป็น SVG + PNG สำหรับแปะสไลด์ Canva

รันจาก docs/ :  python3 slides/gen_schema_cards.py
ผลลัพธ์:        slides/schema-cards/{01-accounts,…}.svg / .png / .md
                slides/schema-cards/00-overview.svg / .png

ทำไมถึงเขียน SVG เอง แทนที่จะใช้ mermaid หรือ graphviz
  เครื่องนี้ไม่มี mermaid-cli และไม่มี graphviz ติดตั้งไว้ (มีแต่ Inkscape กับ
  ImageMagick) การเขียน SVG ตรง ๆ จึงทั้งไม่ต้องลงอะไรเพิ่ม และคุมสไตล์ได้
  ละเอียดกว่า — สำคัญเพราะงานนี้ต้องออกมาสวยพอจะแปะสไลด์นำเสนอได้เลย
"""

from __future__ import annotations

from pathlib import Path

from schema_data import GROUPS, TABLES
from slide_theme import (INK, LINE, MARGIN, MONO, MONO_CH, MUTED, PANEL,
                         ROW_ALT, SCALE, THAI, TITLE_H, esc, find_rsvg,
                         rasterize, text_w, tint)

# ----------------------------------------------------------------- ค่าคงที่การวาด
# หน่วยทั้งหมดเป็น px ที่ 96 dpi (หน่วยผู้ใช้ของ SVG) แล้วค่อย export PNG ที่ 2x
CARD_W = 430          # ความกว้างการ์ด
ROW_H = 26            # ความสูงหนึ่งแถวฟิลด์
HEAD_H = 50           # ความสูงหัวการ์ด (ชื่อตาราง + คำอธิบายไทย)
COL_GAP = 132         # ช่องว่างระหว่างคอลัมน์ — เผื่อที่ให้เส้น FK วิ่ง
ROW_GAP = 30          # ช่องว่างแนวตั้งระหว่างการ์ด
# MARGIN / TITLE_H / SCALE / พาเลตต์ / ฟอนต์ อยู่ใน slide_theme (ใช้ร่วมกับสไลด์ชุดอื่น)
# ส้มของเด็ค (#FD914D) อ่อนเกินกว่าจะใส่ตัวอักษรขาว จึงเข้มลงให้ได้ 5.5:1
PK_GOLD = "#9E5714"   # สีป้าย PK — ใช้เฉพาะการ์ด schema จึงไม่ได้อยู่ในธีมร่วม

# ------------------------------------------------------------------ เลย์เอาต์
def card_height(name: str) -> float:
    """ความสูงของการ์ด — คำนวณได้ก่อนวาง จึงใช้บาลานซ์ความสูงของคอลัมน์ล่วงหน้าได้"""
    return HEAD_H + len(TABLES[name][1]) * ROW_H + 6


class Card:
    """การ์ดหนึ่งใบ = หนึ่งตาราง พร้อมพิกัดหลังจัดวางแล้ว"""

    def __init__(self, name: str, x: float, y: float, col: int, last_col: int):
        self.name = name
        self.desc, self.fields = TABLES[name]
        self.x, self.y = x, y
        self.col, self.last_col = col, last_col
        self.h = card_height(name)

    def row_y(self, idx: int) -> float:
        """กึ่งกลางแนวตั้งของแถวฟิลด์ลำดับ idx — จุดออกของเส้น FK"""
        return self.y + HEAD_H + idx * ROW_H + ROW_H / 2

    @property
    def head_mid(self) -> float:
        return self.y + HEAD_H / 2


def layout(group) -> tuple[dict[str, Card], float, float]:
    """วางการ์ดตามคอลัมน์ที่กำหนดไว้ใน GROUPS แล้วคืนขนาดผืนผ้าใบที่ต้องใช้"""
    ncols = len(group["columns"])
    col_h = [sum(card_height(n) for n in col) + ROW_GAP * (len(col) - 1)
             for col in group["columns"]]
    tallest = max(col_h)

    cards: dict[str, Card] = {}
    for ci, col in enumerate(group["columns"]):
        x = MARGIN + ci * (CARD_W + COL_GAP)
        # คอลัมน์ที่เตี้ยกว่าถูกจัดกึ่งกลางแนวตั้ง ที่ว่างจะได้กระจายบน–ล่างเท่ากัน
        # แทนที่จะไปกองอยู่มุมล่างขวาจนสไลด์ดูเหมือนยังทำไม่เสร็จ
        y = TITLE_H + (tallest - col_h[ci]) / 2
        for name in col:
            card = Card(name, x, y, ci, ncols - 1)
            cards[name] = card
            y += card.h + ROW_GAP

    width = MARGIN * 2 + ncols * CARD_W + (ncols - 1) * COL_GAP
    height = TITLE_H + tallest + MARGIN
    return cards, width, height


# -------------------------------------------------------------- ชิ้นส่วน SVG
def draw_card(card: Card, accent: str, inside: set[str]) -> list[str]:
    """วาดการ์ดหนึ่งใบ; `inside` = ชื่อตารางที่อยู่ในกลุ่มนี้ (FK ถึงกันจะวาดเป็นเส้น)"""
    x, y, w = card.x, card.y, CARD_W
    o: list[str] = []

    # เงาวาดเองเป็นสี่เหลี่ยมซ้อนโปร่งแสง แทนที่จะใช้ <filter feDropShadow>
    # เพราะตัวเรนเดอร์ SVG หลายตัว (รวมของ ImageMagick) ไม่รองรับ filter
    o.append(f'<rect x="{x+2}" y="{y+4}" width="{w-4}" height="{card.h}" rx="10" '
             f'fill="#0A1F1D" opacity="0.05"/>')
    o.append(f'<rect x="{x+1}" y="{y+2}" width="{w-2}" height="{card.h}" rx="10" '
             f'fill="#0A1F1D" opacity="0.05"/>')
    o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{card.h}" rx="10" '
             f'fill="{PANEL}" stroke="{LINE}"/>')

    # --- หัวการ์ด: มุมบนโค้ง มุมล่างเหลี่ยม จึงใช้ path แทน rect
    o.append(f'<path d="M{x} {y+10} a10 10 0 0 1 10 -10 h{w-20} a10 10 0 0 1 10 10 '
             f'v{HEAD_H-10} h{-w} z" fill="{accent}"/>')
    o.append(f'<text x="{x+16}" y="{y+21}" font-family="{MONO}" font-size="14.5" '
             f'font-weight="700" fill="#FFFFFF">{esc(card.name)}</text>')
    o.append(f'<text x="{x+16}" y="{y+39}" font-family="{THAI}" font-size="12" '
             f'fill="#FFFFFF" opacity="0.85">{esc(card.desc)}</text>')

    # --- แถวฟิลด์
    for i, (fname, ftype, key, ref) in enumerate(card.fields):
        top = y + HEAD_H + i * ROW_H
        mid = top + ROW_H / 2 + 4.2          # +4.2 = ชดเชย baseline ของ 12.5px
        if i % 2 == 1:
            o.append(f'<rect x="{x+1}" y="{top}" width="{w-2}" height="{ROW_H}" '
                     f'fill="{ROW_ALT}"/>')

        # ป้ายคีย์: PK เป็นป้ายทึบ, FK เป็นป้ายโปร่งขอบสีเน้น
        if key == "PK":
            o.append(f'<rect x="{x+13}" y="{top+6}" width="26" height="14" rx="4" '
                     f'fill="{PK_GOLD}"/>'
                     f'<text x="{x+26}" y="{top+16.5}" font-family="{MONO}" '
                     f'font-size="9" font-weight="700" fill="#FFFFFF" '
                     f'text-anchor="middle">PK</text>')
        elif key == "FK":
            o.append(f'<rect x="{x+13}" y="{top+6}" width="26" height="14" rx="4" '
                     f'fill="none" stroke="{accent}" stroke-width="1.2"/>'
                     f'<text x="{x+26}" y="{top+16.5}" font-family="{MONO}" '
                     f'font-size="9" font-weight="700" fill="{accent}" '
                     f'text-anchor="middle">FK</text>')

        weight = "600" if key == "PK" else "400"
        o.append(f'<text x="{x+48}" y="{mid}" font-family="{MONO}" font-size="12.5" '
                 f'font-weight="{weight}" fill="{INK}">{esc(fname)}</text>')

        # FK ที่ชี้ออกนอกกลุ่ม วาดเส้นไม่ได้ จึงกำกับปลายทางไว้ข้างชื่อฟิลด์
        if ref and ref not in inside:
            rx = x + 48 + text_w(fname, 12.5) + 10
            o.append(f'<text x="{rx}" y="{mid}" font-family="{MONO}" font-size="10.5" '
                     f'fill="{MUTED}">&#8594; {esc(ref)}</text>')

        o.append(f'<text x="{x+w-14}" y="{mid}" font-family="{MONO}" font-size="11" '
                 f'fill="{MUTED}" text-anchor="end">{esc(ftype)}</text>')

        if i:
            o.append(f'<line x1="{x+13}" y1="{top}" x2="{x+w-13}" y2="{top}" '
                     f'stroke="{LINE}" stroke-width="0.8"/>')
    return o


def draw_fk_edge(src: Card, idx: int, dst: Card, accent: str) -> str:
    """เส้นโค้งจากแถว FK ไปยังหัวการ์ดปลายทาง (ทั้งคู่ต้องอยู่ในกลุ่มเดียวกัน)

    เส้นจบในแนวนอนเสมอ (จุดควบคุมตัวท้ายอยู่ระดับเดียวกับปลายทาง) หัวลูกศรจึง
    วาดเป็นสามเหลี่ยมแนวนอนตรง ๆ ได้ ไม่ต้องพึ่ง <marker orient="auto">
    """
    sy, dy = src.row_y(idx), dst.head_mid
    head = 9                                # ความยาวหัวลูกศร

    if dst.col > src.col:                   # ปลายทางอยู่คอลัมน์ขวา
        sx, ex, into = src.x + CARD_W, dst.x, 1
        c1, c2 = sx + 55, ex - 55
    elif dst.col < src.col:                 # ปลายทางอยู่คอลัมน์ซ้าย
        sx, ex, into = src.x, dst.x + CARD_W, -1
        c1, c2 = sx - 55, ex + 55
    else:
        # คอลัมน์เดียวกัน — อ้อมออกด้านที่มีช่องว่างระหว่างคอลัมน์ ไม่ให้ล้นขอบกระดาษ
        bulge = 52 + abs(sy - dy) * 0.08
        if src.col < src.last_col:          # มีคอลัมน์ถัดไป จึงอ้อมขวา
            sx, ex, into = src.x + CARD_W, dst.x + CARD_W, -1
            c1 = c2 = sx + bulge
        else:                               # คอลัมน์สุดท้าย อ้อมซ้ายเข้าช่องว่าง
            sx, ex, into = src.x, dst.x, 1
            c1 = c2 = sx - bulge

    tip = ex                                # ปลายหัวลูกศรแตะขอบการ์ด
    end = ex - head * into                  # เส้นหยุดก่อนหัวลูกศร ไม่ให้ทะลุออกมา
    return (f'<path d="M{sx} {sy} C{c1} {sy} {c2} {dy} {end} {dy}" fill="none" '
            f'stroke="{accent}" stroke-width="1.6" opacity="0.7"/>'
            f'<path d="M{tip} {dy} L{end} {dy-4.5} L{end} {dy+4.5} z" '
            f'fill="{accent}" opacity="0.7"/>'
            f'<circle cx="{sx}" cy="{sy}" r="3.2" fill="{accent}" opacity="0.7"/>')


def render_group(group) -> str:
    cards, w, h = layout(group)
    inside = set(cards)
    accent = group["accent"]
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
         f'viewBox="0 0 {w} {h}">',
         f'<rect x="0" y="0" width="{w}" height="{h}" rx="14" fill="{PANEL}"/>']

    # --- หัวเรื่อง: แถบสีเน้น + ชื่อกลุ่มไทย/อังกฤษ + ประโยคสรุปแนวคิด
    o.append(f'<rect x="{MARGIN}" y="30" width="5" height="40" rx="2.5" fill="{accent}"/>')
    o.append(f'<text x="{MARGIN+18}" y="48" font-family="{THAI}" font-size="21" '
             f'font-weight="700" fill="{INK}">{esc(group["th"])}</text>')
    o.append(f'<text x="{MARGIN+18}" y="66" font-family="{MONO}" font-size="11.5" '
             f'fill="{accent}" letter-spacing="0.6">{esc(group["en"].upper())}</text>')
    o.append(f'<text x="{w-MARGIN}" y="48" font-family="{THAI}" font-size="12.5" '
             f'fill="{MUTED}" text-anchor="end">{esc(group["note"])}</text>')
    o.append(f'<text x="{w-MARGIN}" y="66" font-family="{THAI}" font-size="11" '
             f'fill="{MUTED}" text-anchor="end">'
             f'{len(inside)} ตาราง &#183; ULMs Database Design v4</text>')

    # เส้น FK วาดก่อนการ์ด เพื่อให้การ์ดทับหัวลูกศรส่วนเกิน ไม่ให้ดูรก
    edges = [draw_fk_edge(c, i, cards[ref], accent)
             for c in cards.values()
             for i, (_, _, key, ref) in enumerate(c.fields)
             if key == "FK" and ref in inside and ref != c.name]
    o.extend(edges)
    for card in cards.values():
        o.extend(draw_card(card, accent, inside))

    o.append('</svg>')
    return "\n".join(o)


# -------------------------------------------------------- สไลด์ภาพรวม 9 กลุ่ม
def render_overview() -> str:
    box_w, box_h, gap = 330, 176, 26
    cols = 3
    w = MARGIN * 2 + cols * box_w + (cols - 1) * gap
    rows = (len(GROUPS) + cols - 1) // cols
    h = TITLE_H + rows * (box_h + gap) - gap + MARGIN

    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
         f'viewBox="0 0 {w} {h}">',
         f'<rect x="0" y="0" width="{w}" height="{h}" rx="14" fill="{PANEL}"/>',
         f'<text x="{MARGIN}" y="50" font-family="{THAI}" font-size="23" '
         f'font-weight="700" fill="{INK}">ภาพรวมฐานข้อมูล ULMs — 33 ตาราง 9 กลุ่ม</text>',
         f'<text x="{MARGIN}" y="72" font-family="{THAI}" font-size="12.5" '
         f'fill="{MUTED}">แบ่งกลุ่มตามฟีเจอร์ที่ตารางรับผิดชอบ '
         f'(Database Design v4)</text>']

    for i, g in enumerate(GROUPS):
        bx = MARGIN + (i % cols) * (box_w + gap)
        by = TITLE_H + (i // cols) * (box_h + gap)
        names = [n for col in g["columns"] for n in col]
        o.append(f'<rect x="{bx+1}" y="{by+3}" width="{box_w-2}" height="{box_h}" '
                 f'rx="10" fill="#0A1F1D" opacity="0.06"/>')
        o.append(f'<rect x="{bx}" y="{by}" width="{box_w}" '
                 f'height="{box_h}" rx="10" fill="{PANEL}" stroke="{LINE}"/>')
        o.append(f'<rect x="{bx}" y="{by}" width="{box_w}" height="4" rx="2" '
                 f'fill="{g["accent"]}"/>')
        o.append(f'<text x="{bx+18}" y="{by+32}" font-family="{MONO}" font-size="11" '
                 f'font-weight="700" fill="{g["accent"]}">'
                 f'{g["id"].split("-")[0]}</text>')
        o.append(f'<text x="{bx+18}" y="{by+54}" font-family="{THAI}" font-size="15.5" '
                 f'font-weight="700" fill="{INK}">{esc(g["th"])}</text>')
        for j, n in enumerate(names):
            o.append(f'<text x="{bx+18}" y="{by+78+j*18}" font-family="{MONO}" '
                     f'font-size="11.5" fill="#3C4B49">&#183; {esc(n)}</text>')
    o.append('</svg>')
    return "\n".join(o)


# ------------------------------------------- แผนที่ความสัมพันธ์ระดับกลุ่ม
# สไลด์เปิดหัวข้อ: 9 กลุ่ม + เส้นความสัมพันธ์ที่ยุบระดับกลุ่มแล้ว
# FK รายตาราง 58 เส้นวาดบนภาพเดียวแล้วอ่านไม่ออก จึงยุบคู่ที่อยู่กลุ่มเดียวกัน
# เหลือ 22 เส้น ความหนาของเส้นบอกจำนวน FK ระหว่างสองกลุ่มนั้น
# โซนวางบนตาราง 4 คอลัมน์ x 3 แถว เรียงตามเลขกลุ่ม 01->09 ซึ่งเป็นลำดับเดียวกับ
# สไลด์ 01-09 ที่จะพูดต่อ และบังเอิญให้เส้นรวมสั้นกว่าผัง lifecycle 2x5 ราว 20%
MAP_NODE_W = 250      # ความกว้างกล่องกลุ่ม
MAP_HEAD_H = 34       # แถบหัวกล่อง (เลขกลุ่ม + ชื่อย่อ)
MAP_LINE_H = 22       # ระยะบรรทัดของรายชื่อตาราง
MAP_COL_GAP = 150
MAP_ROW_GAP = 90
EDGE_INK = "#4E6B67"  # สีเส้น — กลาง ๆ เพื่อไม่ไปแย่งความหมายของสีกลุ่ม


def border_point(cx, cy, hw, hh, tx, ty):
    """จุดที่เส้นตรงจากกลางกล่องไปหา (tx,ty) ตัดขอบกล่อง — เส้นจะได้แตะขอบพอดี"""
    dx, dy = tx - cx, ty - cy
    if not dx and not dy:
        return cx, cy
    scale = min(hw / abs(dx) if dx else 1e9, hh / abs(dy) if dy else 1e9)
    return cx + dx * scale, cy + dy * scale


def group_edges():
    """ยุบ FK รายตารางเป็นความสัมพันธ์ระดับกลุ่ม

    คืน {(กลุ่มA, กลุ่มB): (จำนวน FK, ชี้จาก A ไป B ไหม, ชี้จาก B ไป A ไหม)}
    โดย A/B เรียงตามชื่อเสมอ เพื่อให้คู่เดียวกันรวมเป็นรายการเดียว
    """
    zone = {n: g["id"] for g in GROUPS for c in g["columns"] for n in c}
    out: dict[tuple[str, str], list] = {}
    seen: set[tuple[str, str]] = set()
    for src, (_, fields) in TABLES.items():
        for _, _, key, ref in fields:
            if key != "FK" or not ref or ref == src or (src, ref) in seen:
                continue
            seen.add((src, ref))
            za, zb = zone[src], zone[ref]
            if za == zb:                      # อยู่กลุ่มเดียวกัน วาดในสไลด์ย่อยแล้ว
                continue
            k = tuple(sorted((za, zb)))
            e = out.setdefault(k, [0, False, False])
            e[0] += 1
            e[1 if za == k[0] else 2] = True  # จำทิศทางไว้ทั้งสองฝั่ง
    return out


def render_map() -> str:
    nodes, node_h = {}, {}
    for g in GROUPS:
        names = g.get("map_order") or [n for c in g["columns"] for n in c]
        node_h[g["id"]] = MAP_HEAD_H + len(names) * MAP_LINE_H + 14
        nodes[g["id"]] = dict(g=g, names=names)

    rows = {r: [g["id"] for g in GROUPS if g["slot"][1] == r] for r in (0, 1, 2)}
    row_h = {r: max(node_h[i] for i in ids) for r, ids in rows.items()}
    row_y, y = {}, TITLE_H
    for r in (0, 1, 2):
        row_y[r] = y
        y += row_h[r] + MAP_ROW_GAP

    for gid, n in nodes.items():
        col, row = n["g"]["slot"]
        n["x"] = MARGIN + col * (MAP_NODE_W + MAP_COL_GAP)
        n["y"] = row_y[row]
        n["h"] = node_h[gid]

    width = MARGIN * 2 + 4 * MAP_NODE_W + 3 * MAP_COL_GAP
    height = row_y[2] + row_h[2] + MARGIN
    edges = group_edges()
    n_fk = len({(t, r) for t, (_, f) in TABLES.items()
                for _, _, k, r in f if k == "FK" and r and r != t})

    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" '
         f'height="{height}" viewBox="0 0 {width} {height}">',
         f'<rect x="0" y="0" width="{width}" height="{height}" rx="14" '
         f'fill="{PANEL}"/>',
         f'<rect x="{MARGIN}" y="30" width="5" height="40" rx="2.5" fill="#16726D"/>',
         f'<text x="{MARGIN+18}" y="48" font-family="{THAI}" font-size="21" '
         f'font-weight="700" fill="{INK}">ภาพรวมความสัมพันธ์ของฐานข้อมูล ULMs</text>',
         f'<text x="{MARGIN+18}" y="66" font-family="{MONO}" font-size="11.5" '
         f'fill="#16726D" letter-spacing="0.6">33 TABLES · 9 GROUPS · '
         f'DATABASE DESIGN V4</text>',
         f'<text x="{width-MARGIN}" y="48" font-family="{THAI}" font-size="12.5" '
         f'fill="{MUTED}" text-anchor="end">ความหนาของเส้น = จำนวน Foreign Key '
         f'ที่เชื่อมสองกลุ่มนั้น</text>',
         f'<text x="{width-MARGIN}" y="66" font-family="{THAI}" font-size="11" '
         f'fill="{MUTED}" text-anchor="end">อ่านไล่ตามเลขกลุ่ม 01–09 '
         f'ซึ่งเป็นลำดับเดียวกับสไลด์ถัดไป</text>']

    # --- เส้น (วาดก่อนกล่อง กล่องทึบจะได้ทับปลายเส้นที่เกินเข้ามา)
    for (a, b), (cnt, a2b, b2a) in edges.items():
        na, nb = nodes[a], nodes[b]
        acx, acy = na["x"] + MAP_NODE_W / 2, na["y"] + na["h"] / 2
        bcx, bcy = nb["x"] + MAP_NODE_W / 2, nb["y"] + nb["h"] / 2
        sx, sy = border_point(acx, acy, MAP_NODE_W / 2, na["h"] / 2, bcx, bcy)
        ex, ey = border_point(bcx, bcy, MAP_NODE_W / 2, nb["h"] / 2, acx, acy)
        dx, dy = ex - sx, ey - sy
        dist = (dx * dx + dy * dy) ** 0.5 or 1
        ux, uy = dx / dist, dy / dist
        wdt = 1.6 + 1.35 * cnt
        head = 11 if cnt > 1 else 9

        # ร่นปลายเข้ามาเท่าความยาวหัวลูกศรของฝั่งที่มีลูกศร
        s2x, s2y = (sx + ux * head, sy + uy * head) if b2a else (sx, sy)
        e2x, e2y = (ex - ux * head, ey - uy * head) if a2b else (ex, ey)
        o.append(f'<line x1="{s2x:.1f}" y1="{s2y:.1f}" x2="{e2x:.1f}" '
                 f'y2="{e2y:.1f}" stroke="{EDGE_INK}" stroke-width="{wdt:.1f}" '
                 f'opacity="0.7" stroke-linecap="round"/>')
        for tip, base, sign in (((ex, ey), (e2x, e2y), a2b),
                                ((sx, sy), (s2x, s2y), b2a)):
            if not sign:
                continue
            bw = head * 0.45
            o.append(f'<path d="M{tip[0]:.1f} {tip[1]:.1f} '
                     f'L{base[0]-uy*bw:.1f} {base[1]+ux*bw:.1f} '
                     f'L{base[0]+uy*bw:.1f} {base[1]-ux*bw:.1f} z" '
                     f'fill="{EDGE_INK}" opacity="0.7"/>')

        # ป้ายจำนวนเฉพาะคู่ที่เชื่อมกันมากกว่าหนึ่งเส้น — คู่ที่มีเส้นเดียวเห็นเองอยู่แล้ว
        if cnt > 1:
            mx, my = (sx + ex) / 2, (sy + ey) / 2
            o.append(f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="13" fill="{PANEL}" '
                     f'stroke="{EDGE_INK}" stroke-width="1.3" opacity="0.95"/>')
            o.append(f'<text x="{mx:.1f}" y="{my+4.5:.1f}" font-family="{MONO}" '
                     f'font-size="12.5" font-weight="700" fill="{EDGE_INK}" '
                     f'text-anchor="middle">{cnt}</text>')

    # --- กล่องกลุ่ม
    for gid, n in nodes.items():
        g, x, y, h = n["g"], n["x"], n["y"], n["h"]
        a = g["accent"]
        o.append(f'<rect x="{x+2}" y="{y+4}" width="{MAP_NODE_W-4}" height="{h}" '
                 f'rx="10" fill="#0A1F1D" opacity="0.05"/>')
        o.append(f'<rect x="{x}" y="{y}" width="{MAP_NODE_W}" height="{h}" rx="10" '
                 f'fill="{PANEL}" stroke="{tint(a, 0.62)}"/>')
        o.append(f'<path d="M{x} {y+10} a10 10 0 0 1 10 -10 h{MAP_NODE_W-20} '
                 f'a10 10 0 0 1 10 10 v{MAP_HEAD_H-10} h{-MAP_NODE_W} z" '
                 f'fill="{a}"/>')
        o.append(f'<text x="{x+14}" y="{y+23}" font-family="{MONO}" font-size="12" '
                 f'font-weight="700" fill="#FFFFFF" opacity="0.8">'
                 f'{g["id"].split("-")[0]}</text>')
        o.append(f'<text x="{x+42}" y="{y+23}" font-family="{THAI}" font-size="14.5" '
                 f'font-weight="700" fill="#FFFFFF">{esc(g["short"])}</text>')
        for i, name in enumerate(n["names"]):
            o.append(f'<text x="{x+16}" y="{y+MAP_HEAD_H+18+i*MAP_LINE_H}" '
                     f'font-family="{MONO}" font-size="12.5" fill="{INK}">'
                     f'{esc(name)}</text>')

    # --- คำอธิบาย วางในช่องที่เหลือของแถวล่าง
    lx = MARGIN + (MAP_NODE_W + MAP_COL_GAP)
    ly = row_y[2]
    lw = MAP_NODE_W * 3 + MAP_COL_GAP * 2
    o.append(f'<rect x="{lx}" y="{ly}" width="{lw}" height="{row_h[2]}" rx="10" '
             f'fill="#FAFCFC" stroke="{LINE}"/>')
    o.append(f'<text x="{lx+18}" y="{ly+26}" font-family="{THAI}" font-size="13.5" '
             f'font-weight="700" fill="{INK}">วิธีอ่านแผนภาพ</text>')
    for i, line in enumerate([
            f"ฐานข้อมูลมี Foreign Key ทั้งหมด {n_fk} เส้น "
            f"ในจำนวนนี้ {n_fk - sum(c for c, _, _ in edges.values())} เส้นเชื่อมกันเองภายในกลุ่ม",
            f"ที่เหลือถูกยุบเป็น {len(edges)} เส้นระหว่างกลุ่มในภาพนี้ "
            f"ตัวเลขในวงกลมคือจำนวน FK ของเส้นนั้น",
            "หัวลูกศรชี้ไปยังกลุ่มที่ถูกอ้างถึง เส้นที่มีหัวสองข้างคืออ้างถึงกันทั้งคู่",
            "รายละเอียดฟิลด์ของแต่ละตารางอยู่ในสไลด์ 01–09"]):
        o.append(f'<text x="{lx+18}" y="{ly+50+i*20}" font-family="{THAI}" '
                 f'font-size="11.5" fill="{MUTED}">{esc(line)}</text>')

    o.append('</svg>')
    return "\n".join(o)


# -------------------------------------------------------------- markdown ประกอบ
def render_md(group) -> str:
    names = [n for col in group["columns"] for n in col]
    out = [f'# {group["id"].split("-")[0]}. {group["th"]} ({group["en"]})', "",
           group["note"], ""]
    for n in names:
        desc, fields = TABLES[n]
        out += [f"## {n} — {desc}", "",
                "| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |", "|---|---|---|---|"]
        for fname, ftype, key, ref in fields:
            out.append(f"| {fname} | {ftype} | {key or ''} | {ref or ''} |")
        out.append("")
    return "\n".join(out)


# --------------------------------------------------------------- SVG -> PNG
# ------------------------------------------------------------------------ main
def main() -> int:
    outdir = Path(__file__).parent / "schema-cards"
    outdir.mkdir(parents=True, exist_ok=True)

    jobs = [(outdir / f'{g["id"]}.svg', render_group(g)) for g in GROUPS]
    jobs.append((outdir / "00-overview.svg", render_overview()))
    jobs.append((outdir / "00-map.svg", render_map()))
    for path, svg in jobs:
        path.write_text(svg, encoding="utf-8")
    for g in GROUPS:
        (outdir / f'{g["id"]}.md').write_text(render_md(g), encoding="utf-8")

    exe = find_rsvg()
    for path, _ in jobs:
        rasterize(exe, path, path.with_suffix(".png"))
        print(f"  {path.stem}.svg + .png")
    print(f"\nเสร็จ: {len(jobs)} ภาพ ที่ {outdir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
