# สารบัญไฟล์ — โครงการ ULMs

อ่านหน้านี้แล้วควรรู้ว่าจะไปหยิบอะไรที่ไหน · ปรับปรุง 4 ก.ย. 2569

## เพิ่งเข้ามาดู อ่าน 4 ไฟล์นี้พอ

**PDF ทุกไฟล์ที่ตั้งใจให้อ่าน อยู่ใน [`report/`](report/) ที่เดียว** เปิดได้เลยไม่ต้องติดตั้งอะไร

| อยากรู้ว่า | เปิดไฟล์นี้ |
|---|---|
| โครงการนี้จะทำอะไร ขอบเขตแค่ไหน | [`report/main.pdf`](report/main.pdf) — ข้อเสนอโครงการ 42 หน้า |
| ระบบต้องทำอะไรได้บ้าง (ความต้องการ 116 ข้อ) | [`report/ULMs-SRS-v1.0.pdf`](report/ULMs-SRS-v1.0.pdf) — 21 หน้า |
| ระบบออกแบบไว้ยังไง ตอนนี้ทำถึงไหนแล้ว | [`report/ULMs-SDS-v1.0.pdf`](report/ULMs-SDS-v1.0.pdf) — 40 หน้า เขียนจากโค้ดจริงบน `main` |
| ตอนนี้ช้าหรือเร็วกว่าแผน เหลืออะไรบ้าง | [`report/progress-report-02.pdf`](report/progress-report-02.pdf) — 15 หน้า ฉบับล่าสุดที่ส่งอาจารย์ |

SRS กับ SDS มี `.docx` ชื่อเดียวกันในโฟลเดอร์เดียวกัน ถ้าอยากเปิดใน Word
**แต่ห้ามแก้ `.docx` ตรง ๆ** มันถูกสร้างจาก [`specs/`](specs/) จะหายตอนสร้างใหม่

> **ทางลัดอื่นที่ถูกถามบ่อย**
> - เอกสารเรื่อง contract tRPC → `report/trpc-guide.pdf` + `report/trpc-meeting.pdf`
> - **ต้องแก้อะไรบ้างถึงจะต่อ frontend/backend ได้ → `report/spike-gap.pdf` (31 หน้า)**
> - รายงานความก้าวหน้าครั้งที่ 1 (27 ส.ค.) → `report/progress-report-01.pdf` เก็บไว้อ้างอิง
>   **ห้ามส่งและห้ามอ้าง `progress.pdf` / `progress2.pdf` / `progress3.pdf`**
>   ทั้งสามเป็นร่างภายในที่ไม่เคยส่ง อ้างถึงกันเองอยู่ และหยุดอัปเดตไว้ที่ 13 ส.ค. แล้ว

### ของที่ไม่ได้อยู่ใน git อย่าไปหา

ตั้งใจไม่ commit เพราะสร้างใหม่ได้ หรือไม่ใช่ผลงานของทีม ถ้าต้องการให้ทักคนที่ดูแลเอกสาร

| ไม่มีใน repo | ทำไม | ได้มายังไง |
|---|---|---|
| `build/` | ผลลัพธ์ของ latexmk ทั้งโฟลเดอร์ | `cd docs && latexmk <ชื่อ>.tex` |
| `resource/` (27 MB) | สไลด์ประกอบวิชาและไฟล์ Excel ของทีม ไม่ใช่ผลงานเรา | ช่องทางเดิมของวิชา/ทีม |
| รูป PNG ใน `slides/` · `bpmn/png/` | สคริปต์สร้างใหม่ได้ เก็บเฉพาะ SVG ที่เล็กกว่ามาก | รันสคริปต์ในโฟลเดอร์นั้น |
| `slides/ui-slides/` · `slides/screens/` | SVG ฝังภาพหน้าจอ หนัก 5.2 MB และ 1.9 MB | `gen_flow_slides.py` · `extract_screens.py` |
| `PROGRESS.md` | สมุดงานของ SA มีโน้ตระหว่างทางที่ยังไม่สรุป | สิ่งที่สรุปแล้วอยู่ในรายงานที่ `report/` |

---

## 1 · เอกสาร LaTeX (ต้นฉบับที่แก้ได้)

