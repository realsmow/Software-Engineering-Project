"""Measure real text width from the font file, then wrap to fit a box.

Why not reuse thai_w() from slide_theme.py — that one estimates width as
character-count x 0.50 x size. Good enough for short labels, but it drifts badly
on long paragraphs because:
  · Thai vowels/tone marks above and below have ZERO advance width, yet they
    are counted as full characters  (over-estimates, wraps too early)
  · Latin letters and digits are not all the same width  (wrong both ways)
This deck has several dense paragraphs, so it measures the font's real advance
widths instead. thai_w() is left alone — the other two generators still use it.

Requires Pillow built with Raqm (libraqm). Raqm is what shapes Thai correctly so
combining marks report zero advance; without it every measurement comes out too
wide and the layout wastes space. Check with:
    python3 -c "from PIL import features; print(features.check('raqm'))"
"""

from __future__ import annotations

import subprocess
from functools import lru_cache

from PIL import ImageFont, features

# Logical font name -> the fontconfig pattern to resolve it with. Kept in sync
# with the font-family strings the SVG asks for, so what we measure is what
# librsvg (and Canva, if the font is installed) actually draws.
PATTERNS = {
    ("thai", "regular"): "Laksaman",
    ("thai", "bold"): "Laksaman:bold",
    ("mono", "regular"): "DejaVu Sans Mono",
    ("mono", "bold"): "DejaVu Sans Mono:bold",
}


@lru_cache(maxsize=None)
def _font_file(family: str, weight: str) -> str:
    """Ask fontconfig for the actual file backing a logical font name."""
    pattern = PATTERNS[(family, weight)]
    out = subprocess.run(["fc-match", "-f", "%{file}", pattern],
                         check=True, capture_output=True, text=True).stdout
    return out.strip()


@lru_cache(maxsize=None)
def _font(family: str, weight: str, size: int) -> ImageFont.FreeTypeFont:
    # PIL wants an integer pixel size; measurements are scaled back to the
    # requested (possibly fractional) size by width() below.
    return ImageFont.truetype(_font_file(family, weight), size)


def width(text: str, size: float, family: str = "thai",
          weight: str = "regular") -> float:
    """Advance width of `text` in SVG user units at `size`.

    Measured at a fixed 100 px and scaled, so fractional sizes stay accurate
    and the ImageFont cache stays small (one entry per family+weight).
    """
    if not text:
        return 0.0
    return _font(family, weight, 100).getlength(text) * size / 100.0


def wrap_runs(runs: list[tuple[str, str]], size: float, max_w: float,
              family: str = "thai") -> list[list[tuple[str, str]]]:
    """Wrap a sequence of (text, weight) runs into lines that fit `max_w`.

    Returns lines, each a list of (text, weight) segments with adjacent
    same-weight segments merged — one <tspan> per segment when rendered.

    Thai has no spaces between words, so the only break points are the ones the
    author typed. Write captions with spaces at natural phrase boundaries and
    the wrap follows the phrasing. A token wider than the whole box is broken
    character-by-character as a last resort (see _split_token).
    """
    space = width(" ", size, family)

    # Flatten to tokens, remembering which weight each came from.
    tokens: list[tuple[str, str]] = []
    for text, weight in runs:
        for tok in text.split(" "):
            if tok:
                tokens.append((tok, weight))

    lines: list[list[tuple[str, str]]] = []
    cur: list[tuple[str, str]] = []
    cur_w = 0.0
    for tok, weight in tokens:
        tok_w = width(tok, size, family, weight)
        # A token that cannot fit even on its own line has to be hard-split,
        # otherwise it would overflow the box silently.
        if tok_w > max_w:
            for piece in _split_token(tok, size, max_w, family, weight):
                piece_w = width(piece, size, family, weight)
                if cur and cur_w + space + piece_w > max_w:
                    lines.append(_merge(cur))
                    cur, cur_w = [], 0.0
                cur.append((piece, weight))
                cur_w += (space if len(cur) > 1 else 0) + piece_w
            continue
        if cur and cur_w + space + tok_w > max_w:
            lines.append(_merge(cur))
            cur, cur_w = [], 0.0
        cur.append((tok, weight))
        cur_w += (space if len(cur) > 1 else 0) + tok_w
    if cur:
        lines.append(_merge(cur))
    return lines


def wrap(text: str, size: float, max_w: float, family: str = "thai",
         weight: str = "regular") -> list[str]:
    """Single-weight convenience wrapper — returns plain strings."""
    return [" ".join(seg[0] for seg in line)
            for line in wrap_runs([(text, weight)], size, max_w, family)]


# Thai combining marks: above-vowels, below-vowels and tone marks. They attach
# to the preceding base character and must never be separated from it, or the
# mark lands on the wrong letter (or on nothing) after a hard split.
_COMBINING = set("ัิีึืฺุู"
                 "็่้๊๋์ํ๎")


def _clusters(token: str) -> list[str]:
    """Split into base-character + attached-marks clusters."""
    out: list[str] = []
    for ch in token:
        if out and ch in _COMBINING:
            out[-1] += ch
        else:
            out.append(ch)
    return out


def _split_token(token: str, size: float, max_w: float, family: str,
                 weight: str) -> list[str]:
    """Break an over-long token into pieces that each fit `max_w`."""
    pieces, cur = [], ""
    for cluster in _clusters(token):
        if cur and width(cur + cluster, size, family, weight) > max_w:
            pieces.append(cur)
            cur = cluster
        else:
            cur += cluster
    if cur:
        pieces.append(cur)
    return pieces


def _merge(segments: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Join neighbouring segments that share a weight, re-inserting spaces."""
    out: list[tuple[str, str]] = []
    for text, weight in segments:
        if out and out[-1][1] == weight:
            out[-1] = (out[-1][0] + " " + text, weight)
        else:
            if out:
                # The space between two differently-weighted tokens belongs to
                # the run that precedes it, so the gap survives the merge.
                out[-1] = (out[-1][0] + " ", out[-1][1])
            out.append((text, weight))
    return out


def require_raqm() -> None:
    """Warn once if Pillow lacks Raqm — measurements would be too wide."""
    if not features.check("raqm"):
        print("  เตือน: Pillow ตัวนี้ไม่มี Raqm — ความกว้างข้อความไทยจะเกินจริง\n"
              "        ติดตั้งด้วย: sudo apt install libraqm0")
