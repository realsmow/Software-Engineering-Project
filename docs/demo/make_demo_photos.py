"""Draw placeholder condition photos for the demo (no real photos on this machine).

Each item type gets a "before" and an "after" picture: same object, the after
one with a visible scratch, so an inspection or appeal screen shows two images
that actually differ. Re-run any time; output is deterministic.

    python3 docs/demo/make_demo_photos.py   # -> docs/demo/photos/*.jpg
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).with_name("photos")
FONT = "/home/panguin/.fonts/Sarabun/Sarabun-Bold.ttf"

# slug -> (label on the photo, body colour)
SUBJECTS = {
    "caliper": ("เวอร์เนียคาลิปเปอร์", (120, 130, 140)),
    "jumper": ("สายจัมเปอร์", (200, 90, 40)),
    "scope": ("ออสซิลโลสโคป", (40, 90, 150)),
    "camera": ("กล้อง DSLR", (50, 55, 60)),
    "board": ("บอร์ดไมโครคอนโทรลเลอร์", (20, 120, 90)),
    "laptop": ("โน้ตบุ๊ก", (70, 70, 90)),
    "meter": ("มัลติมิเตอร์", (230, 180, 30)),
    "tool": ("เครื่องมือช่าง", (180, 50, 50)),
    "survey": ("อุปกรณ์สำรวจ", (220, 140, 20)),
    "lab": ("เครื่องมือแล็บเคมี", (90, 160, 200)),
    "tablet": ("แท็บเล็ต", (30, 30, 35)),
    "room": ("ห้อง", (170, 190, 170)),
}


def draw(label: str, colour, damaged: bool) -> Image.Image:
    im = Image.new("RGB", (1024, 768), (236, 238, 240))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 560, 1024, 768), fill=(214, 206, 196))           # table top
    d.rounded_rectangle((232, 190, 792, 590), 36, fill=colour)       # the object
    d.rounded_rectangle((292, 250, 732, 420), 20, fill=tuple(min(255, c + 60) for c in colour))
    if damaged:  # a scratch and a dent, so "after" visibly differs from "before"
        d.line((330, 300, 520, 380), fill=(250, 250, 250), width=7)
        d.ellipse((620, 460, 700, 530), outline=(250, 250, 250), width=6)
    f = ImageFont.truetype(FONT, 54)
    d.text((512, 675), f"{label}  {'ตอนคืน' if damaged else 'ตอนรับ'}", font=f,
           fill=(40, 40, 40), anchor="mm")
    return im


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for slug, (label, colour) in SUBJECTS.items():
        draw(label, colour, False).save(OUT / f"{slug}-before.jpg", quality=82)
        draw(label, colour, True).save(OUT / f"{slug}-after.jpg", quality=82)
    print(f"{len(SUBJECTS) * 2} photos in {OUT}")


if __name__ == "__main__":
    main()