สร้างด้วย **XeLaTeX เท่านั้น** (`latexmk <ชื่อไฟล์>.tex` จาก `docs/` — `.latexmkrc` บังคับให้แล้ว)
ผลลัพธ์ออกที่ `build/` ทุกครั้ง

| ไฟล์ | คืออะไร | preamble ที่ใช้ | ผลลัพธ์ |
|---|---|---|---|
| `main.tex` | ข้อเสนอโครงการ ประกอบจาก `sections/` | `ulms-preamble.tex` | `build/main.pdf` 42 น. |
| `progress-report-02.tex` | **ฉบับส่งอาจารย์ล่าสุด** — ครั้งที่ 2 รอบ 28 ส.ค. – 4 ก.ย. (วันที่ 8 ของ Sprint 3) · ตัวเลขทุกตัวอ้าง `origin/main` ที่ `99da590` · มีตารางผลของแผนรายวันที่ฉบับที่ 1 ตั้งไว้ ซึ่งฉบับที่ 1 ไม่มี | `ulms-preamble.tex` | `build/progress-report-02.pdf` 15 น. |
| `progress-report-01.tex` | ฉบับส่งอาจารย์ครั้งที่ 1 (27 ส.ค. จบ Sprint 2) — **ส่งไปแล้ว ห้ามแก้ย้อนหลัง** ฉบับใหม่ให้สร้างไฟล์ใหม่แทน เพราะรอบถัดไปต้องอ้างค่าที่ส่งไปจริง | `ulms-preamble.tex` | `build/progress-report-01.pdf` 14 น. |
| `progress.tex` | ร่างภายใน รอบ 7 ส.ค. — เก็บไว้ไม่แก้ **ไม่ส่ง** | `ulms-preamble.tex` | `build/progress.pdf` 14 น. |
| `progress2.tex` | ร่างภายใน รอบ 10 ส.ค. — มีแผน Sprint ที่ปรับใหม่ **ไม่ส่ง** | `ulms-preamble.tex` | `build/progress2.pdf` 21 น. |
| `progress3.tex` | ร่างภายใน รอบ 13 ส.ค. (หยุดอัปเดตแล้ว) — มีภาคผนวก ก (ที่มาของตัวเลขรายมิติ) และ ภาคผนวก ค (ตารางหลักฐานทุกข้อความ) ซึ่งฉบับส่งไม่มี **ไม่ส่ง** | `ulms-preamble.tex` | `build/progress3.pdf` 29 น. |
| `trpc-guide.tex` | หลักการ tRPC + ความเสี่ยง 8 ข้อในรีโปนี้ | `trpc-preamble.tex` | `build/trpc-guide.pdf` 31 น. |
| `trpc-meeting.tex` | วาระประชุมสัญญา tRPC 19 วาระ | `trpc-preamble.tex` | `build/trpc-meeting.pdf` 33 น. |
| `spike-gap.tex` | ระยะห่างระหว่างโค้ดจริงกับ spike ที่ต่อสำเร็จ · 19 จุดที่ต้องแก้ | `trpc-preamble.tex` | `build/spike-gap.pdf` 31 น. |

**preamble มีสองตัว อย่าสลับกัน**

- `ulms-preamble.tex` — โทนขาวดำ ตั้งใจให้พิมพ์ขาวดำได้ ใช้กับเอกสารส่งอาจารย์
- `trpc-preamble.tex` — มีระบบสีเชิงความหมาย กล่อง 4 แบบ และ `listings` ใช้กับเอกสารสอน
  <br><sub>ห้ามก๊อป preamble ไปวางซ้ำเป็นตัวที่สาม — แก้ที่ไฟล์เดียวให้มีผลทุกเอกสาร</sub>

`sections/` — เนื้อหาของ `main.tex` แยกเป็นไฟล์ตามหัวข้อ (`01_project_name` … `09_appendix`)
ไฟล์ที่ขึ้นต้นด้วย `_` เป็นภาพ TikZ ที่ถูก `\input` ซ้อนอีกชั้น ไม่ได้เรียกตรงจาก `main.tex`

