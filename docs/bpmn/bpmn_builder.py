"""Tiny BPMN 2.0 builder: a grid-based model -> valid .bpmn XML (semantics + DI).

Why hand-roll this instead of drawing in a modeller?  The four ULMs processes are
generated from one source of truth (bpmn_data.py), so a wording fix or a new
branch is a one-line edit plus a re-run, and every diagram keeps the same
geometry and vocabulary.  The output is ordinary BPMN 2.0, so it still opens and
edits in Camunda Modeler / bpmn.io / draw.io.

Layout model
------------
Every pool is a horizontal band.  Inside a pool a node is placed on a grid cell
(col, row): columns are shared across all pools so that "what happens at the same
time" lines up vertically across actors, rows separate parallel branches inside
one actor.  Coordinates are computed once, in `Collaboration.layout()`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from xml.sax.saxutils import escape, quoteattr

# ---------------------------------------------------------------- geometry ---

# Columns are sized to their widest node instead of using one fixed pitch: a
# column that only holds gateways and events is ~half as wide as one holding a
# task, which keeps these collaborations about a third narrower.
COL_PAD = 55         # horizontal breathing room added to the widest node in a column
MIN_COL_W = 105      # floor, so event-only columns still leave room for edge labels
ROW_H = 125          # vertical pitch of one grid row inside a pool
POOL_X = 160         # left edge of every pool
POOL_Y0 = 80         # top edge of the first pool
POOL_GAP = 115       # vertical space between pools, message flows route here
POOL_PAD = 22        # padding above the first row / below the last row
HEADER_W = 30        # width of the vertical pool-name band on the left

NOTE_SIZE = (210, 70)   # text annotation box

SIZE = {
    "event": (36, 36),
    "gateway": (50, 50),
    "task": (170, 90),
}

# kind -> (BPMN element name, event definition or None, size class)
KINDS = {
    "start": ("startEvent", None, "event"),
    "msgstart": ("startEvent", "message", "event"),
    "end": ("endEvent", None, "event"),
    "catch": ("intermediateCatchEvent", "message", "event"),
    "timer": ("intermediateCatchEvent", "timer", "event"),
    "throw": ("intermediateThrowEvent", "message", "event"),
    "task": ("task", None, "task"),
    "user": ("userTask", None, "task"),
    "service": ("serviceTask", None, "task"),
    "manual": ("manualTask", None, "task"),
    "send": ("sendTask", None, "task"),
    "receive": ("receiveTask", None, "task"),
    "xor": ("exclusiveGateway", None, "gateway"),
    "and": ("parallelGateway", None, "gateway"),
    "eventgw": ("eventBasedGateway", None, "gateway"),
}


# --------------------------------------------------------------- labelling ---
# bpmn-js parks an edge label at the midpoint of the edge, which for these
# diagrams lands on top of the shape at either end.  We compute the bounds
# ourselves instead: near the source (so it is obvious which branch it belongs
# to) but offset clear of the line.  Thai text also never wraps -- there are no
# inter-word spaces to break on -- so the box has to be wide enough for one line.

LABEL_MAX_W = 190.0
LINE_H = 22.0


def _label_box(text: str) -> tuple[float, float]:
    # Width is estimated a little generously: the text is centred in the box, so
    # an oversized box costs nothing, while an undersized one makes diagram-js
    # force-break a Thai label mid-syllable.
    est = max(48.0, len(text) * 9.0 + 24)
    if est <= LABEL_MAX_W:
        return est, LINE_H
    return LABEL_MAX_W, LINE_H * math.ceil(est / LABEL_MAX_W)


def _point_along(pts: list[tuple[float, float]], dist: float) -> tuple[float, float, bool]:
    """Point `dist` px along a polyline; third value says the segment is horizontal."""
    segs = list(zip(pts, pts[1:]))
    total = sum(math.dist(a, b) for a, b in segs)
    dist = min(dist, total / 2)          # never walk past the middle of the edge
    for (x1, y1), (x2, y2) in segs:
        seg = math.dist((x1, y1), (x2, y2))
        if seg == 0:
            continue
        if dist <= seg:
            t = dist / seg
            return x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, abs(x2 - x1) >= abs(y2 - y1)
        dist -= seg
    (x1, y1), (x2, y2) = pts[-2], pts[-1]
    return x2, y2, abs(x2 - x1) >= abs(y2 - y1)


def _flow_label_bounds(pts, text: str, slot: int = 0) -> tuple[float, float, float, float]:
    """`slot` walks later branches of the same gateway further along the line, so
    two branches that leave in the same direction do not stack their labels."""
    w, h = _label_box(text)
    x, y, horizontal = _point_along(pts, 62.0 + slot * 28.0)
    if horizontal:
        y -= 16                          # above the line
    else:
        x += w / 2 + 12                  # beside the line
    return x - w / 2, y - h / 2, w, h


@dataclass
class Node:
    nid: str
    kind: str
    name: str
    col: int
    row: int
    x: float = 0.0
    y: float = 0.0
    w: float = 0.0
    h: float = 0.0

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    def dock(self, side: str) -> tuple[float, float]:
        if side == "left":
            return (self.x, self.cy)
        if side == "right":
            return (self.x + self.w, self.cy)
        if side == "top":
            return (self.cx, self.y)
        return (self.cx, self.y + self.h)


@dataclass
class Flow:
    fid: str
    src: str
    tgt: str
    name: str = ""
    route: str = "auto"


def _seg_hits_rect(p1, p2, rect, pad: float = 8.0) -> bool:
    """Does an axis-aligned segment pass through a padded rectangle?"""
    (x1, y1), (x2, y2) = p1, p2
    rx1, ry1 = rect[0] - pad, rect[1] - pad
    rx2, ry2 = rect[0] + rect[2] + pad, rect[1] + rect[3] + pad
    if abs(x1 - x2) < 0.5:                       # vertical
        lo, hi = sorted((y1, y2))
        return rx1 < x1 < rx2 and lo < ry2 and hi > ry1
    if abs(y1 - y2) < 0.5:                       # horizontal
        lo, hi = sorted((x1, x2))
        return ry1 < y1 < ry2 and lo < rx2 and hi > rx1
    return False                                 # diagonal: associations only


@dataclass
class Note:
    """A bpmn:textAnnotation tied to one node with a bpmn:association.

    Business rules that are too long for a gateway label (the tier/level table,
    the appeal window) belong here: BPMN's own way of writing a rule next to the
    decision it governs, instead of cramming it into the diamond's name.
    """

    nid: str
    text: str
    target: str
    col: int
    row: int
    x: float = 0.0
    y: float = 0.0
    w: float = 0.0
    h: float = 0.0


@dataclass
class MessageFlow:
    fid: str
    src: str          # "pool.node"
    tgt: str          # "pool.node"
    name: str = ""


@dataclass
class Pool:
    pid: str
    name: str
    nodes: dict[str, Node] = field(default_factory=dict)
    flows: list[Flow] = field(default_factory=list)
    notes: list[Note] = field(default_factory=list)
    y: float = 0.0
    h: float = 0.0

    def node(self, nid: str, kind: str, name: str, col: int, row: int = 0) -> Node:
        assert kind in KINDS, f"unknown node kind {kind!r}"
        assert nid not in self.nodes, f"duplicate node id {self.pid}.{nid}"
        n = Node(nid, kind, name, col, row)
        self.nodes[nid] = n
        return n

    def flow(self, src: str, tgt: str, name: str = "", route: str = "auto") -> Flow:
        f = Flow(f"Flow_{self.pid}_{len(self.flows) + 1}", src, tgt, name, route)
        self.flows.append(f)
        return f

    def note(
        self, nid: str, text: str, target: str, col: int, row: int = 0,
        w: float = 0.0, h: float = 0.0,
    ) -> Note:
        n = Note(nid, text, target, col, row, w=w, h=h)
        self.notes.append(n)
        return n

    def chain(self, *nids: str) -> None:
        """Connect a straight run of nodes: chain('a', 'b', 'c')."""
        for a, b in zip(nids, nids[1:]):
            self.flow(a, b)


class Collaboration:
    """One BPMN file: several participant pools plus the messages between them."""

    def __init__(self, key: str, title: str):
        self.key = key
        self.title = title
        self.pools: list[Pool] = []
        self.messages: list[MessageFlow] = []
        self.width = 0.0

    def pool(self, pid: str, name: str) -> Pool:
        p = Pool(pid, name)
        self.pools.append(p)
        return p

    def message(self, src: str, tgt: str, name: str = "") -> MessageFlow:
        m = MessageFlow(f"MsgFlow_{len(self.messages) + 1}", src, tgt, name)
        self.messages.append(m)
        return m

    # ------------------------------------------------------------- layout ---

    def _resolve(self, ref: str) -> tuple[Pool, Node]:
        pid, nid = ref.split(".", 1)
        for p in self.pools:
            if p.pid == pid:
                return p, p.nodes[nid]
        raise KeyError(ref)

    def layout(self) -> None:
        for p in self.pools:
            for n in p.nodes.values():
                n.w, n.h = SIZE[KINDS[n.kind][2]]

        # Column x positions: every column is as wide as its widest node, and the
        # same column index means the same x in every pool, so a message flow that
        # stays in one column comes out perfectly vertical.
        for p in self.pools:
            for a in p.notes:
                a.w = a.w or NOTE_SIZE[0]
                a.h = a.h or NOTE_SIZE[1]

        widest: dict[int, float] = {}
        for p in self.pools:
            for n in p.nodes.values():
                widest[n.col] = max(widest.get(n.col, 0.0), n.w)
            for a in p.notes:
                widest[a.col] = max(widest.get(a.col, 0.0), a.w)
        centre: dict[int, float] = {}
        x = POOL_X + HEADER_W
        for col in range(max(widest) + 1):
            cw = max(widest.get(col, 0.0) + COL_PAD, MIN_COL_W)
            centre[col] = x + cw / 2
            x += cw
        self.width = x - POOL_X

        y = POOL_Y0
        for p in self.pools:
            nrows = max(
                [n.row for n in p.nodes.values()] + [a.row for a in p.notes]
            ) + 1
            p.y = y
            p.h = POOL_PAD * 2 + nrows * ROW_H
            for item in list(p.nodes.values()) + list(p.notes):
                cy = p.y + POOL_PAD + item.row * ROW_H + ROW_H / 2
                item.x = centre[item.col] - item.w / 2
                item.y = cy - item.h / 2
            y += p.h + POOL_GAP

    # ------------------------------------------------------------ routing ---

    @staticmethod
    def _route_sequence(a: Node, b: Node, hint: str) -> list[tuple[float, float]]:
        """Orthogonal waypoints for a sequence flow inside one pool."""
        if hint == "rd":                      # go right first, then down/up into the top/bottom
            side = "top" if b.cy > a.cy else "bottom"
            return [a.dock("right"), (b.cx, a.cy), b.dock(side)]
        if hint == "dr":                      # go down/up first, then right into the left edge
            side = "bottom" if b.cy > a.cy else "top"
            return [a.dock(side), (a.cx, b.cy), b.dock("left")]
        if hint == "around":                  # loop back: dip below both nodes
            dy = max(a.y + a.h, b.y + b.h) + 45
            return [a.dock("bottom"), (a.cx, dy), (b.cx, dy), b.dock("bottom")]

        if abs(a.cy - b.cy) < 1:              # same row
            if b.cx > a.cx:
                return [a.dock("right"), b.dock("left")]
            return Collaboration._route_sequence(a, b, "around")
        if abs(a.cx - b.cx) < 1:              # same column
            side_a, side_b = ("bottom", "top") if b.cy > a.cy else ("top", "bottom")
            return [a.dock(side_a), b.dock(side_b)]
        if b.cx > a.cx:                       # forward and sideways: down/up, then right
            return Collaboration._route_sequence(a, b, "dr")
        return Collaboration._route_sequence(a, b, "around")

    def _route_message(self, m: MessageFlow, channel: dict[int, int]) -> list[tuple[float, float]]:
        """Message flows leave a pool vertically and travel in the gap between pools."""
        pa, a = self._resolve(m.src)
        pb, b = self._resolve(m.tgt)
        ia, ib = self.pools.index(pa), self.pools.index(pb)
        down = ib > ia
        # The gap immediately before the target pool carries the horizontal run.
        gap_idx = ib - 1 if down else ib
        gap_top = self.pools[gap_idx].y + self.pools[gap_idx].h
        slot = channel.get(gap_idx, 0)
        channel[gap_idx] = slot + 1
        ch_y = gap_top + 26 + slot * 26
        return [
            a.dock("bottom" if down else "top"),
            (a.cx, ch_y),
            (b.cx, ch_y),
            b.dock("top" if down else "bottom"),
        ]

    # -------------------------------------------------------------- check ---

    def check(self) -> list[str]:
        """Report edges that run straight through a shape.

        The grid keeps most routes clean on its own, but a message flow leaves a
        pool vertically and can cross every pool in between, so a node placed in
        the wrong column silently ends up with a line drawn across it.  Cheaper
        to have the generator say so than to spot it in a 4000px PNG.
        """
        self.layout()
        boxes = [
            (f"{p.pid}.{n.nid}", (n.x, n.y, n.w, n.h))
            for p in self.pools
            for n in p.nodes.values()
        ]
        problems: list[str] = []

        def scan(label: str, pts, skip: set[str], only: set[str] | None = None) -> None:
            for a, b in zip(pts, pts[1:]):
                for ref, box in boxes:
                    if ref in skip or (only is not None and ref not in only):
                        continue
                    if _seg_hits_rect(a, b, box):
                        problems.append(f"{label} crosses {ref}")

        for p in self.pools:
            own = {f"{p.pid}.{nid}" for nid in p.nodes}
            for f in p.flows:
                pts = self._route_sequence(p.nodes[f.src], p.nodes[f.tgt], f.route)
                scan(f"{p.pid}: {f.src} -> {f.tgt}",
                     pts, {f"{p.pid}.{f.src}", f"{p.pid}.{f.tgt}"}, only=own)

        channel: dict[int, int] = {}
        for m in self.messages:
            pts = self._route_message(m, channel)
            scan(f"message {m.src} -> {m.tgt}", pts, {m.src, m.tgt})
        return problems

    # ------------------------------------------------------------- export ---

    def to_xml(self) -> str:
        self.layout()
        out: list[str] = []
        w = out.append
        ns = self.key

        w('<?xml version="1.0" encoding="UTF-8"?>')
        w(
            '<bpmn:definitions '
            'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
            'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
            'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" '
            'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
            f'id="Definitions_{ns}" targetNamespace="http://ulms.cpe/bpmn" '
            'exporter="ULMs docs/bpmn/bpmn_builder.py" exporterVersion="1.0">'
        )

        w(f'  <bpmn:collaboration id="Collaboration_{ns}" name={quoteattr(self.title)}>')
        for p in self.pools:
            w(
                f'    <bpmn:participant id="Participant_{p.pid}" name={quoteattr(p.name)} '
                f'processRef="Process_{p.pid}" />'
            )
        for m in self.messages:
            sp, sn = m.src.split(".", 1)
            tp, tn = m.tgt.split(".", 1)
            w(
                f'    <bpmn:messageFlow id="{m.fid}" name={quoteattr(m.name)} '
                f'sourceRef="{sp}_{sn}" targetRef="{tp}_{tn}" />'
            )
        w("  </bpmn:collaboration>")

        for p in self.pools:
            w(f'  <bpmn:process id="Process_{p.pid}" isExecutable="false">')
            for n in p.nodes.values():
                tag, evdef, _ = KINDS[n.kind]
                eid = f"{p.pid}_{n.nid}"
                inc = [f.fid for f in p.flows if f.tgt == n.nid]
                outg = [f.fid for f in p.flows if f.src == n.nid]
                w(f'    <bpmn:{tag} id="{eid}" name={quoteattr(n.name)}>')
                for f in inc:
                    w(f"      <bpmn:incoming>{f}</bpmn:incoming>")
                for f in outg:
                    w(f"      <bpmn:outgoing>{f}</bpmn:outgoing>")
                if evdef == "message":
                    w(f'      <bpmn:messageEventDefinition id="MED_{eid}" />')
                elif evdef == "timer":
                    w(f'      <bpmn:timerEventDefinition id="TED_{eid}" />')
                w(f"    </bpmn:{tag}>")
            for f in p.flows:
                w(
                    f'    <bpmn:sequenceFlow id="{f.fid}" name={quoteattr(f.name)} '
                    f'sourceRef="{p.pid}_{f.src}" targetRef="{p.pid}_{f.tgt}" />'
                )
            for a in p.notes:
                w(f'    <bpmn:textAnnotation id="{p.pid}_{a.nid}">')
                w(f"      <bpmn:text>{escape(a.text)}</bpmn:text>")
                w("    </bpmn:textAnnotation>")
                w(
                    f'    <bpmn:association id="Assoc_{p.pid}_{a.nid}" '
                    f'sourceRef="{p.pid}_{a.target}" targetRef="{p.pid}_{a.nid}" />'
                )
            w("  </bpmn:process>")

        # ------------------------------------------------------------- DI ---
        w(f'  <bpmndi:BPMNDiagram id="BPMNDiagram_{ns}">')
        w(f'    <bpmndi:BPMNPlane id="BPMNPlane_{ns}" bpmnElement="Collaboration_{ns}">')
        for p in self.pools:
            w(
                f'      <bpmndi:BPMNShape id="Participant_{p.pid}_di" '
                f'bpmnElement="Participant_{p.pid}" isHorizontal="true">'
            )
            w(f'        <dc:Bounds x="{POOL_X}" y="{p.y:.0f}" '
              f'width="{self.width:.0f}" height="{p.h:.0f}" />')
            w("      </bpmndi:BPMNShape>")
        for p in self.pools:
            for n in p.nodes.values():
                eid = f"{p.pid}_{n.nid}"
                marker = ' isMarkerVisible="true"' if n.kind == "xor" else ""
                w(f'      <bpmndi:BPMNShape id="{eid}_di" bpmnElement="{eid}"{marker}>')
                w(f'        <dc:Bounds x="{n.x:.0f}" y="{n.y:.0f}" '
                  f'width="{n.w:.0f}" height="{n.h:.0f}" />')
                if KINDS[n.kind][2] == "gateway" and n.name:
                    lw, lh = _label_box(n.name)
                    w("        <bpmndi:BPMNLabel>")
                    w(f'          <dc:Bounds x="{n.cx - lw / 2:.0f}" y="{n.y - lh - 10:.0f}" '
                      f'width="{lw:.0f}" height="{lh:.0f}" />')
                    w("        </bpmndi:BPMNLabel>")
                w("      </bpmndi:BPMNShape>")
        def edge(eid: str, pts, bounds) -> None:
            w(f'      <bpmndi:BPMNEdge id="{eid}_di" bpmnElement="{eid}">')
            for x, y in pts:
                w(f'        <di:waypoint x="{x:.0f}" y="{y:.0f}" />')
            if bounds:
                bx, by, bw, bh = bounds
                w("        <bpmndi:BPMNLabel>")
                w(f'          <dc:Bounds x="{bx:.0f}" y="{by:.0f}" '
                  f'width="{bw:.0f}" height="{bh:.0f}" />')
                w("        </bpmndi:BPMNLabel>")
            w("      </bpmndi:BPMNEdge>")

        for p in self.pools:
            for a in p.notes:
                w(f'      <bpmndi:BPMNShape id="{p.pid}_{a.nid}_di" '
                  f'bpmnElement="{p.pid}_{a.nid}">')
                w(f'        <dc:Bounds x="{a.x:.0f}" y="{a.y:.0f}" '
                  f'width="{a.w:.0f}" height="{a.h:.0f}" />')
                w("      </bpmndi:BPMNShape>")

        for p in self.pools:
            seen: dict[str, int] = {}
            for f in p.flows:
                pts = self._route_sequence(p.nodes[f.src], p.nodes[f.tgt], f.route)
                bounds = None
                if f.name:
                    slot = seen.get(f.src, 0)
                    seen[f.src] = slot + 1
                    bounds = _flow_label_bounds(pts, f.name, slot)
                edge(f.fid, pts, bounds)
            for a in p.notes:
                tgt = p.nodes[a.target]
                dx, dy = (a.x + a.w / 2) - tgt.cx, (a.y + a.h / 2) - tgt.cy
                if abs(dy) < ROW_H / 2:          # same row: leave sideways
                    start = tgt.dock("right" if dx > 0 else "left")
                    end = (a.x if dx > 0 else a.x + a.w, a.y + a.h / 2)
                else:
                    start = tgt.dock("bottom" if dy > 0 else "top")
                    end = (a.x + a.w / 2, a.y if dy > 0 else a.y + a.h)
                edge(f"Assoc_{p.pid}_{a.nid}", [start, end], None)

        channel: dict[int, int] = {}
        for m in self.messages:
            pts = self._route_message(m, channel)
            bounds = None
            if m.name:
                # Anchor on the horizontal run inside the pool gap, a quarter of
                # the way from the sender, so several messages landing on the same
                # catch event still get separated labels.
                (x1, y1), (x2, _) = pts[1], pts[2]
                bw, bh = _label_box(m.name)
                bounds = (x1 + (x2 - x1) * 0.28 - bw / 2, y1 - 20 - bh / 2, bw, bh)
            edge(m.fid, pts, bounds)
        w("    </bpmndi:BPMNPlane>")
        w("  </bpmndi:BPMNDiagram>")
        w("</bpmn:definitions>")
        return "\n".join(out) + "\n"


__all__ = ["Collaboration", "Pool", "Node"]
