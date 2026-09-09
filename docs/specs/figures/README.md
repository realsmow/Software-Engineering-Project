# `figures/` — ภาพที่ SDS ใช้

| ไฟล์ | ที่มา |
|---|---|
| `usecase.png` | เรนเดอร์จาก `docs/sections/_usecase_tikz.tex` (ตัวเดียวกับที่ข้อเสนอโครงการใช้) |
| `business-objects.png` | เรนเดอร์จาก `business-objects.tex` ในโฟลเดอร์นี้ — **แก้ที่ `.tex` แล้วเรนเดอร์ใหม่** |
| `er.png` | สำเนาของ `docs/figures/er_diagram.png` |
| `01-borrow.png` … `04-renew.png` | สำเนาของ `docs/bpmn/png/` สร้างจากไฟล์ `.bpmn` |

## เรนเดอร์ใหม่

```bash
cd docs/specs/figures
xelatex -output-directory=/tmp business-objects.tex
pdftoppm -r 200 -png -singlefile /tmp/business-objects.pdf business-objects

cd ../../sections
xelatex -output-directory=/tmp _standalone_usecase.tex
pdftoppm -r 200 -png -singlefile /tmp/_standalone_usecase.pdf ../specs/figures/usecase
```

ต้องมีฟอนต์ **Laksaman** (มากับ `fonts-tlwg`) ทั้งสองภาพเป็นโทนขาวดำโดยตั้งใจ เพราะเอกสารต้องพิมพ์ขาวดำได้