`figures/er_diagram.png` — รูปเดียวที่เป็นไฟล์ภาพ ที่เหลือวาดด้วย TikZ ในตัว `.tex` เอง

### เอกสารที่ไม่ได้ใช้ LaTeX — `specs/`

SRS กับ SDS ต้องส่งเป็นไฟล์ที่อาจารย์แก้ต่อในเวิร์ดได้ จึงสร้างด้วย `python-docx`
แทน LaTeX แล้วให้ LibreOffice แปลง `.docx` ตัวเดียวกันเป็น PDF — Word กับ PDF
จึงมาจากต้นฉบับเดียว ไม่ใช่คนละไฟล์ที่ต้องคอยไล่ให้ตรงกัน

```bash
cd docs/specs
uv run --with python-docx --python 3.12 python gen_srs_docx.py   # -> build/ULMs-SRS-v1.0.{docx,pdf}
uv run --with python-docx --python 3.12 python gen_sds_docx.py   # -> build/ULMs-SDS-v1.0.{docx,pdf}
```

| ไฟล์ | คืออะไร |
|---|---|
| `specs/srs_data.py` | เนื้อหา SRS 21 หน้า — ความต้องการเดิมของทีมทุกข้อ เรียงตามกรอบ IEEE 830 ของสไลด์ Week 05 |
| `specs/sds_data.py` | เนื้อหา SDS 40 หน้า — เรียงตามโครง 11 หัวข้อของสไลด์ Week 09 · เขียนจากโค้ดบน `origin/main` · **fetch ก่อนสร้างใหม่ทุกครั้ง** |
| `specs/figures/` | use case · business object · ER · ผังกระบวนการ 4 ผัง |
| `specs/doc_builder.py` | รูปแบบทั้งหมด ใช้ร่วมกันสองฉบับ |

**ต้องมีฟอนต์ Sarabun ในเครื่อง** มิฉะนั้นหน้าจะเลื่อน · รายละเอียดที่
[`specs/README.md`](specs/README.md)

---

## 2 · `trpc-example/` — โค้ดตัวอย่างของผลลัพธ์การประชุม

28 ไฟล์ แสดงว่าโค้ดจะหน้าตาแบบไหนเมื่อตกลงวาระ ว-01 ถึง ว-10 เสร็จ
ก๊อปวางไปใช้ได้จริง ทุกไฟล์มีคอมเมนต์หัวไฟล์บอกว่าตอบวาระไหนและปลายทางจริงอยู่ที่ไหน

**เริ่มอ่านที่ [`trpc-example/README.md`](trpc-example/README.md)** — มีตารางแมป วาระ → ไฟล์ อยู่ในนั้น
ไม่ต้องอ่านซ้ำที่นี่

| โฟลเดอร์ | มีอะไร |
|---|---|
| `trpc-example/package.json` | workspace root — `workspaces: [frontend, backend, packages/*]` |
| `trpc-example/packages/contract/` | **แพ็กเกจสัญญา** — `index.ts`, `generated/`, `schemas/`, `errors/` |
| `trpc-example/backend/src/` | `app.module.ts`, `main.ts`, `trpc/`, `common/{errors,mappers}/`, `auth/`, `loan/` |
| `trpc-example/frontend/src/` | `lib/trpc.ts`, `lib/error-messages.ts`, `features/loan/` |
| `trpc-example/process/` | เจ้าของสัญญา + PR template |
| `trpc-example/CONTRACT.md` | ตารางสัญญาที่คนอ่านได้ (ยังเป็นร่าง) |
| `trpc-example/STRUCTURE.md` | **ของจริงควรอยู่ที่ไหน + ใครรับผิดชอบ** — โครงเป้าหมาย 2 แบบ และลำดับการย้าย |

---

## 3 · `report/` — ระวัง ที่นี่ปนกันสองยุค

โฟลเดอร์นี้มีทั้ง **ของใหม่ที่ยังใช้** และ **ซากจากยุคก่อนย้ายมา LaTeX**

