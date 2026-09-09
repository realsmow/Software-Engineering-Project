#!/usr/bin/env python3
"""สร้างสไลด์ชุด UI/UX จากภาพหน้าจอของ flow board

รันจาก docs/slides/ :  python3 extract_screens.py && python3 gen_flow_slides.py
ผลลัพธ์:               slides/ui-slides/*.svg + *.png

ธีมและตัวแปลง SVG→PNG ใช้ร่วมกับสไลด์ชุดฐานข้อมูล (slide_theme.py)
ภาพถูกฝังเป็น data URI ทำให้ไฟล์ SVG เปิดที่ไหนก็เห็นภาพ ไม่ต้องพก asset ตาม
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

from flow_data import (CAPTIONS, GRID_PANELS, ROLE_COLOR, ROLE_LABEL,
                       SLIDES)
from slide_theme import (ACCENT, BRAND, INK, LINE, MARGIN, MONO, MUTED, PANEL,
                         ROW_ALT, THAI, TITLE_H, esc, find_rsvg, rasterize,
                         slide_header, thai_w, tint, wrap_thai)

HERE = Path(__file__).parent
SCREENS = HERE / "screens"
OUT = HERE / "ui-slides"

SIDEBAR_W = 240       # แถบเมนูซ้ายที่เหมือนกันทุกจอ ครอปทิ้งได้โดยไม่เสียความหมาย
ZOOM_DW = 1200        # ความกว้างที่แสดงภาพในสไลด์ zoom = ความกว้างเนื้อหาพอดี 1:1
ZOOM_CAP_W = 600      # คอลัมน์คำอธิบายด้านขวา
FLOW_GAP = 150        # ช่องว่างระหว่างจอในสไลด์ flow — ที่วางลูกศรกับป้าย
# ภาพต้นฉบับกว้าง 1440 px และสไลด์ zoom แสดงที่ 1:1 อยู่แล้ว การ export ที่ 2.5x
# จึงไม่ได้รายละเอียดเพิ่ม มีแต่ทำให้ไฟล์ใหญ่ขึ้น 50% — 2.0 คมพอและเบากว่า
PNG_SCALE = 2.0

_cache: dict[str, str] = {}


def data_uri(sid: str) -> str:
    """ฝังภาพเป็น base64 — SVG จะได้เป็นไฟล์เดียวจบ ไม่ต้องพก jpg ไปด้วย"""
    if sid not in _cache:
        b64 = base64.b64encode((SCREENS / f"{sid}.jpg").read_bytes()).decode()
        _cache[sid] = f"data:image/jpeg;base64,{b64}"
    return _cache[sid]


def screenshot(sid: str, x: float, y: float, dw: float, crop: tuple,
               meta: dict, radius: float = 10) -> list[str]:
    """วางภาพหน้าจอที่ครอปแล้วลงกล่องมุมโค้ง

    crop = (cx, cy, cw, ch) พิกัดในภาพต้นฉบับ; ภาพถูกย่อให้กว้าง dw
    ใช้ clipPath แทนการครอปไฟล์จริง เพราะเก็บภาพต้นฉบับไว้ชุดเดียวแล้วครอป
    ต่างกันไปในแต่ละสไลด์ได้ ไม่ต้องสร้างไฟล์ครอปซ้ำซ้อน
    """
    cx, cy, cw, ch = crop
    s = dw / cw
    dh = ch * s
    cid = f"clip-{sid}-{int(x)}-{int(y)}"
    return [
        f'<defs><clipPath id="{cid}"><rect x="{x}" y="{y}" width="{dw}" '
        f'height="{dh}" rx="{radius}"/></clipPath></defs>',
        f'<rect x="{x+2}" y="{y+4}" width="{dw}" height="{dh}" rx="{radius}" '
        f'fill="#0A1F1D" opacity="0.10"/>',
        f'<g clip-path="url(#{cid})">'
        f'<image x="{x - cx*s:.2f}" y="{y - cy*s:.2f}" '
        f'width="{meta["w"]*s:.2f}" height="{meta["h"]*s:.2f}" '
        f'href="{data_uri(sid)}" preserveAspectRatio="none"/></g>',
        f'<rect x="{x}" y="{y}" width="{dw}" height="{dh}" rx="{radius}" '
        f'fill="none" stroke="{LINE}"/>',
    ], dh


def marker(n: int, bx: float, by: float, tx: float, ty: float) -> str:
    """หมุดเลขบนภาพ

    ป้ายวางที่ (bx,by) ซึ่งเลือกไว้ให้ตกในที่ว่างของหน้าจอ แล้วลากเส้นบางไปยัง
    จุดที่ต้องการชี้ (tx,ty) — วางป้ายทับองค์ประกอบที่กำลังอธิบายอยู่จะบังของ
    ที่คนดูต้องเห็นพอดี ซึ่งเป็นปัญหาที่เจอในรอบแรก
    """
    o = []
    if (bx, by) != (tx, ty):
        o.append(f'<line x1="{bx:.1f}" y1="{by:.1f}" x2="{tx:.1f}" y2="{ty:.1f}" '
                 f'stroke="{ACCENT}" stroke-width="1.6" opacity="0.85"/>')
        o.append(f'<circle cx="{tx:.1f}" cy="{ty:.1f}" r="3.5" fill="{ACCENT}"/>')
    o.append(f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="17" fill="{PANEL}" '
             f'opacity="0.94"/>')
    o.append(f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="14" fill="{ACCENT}"/>')
    o.append(f'<text x="{bx:.1f}" y="{by+5:.1f}" font-family="{MONO}" '
             f'font-size="14" font-weight="700" fill="#FFFFFF" '
             f'text-anchor="middle">{n}</text>')
    return "".join(o)


# ------------------------------------------------------------- สไลด์แบบ zoom
def render_zoom(slide, meta) -> str:
    sid = slide["screen"]
    m = meta[sid]
    crop = ((SIDEBAR_W, 0, m["w"] - SIDEBAR_W, m["h"])
            if slide.get("crop_sidebar", True) else (0, 0, m["w"], m["h"]))
    s = ZOOM_DW / crop[2]

    ix, iy = MARGIN, TITLE_H
    img, dh = screenshot(sid, ix, iy, ZOOM_DW, crop, m)

    capx = MARGIN + ZOOM_DW + 44
    width = capx + ZOOM_CAP_W + MARGIN

    # --- คำอธิบายเรียงตามหมุด ความสูงคิดล่วงหน้าเพื่อกำหนดขนาดผืนผ้าใบ
    cap_lines = [wrap_thai(mk[-1], 13, ZOOM_CAP_W - 46)
                 for mk in slide["markers"]]
    cap_h = sum(len(l) * 21 + 22 for l in cap_lines) + 16
    height = TITLE_H + max(dh, cap_h) + MARGIN

    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" '
         f'height="{height:.0f}" viewBox="0 0 {width:.0f} {height:.0f}">',
         f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" rx="14" '
         f'fill="{PANEL}"/>']
    o += slide_header(width, slide["th"], slide["en"], slide.get("notes", ()))
    o += img

    to_px = lambda px, py: (ix + (px - crop[0]) * s, iy + (py - crop[1]) * s)
    for i, (tx, ty, bx, by, _) in enumerate(slide["markers"], 1):
        o.append(marker(i, *to_px(bx, by), *to_px(tx, ty)))

    y = TITLE_H + 6
    for i, lines in enumerate(cap_lines, 1):
        o.append(f'<circle cx="{capx+14}" cy="{y+9}" r="13" fill="{ACCENT}"/>')
        o.append(f'<text x="{capx+14}" y="{y+14}" font-family="{MONO}" '
                 f'font-size="13" font-weight="700" fill="#FFFFFF" '
                 f'text-anchor="middle">{i}</text>')
        for j, line in enumerate(lines):
            o.append(f'<text x="{capx+38}" y="{y+14+j*21}" font-family="{THAI}" '
                     f'font-size="13" fill="{INK}">{esc(line)}</text>')
        y += len(lines) * 21 + 22
    o.append('</svg>')
    return "\n".join(o)


# ------------------------------------------------------------- สไลด์แบบ flow
def render_flow(slide, meta, edges) -> str:
    ids = slide["screens"]
    n = len(ids)
    tw = (1900 - MARGIN * 2 - FLOW_GAP * (n - 1)) / n
    # ครอปแถบเมนูซ้ายทิ้งทุกจอ — มันเหมือนกันหมด พื้นที่เอาไปให้เนื้อหาดีกว่า
    # และตัดความสูงเท่ากันทุกจอ เพื่อให้แถวเรียงตรงกันแม้หน้าจอยาวไม่เท่ากัน
    ch = min(meta[i]["h"] for i in ids)
    ch = min(ch, 1024)
    s = tw / (1440 - SIDEBAR_W)
    th = ch * s

    cap_lines = {i: wrap_thai(CAPTIONS[i], 12.5, tw - 8) for i in ids}
    cap_h = max(len(v) for v in cap_lines.values()) * 19 + 26
    width = 1900
    height = TITLE_H + th + 14 + cap_h + MARGIN

    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" '
         f'height="{height:.0f}" viewBox="0 0 {width} {height:.0f}">',
         f'<rect x="0" y="0" width="{width}" height="{height:.0f}" rx="14" '
         f'fill="{PANEL}"/>']
    o += slide_header(width, slide["th"], slide["en"], slide.get("notes", ()))

    xs = [MARGIN + k * (tw + FLOW_GAP) for k in range(n)]
    for k, sid in enumerate(ids):
        img, _ = screenshot(sid, xs[k], TITLE_H, tw,
                            (SIDEBAR_W, 0, 1440 - SIDEBAR_W, ch), meta[sid])
        o += img
        o.append(f'<text x="{xs[k]}" y="{TITLE_H+th+30}" font-family="{MONO}" '
                 f'font-size="13" font-weight="700" fill="{BRAND}">'
                 f'{esc(meta[sid]["name"])}</text>')
        for j, line in enumerate(cap_lines[sid]):
            o.append(f'<text x="{xs[k]}" y="{TITLE_H+th+50+j*19}" '
                     f'font-family="{THAI}" font-size="12.5" fill="{MUTED}">'
                     f'{esc(line)}</text>')

    # --- ลูกศรระหว่างจอ ป้ายกำกับดึงมาจาก EDGES ของ flow board เอง
    for k in range(n - 1):
        a, b = ids[k], ids[k + 1]
        label = edges.get((a, b)) or edges.get((b, a))
        ax, bx = xs[k] + tw + 18, xs[k + 1] - 18
        my = TITLE_H + th / 2
        o.append(f'<line x1="{ax}" y1="{my}" x2="{bx-12}" y2="{my}" '
                 f'stroke="{BRAND}" stroke-width="2.4" opacity="0.8"/>')
        o.append(f'<path d="M{bx} {my} L{bx-13} {my-6.5} L{bx-13} {my+6.5} z" '
                 f'fill="{BRAND}" opacity="0.8"/>')
        if label:
            lines = wrap_thai(label, 12, FLOW_GAP - 24)
            box_h = len(lines) * 17 + 14
            cxm = (ax + bx) / 2
            o.append(f'<rect x="{cxm-(FLOW_GAP-8)/2}" y="{my-box_h-16}" '
                     f'width="{FLOW_GAP-8}" height="{box_h}" rx="8" '
                     f'fill="{ROW_ALT}" stroke="{tint(BRAND, 0.72)}"/>')
            for j, line in enumerate(lines):
                o.append(f'<text x="{cxm}" y="{my-box_h-16+18+j*17}" '
                         f'font-family="{THAI}" font-size="12" fill="{BRAND}" '
                         f'text-anchor="middle">{esc(line)}</text>')
    o.append('</svg>')
    return "\n".join(o)


# ------------------------------------------------------------- สไลด์แบบ grid
def render_grid(slide, meta, rows_by_role) -> str:
    per_row = max(len(v) for v in rows_by_role.values())
    gap = 20
    tw = (1900 - MARGIN * 2 - gap * (per_row - 1)) / per_row
    s = tw / 1440
    th = 1024 * s
    band = 26 + th + 34            # ป้ายบทบาท + ภาพ + ชื่อจอ

    width = 1900
    height = TITLE_H + len(rows_by_role) * (band + 22) + MARGIN

    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" '
         f'height="{height:.0f}" viewBox="0 0 {width} {height:.0f}">',
         f'<rect x="0" y="0" width="{width}" height="{height:.0f}" rx="14" '
         f'fill="{PANEL}"/>']
    o += slide_header(width, slide["th"], slide["en"], slide.get("notes", ()))

    y = TITLE_H
    for role, ids in rows_by_role.items():
        color = ROLE_COLOR[role]
        o.append(f'<rect x="{MARGIN}" y="{y+2}" width="4" height="15" rx="2" '
                 f'fill="{color}"/>')
        o.append(f'<text x="{MARGIN+13}" y="{y+15}" font-family="{THAI}" '
                 f'font-size="13.5" font-weight="700" fill="{color}">'
                 f'{esc(ROLE_LABEL[role])}</text>')
        o.append(f'<text x="{MARGIN+13+thai_w(ROLE_LABEL[role], 13.5)+16}" '
                 f'y="{y+15}" font-family="{MONO}" font-size="11" '
                 f'fill="{MUTED}">{len(ids)} หน้าจอ</text>')
        for k, sid in enumerate(ids):
            x = MARGIN + k * (tw + gap)
            img, _ = screenshot(sid, x, y + 26, tw, (0, 0, 1440, 1024),
                                meta[sid], radius=7)
            o += img
            o.append(f'<text x="{x}" y="{y+26+th+16}" font-family="{THAI}" '
                     f'font-size="11.5" fill="{INK}">'
                     f'{esc(meta[sid]["name"].split(" · ")[0])}</text>')
            o.append(f'<text x="{x}" y="{y+26+th+30}" font-family="{MONO}" '
                     f'font-size="10" fill="{MUTED}">{esc(sid)}</text>')
        free = per_row - len(ids)
        if free >= 3 and role in GRID_PANELS:
            head, body = GRID_PANELS[role]
            px = MARGIN + len(ids) * (tw + gap) + 10
            pw = MARGIN + per_row * (tw + gap) - gap - px
            o.append(f'<rect x="{px}" y="{y+26}" width="{pw}" height="{th}" '
                     f'rx="10" fill="{ROW_ALT}" stroke="{LINE}"/>')
            o.append(f'<text x="{px+26}" y="{y+62}" font-family="{THAI}" '
                     f'font-size="15" font-weight="700" fill="{INK}">'
                     f'{esc(head)}</text>')
            ly = y + 90
            for line in body:
                for seg in wrap_thai(line, 13, pw - 52):
                    o.append(f'<text x="{px+26}" y="{ly}" font-family="{THAI}" '
                             f'font-size="13" fill="{MUTED}">{esc(seg)}</text>')
                    ly += 21
                ly += 8
        y += band + 22
    o.append('</svg>')
    return "\n".join(o)


# ------------------------------------------------------------------------ main
def main() -> int:
    flow = json.loads((SCREENS / "flow.json").read_text(encoding="utf-8"))
    meta = flow["screens"]
    edges = {(e["from"], e["to"]): e.get("label", "") for e in flow["edges"]}

    # จัดกลุ่มตามบทบาทจาก data-group ในบอร์ด โดยรักษาลำดับเดิมไว้
    rows_by_role: dict[str, list[str]] = {}
    order = {"common": 0, "borrower": 1, "staff": 2, "admin": 3}
    groups = {}
    html = (HERE.parent / "resource" / "ULMS_FlowBoard_standalone.html")
    import re
    for m in re.finditer(r'data-id="([^"]+)" data-group="([^"]+)"',
                         html.read_text(encoding="utf-8")):
        groups[m.group(1)] = m.group(2)
    for sid in meta:
        rows_by_role.setdefault(groups[sid], []).append(sid)
    rows_by_role = dict(sorted(rows_by_role.items(), key=lambda kv: order[kv[0]]))

    OUT.mkdir(exist_ok=True)
    exe = find_rsvg()
    for slide in SLIDES:
        if slide["type"] == "zoom":
            svg = render_zoom(slide, meta)
        elif slide["type"] == "flow":
            svg = render_flow(slide, meta, edges)
        else:
            svg = render_grid(slide, meta, rows_by_role)
        path = OUT / f'{slide["id"]}.svg'
        path.write_text(svg, encoding="utf-8")
        rasterize(exe, path, path.with_suffix(".png"), PNG_SCALE)
        print(f'  {slide["id"]}  ({slide["type"]})')
    print(f"\nเสร็จ: {len(SLIDES)} สไลด์ ที่ {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