| ใช้ต่อ | ไฟล์ |
|---|---|
| ✅ | **`main.pdf`** — ข้อเสนอโครงการฉบับล่าสุด ใช้ตัวนี้ ไม่ใช่ไฟล์ `proposal` ข้างล่าง |
| ✅ | **`ULMs-SRS-v1.0.pdf` / `.docx`** · **`ULMs-SDS-v1.0.pdf` / `.docx`** — ฉบับทางการ |
| ✅ | **`progress-report-02.pdf`** (ล่าสุด) · `progress-report-01.pdf` (27 ส.ค. เก็บอ้างอิง) |
| ✅ | `trpc-guide.pdf`, `trpc-meeting.pdf`, `spike-gap.pdf` — คัดลอกมาจาก `build/` |
| ✅ | `references.bib` — บรรณานุกรม |

ทุกไฟล์ที่ติด ✅ คัดลอกมาจาก `build/` ด้วย `cp build/<ชื่อ>.pdf report/`
**ถ้าแก้ `.tex` แล้ว build ใหม่ ต้องคัดลอกมาทับที่นี่ด้วย** มิฉะนั้นคนอื่นจะอ่านของเก่า

ที่เหลือเป็น **ประวัติศาสตร์ อย่าเอาไปส่ง**: ไฟล์ `.doc/.odt/.docx` และ PDF อีก 6 ไฟล์
ที่ชื่อคล้ายกันจนสับสน (`UMLs_proposal.pdf`, `UMLs_proposal_fianl.pdf`,
`UMLs_proposal_fianl2.pdf`, `Proposal_ULMs.pdf`, `propposal with flow.pdf`,
`ULMs_proposal.pdf`) — ทั้งหมดเป็นผลลัพธ์จากยุคที่ยังเขียนใน Word
**ตัวใหม่สุดคือ `ULMs_proposal.pdf` (30 ก.ค.) แต่ก็ยังเก่ากว่า `build/main.pdf`**

`ข้อเสนอโครงการ_..._Draft-v1(1).docx` คือต้นฉบับที่ถูกแปลงมาเป็น `main.tex`
เก็บไว้อ้างอิงว่าแปลงครบไหม

---

## 4 · `resource/` — วัตถุดิบจากทีมและจากวิชา

ไม่ใช่ผลงานของเรา แต่เป็นที่มาของเนื้อหาในรายงาน

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `DatabaseDesign4.pdf` | สคีมาฐานข้อมูล **เวอร์ชันที่ใช้อยู่** (v3 เป็นของเก่า) |
| `Flow การยืม(3).xlsx` | กฎการยืม + ระบบเครดิต → §5 ของรายงาน |
| `ULMs — MVP Checklist ต่อ Sprint.xlsx` | ขอบเขต MVP แบ่งตาม sprint |
| `ULMs_Software_Project_Presentation_V.pdf` | สไลด์นำเสนอของทีม |
| `ULMS_FlowBoard_standalone.html` | บอร์ดผังงาน เปิดในเบราว์เซอร์ได้เลย |
| `Week 05/06 - ...pdf` | เอกสารประกอบวิชา (requirements gathering, progress report) |
| `Flowchart Whiteboard ...pdf`, `before blacking.docx` | ร่างเก่า |

---

## 5 · `slides/` — สไลด์ที่สร้างจากสคริปต์

Python สร้าง SVG/PNG **อย่าแก้ไฟล์ภาพโดยตรง** ให้แก้ข้อมูลแล้วรันใหม่

| ไฟล์ | หน้าที่ |
|---|---|
| `gen_schema_cards.py` + `schema_data.py` | การ์ดอธิบายสคีมา → `schema-cards/` (31 ไฟล์) |
| `gen_flow_slides.py` + `flow_data.py` | สไลด์ UI/UX → `ui-slides/` (24 ไฟล์) |
| `extract_screens.py` | ตัดภาพหน้าจอออกจากบอร์ด → `screens/` (19 ไฟล์) |
| `slide_theme.py` | สี ฟอนต์ ตัวเรนเดอร์ ที่สองสคริปต์ใช้ร่วมกัน |
| `README.md` | วิธีรัน |

---

## 6 · ไฟล์เบ็ดเตล็ดใน `docs/`

| ไฟล์ | คืออะไร |
|---|---|
| `PROGRESS.md` | **บันทึกความคืบหน้าสะสม + กับดักที่เคยเจอ** อ่านก่อนแก้อะไรที่ไม่คุ้น |
| `INDEX.md` | ไฟล์นี้ |
| `.latexmkrc` | บังคับ XeLaTeX + ให้ output ไป `build/` |
| `ความคิดเห็น database.txt` | โน้ตจากทีมเรื่องฐานข้อมูล |
| `ตาราง item แยกตามชิ้น.txt` | โน้ตเรื่องการแยกอุปกรณ์รายชิ้น |
| `build.log`, `build2.log` | ล็อกเก่า ลบได้ |
| `build/` | ผลลัพธ์การคอมไพล์ **สร้างใหม่ได้เสมอ ไม่ต้อง commit** |

---

## 7 · นอก `docs/` — โค้ดและวัตถุดิบที่รากรีโป

### โฟลเดอร์ `-preview` คือ git worktree ไม่ใช่สำเนา

จุดที่คนใหม่สับสนบ่อยที่สุด — รีโปนี้เช็กเอาต์สามสาขาไว้พร้อมกันบนดิสก์

```
SoftwareEn/                    document-branch   <- คุณอยู่ตรงนี้ (เอกสาร)
├── frontend-preview/          front-end-branch  <- worktree
└── backend-preview/           back-end-branch   <- worktree
```

ดูได้ด้วย `git worktree list` · แปลว่าแก้ไฟล์ใน `backend-preview/` = แก้บนสาขา
`back-end-branch` ไม่ใช่สาขาที่คุณกำลังยืนอยู่

| พาธ | คืออะไร |
|---|---|
| `backend-preview/backend/` | **โค้ด backend ตัวจริง** — NestJS 11 + Prisma 7 + nestjs-trpc |
| `backend-preview/backend/prisma/schema.prisma` | **สคีมาฐานข้อมูลตัวจริง** 32 ตาราง ไม่มี enum เลยสักตัว |
| `frontend-preview/frontend/` | **โค้ด frontend ตัวจริง** — Vite + React 18 + TanStack Query |
| `frontend/` (ที่ราก) | สำเนาของอันบนที่อยู่บน `document-branch` — ตอนนี้เนื้อหาตรงกันทุกไฟล์ แต่อาจหลุดจากกันได้ ถ้าจะแก้โค้ดจริงให้แก้ที่ `frontend-preview/frontend/` |
| `รายการเรียกใช้งานจาก Backend.pdf` | รายการ endpoint 3 กลุ่ม + ความถี่ polling — **ต้นทางของตารางสัญญา** |
| `ULMs_ER_v3.mermaid` | ER diagram ต้นฉบับ |
| `ULMS_ยืมคืนอุปกรณ์_UX-Redesign.html` | บอร์ด UX เปิดในเบราว์เซอร์ได้ |

<sub>ไฟล์สามอันสุดท้ายมีสำเนาซ้ำอยู่ใน `frontend-preview/` และ `backend-preview/` ด้วย เพราะถูก commit ไว้บนทุกสาขา</sub>

---

## คำสั่งที่ใช้บ่อย

```bash
cd ~/Projects/SoftwareEn/docs

latexmk main.tex            # ข้อเสนอโครงการ  -> build/main.pdf
latexmk progress.tex        # รายงานก้าวหน้า ครั้งที่ 1 -> build/progress.pdf
latexmk progress2.tex       # รายงานก้าวหน้า ครั้งที่ 2 -> build/progress2.pdf
latexmk progress3.tex       # ร่างภายใน ฉบับละเอียด -> build/progress3.pdf
latexmk progress-report-02.tex   # *** ฉบับส่งอาจารย์ล่าสุด *** -> build/progress-report-02.pdf
latexmk progress-report-01.tex   # ฉบับส่งอาจารย์ครั้งที่ 1 (ส่งไปแล้ว)
latexmk trpc-guide.tex      # หลักการ tRPC    -> build/trpc-guide.pdf
latexmk trpc-meeting.tex    # วาระประชุม      -> build/trpc-meeting.pdf

cp build/trpc-*.pdf report/ # PDF ที่ส่งต่อให้คนอื่นอยู่ที่ report/
latexmk -c                  # ลบไฟล์ aux เก็บ PDF ไว้
```
