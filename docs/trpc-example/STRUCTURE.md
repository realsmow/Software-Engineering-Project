# ของจริงควรอยู่ที่ไหน และใครรับผิดชอบ

> ปลายทางจริง: `STRUCTURE.md` ที่รากรีโป (ย้ายออกจาก `docs/trpc-example/` เมื่อประชุมจบ)
>
> **โครงทั้งหมดในเอกสารนี้อิงทางเลือก ก. (npm workspaces)** ซึ่งเป็นทางที่ทีม
> มีแนวโน้มจะเลือก · หัวข้อ 7 สรุปว่าอะไรเปลี่ยนบ้างถ้าสุดท้ายไปทางเลือก ข.
>
> ช่อง **ผู้รับผิดชอบ** เว้นไว้ให้กรอกในที่ประชุม (วาระ ว-04)

---

## 1 · โครงตอนนี้ กับโครงเป้าหมาย

### ตอนนี้

```
SoftwareEn/                        document-branch
├── frontend/                      สำเนาบน document-branch
├── frontend-preview/              worktree ของ front-end-branch
│   └── frontend/                  <- โค้ด frontend ตัวจริง
├── backend-preview/               worktree ของ back-end-branch
│   └── backend/                   <- โค้ด backend ตัวจริง
└── docs/                          เอกสาร (คุณอยู่ตรงนี้)
```

ปัญหา: `package.json` สามไฟล์ที่ไม่รู้จักกัน มี `node_modules` คนละกอง
`import type` ข้ามไม่ได้ - และ **merge สาขาไม่ได้แก้เรื่องนี้** (ดู ว-01)

### เป้าหมาย

```
SoftwareEn/                        main (merge ทั้งสองสาขาแล้ว)
├── package.json                   ★ workspace root - workspaces: [frontend, backend, packages/*]
├── package-lock.json              ★ ไฟล์เดียวของทั้งรีโป
├── node_modules/                  ★ กองเดียว ← นี่คือเหตุผลทั้งหมดของทางเลือกนี้
│
├── packages/
│   └── contract/                  ★ สัญญาเป็น workspace ของตัวเอง
│       ├── package.json           ชื่อ @ulms/contract
│       └── src/
│           ├── index.ts           หน้าตาสาธารณะ - ทุกคน import จากที่นี่
│           ├── generated/         ★ nestjs-trpc เขียนลงตรงนี้ (ห้ามแก้มือ)
│           ├── schemas/           zod schema ที่สองฝั่งใช้ร่วมกัน
│           └── errors/            รหัส error ทางธุรกิจ
│
├── frontend/                      ไม่มี node_modules ของตัวเองแล้ว
│   └── src/
│       ├── lib/trpc.ts            ★ ใหม่
│       ├── lib/error-messages.ts  ขยายของเดิม
│       └── features/              ของเดิม
│
├── backend/                       ← ย้ายจาก backend-preview/backend/
│   └── src/
│       ├── trpc/                  ★ context + middleware
│       ├── common/errors/         business-error.ts (ฝั่ง server เท่านั้น)
│       ├── common/mappers/        แปลง Prisma row → รูปร่างในสัญญา
│       ├── auth/  loan/  item/    ★ หนึ่งโฟลเดอร์ต่อหนึ่งโดเมน
│       └── prisma.service.ts      ของเดิม
│
├── CONTRACT.md                    ★ ตารางสัญญาที่คนอ่านได้
├── CONTRACT-OWNERS.md             ★ เจ้าของ + กระบวนการขอเปลี่ยน
├── STRUCTURE.md                   ★ ไฟล์นี้
└── .github/
    ├── workflows/ci.yml           ★ ยังไม่มี CI ในรีโปเลย
    └── pull_request_template.md   ★ ใหม่
```

**สังเกตว่าไม่มี `scripts/sync-contract.sh`** - ทางเลือก ก. ไม่ต้องคัดลอกอะไร
เพราะ backend เขียนไฟล์สัญญาลง `packages/contract/src/generated/` โดยตรง
แล้ว frontend เห็นทันทีผ่านชื่อแพ็กเกจ

---

## 2 · กฎการ import ที่เปลี่ยนไป

| จาก | เป็น |
|---|---|
| `import ... from '../../backend/src/@generated/appRouter'` | `import type { AppRouter } from '@ulms/contract'` |
| `import { userOutput } from '../common/schemas/user.schema'` | `import { userOutput } from '@ulms/contract'` |
| frontend เขียน zod schema ของฟอร์มเอง | `import { createLoanInput } from '@ulms/contract'` - ใช้ตัวเดียวกับที่ backend validate |

**ไม่มีพาธสัมพัทธ์ข้ามโฟลเดอร์อีกต่อไป** ถ้าเห็น `../../` ที่ออกนอก workspace
ตัวเอง แปลว่ามีคนทำผิดกฎ

แถวสุดท้ายคือประโยชน์ที่ทางเลือก ข. ให้ไม่ได้ - ที่นั่น frontend ต้องเขียน
schema ของฟอร์มซ้ำเอง ซึ่งก็คือเปิดช่องให้ความจริงสองชุดเลื่อนออกจากกันอีกรอบ

---

## 3 · ไฟล์ตัวอย่างแต่ละไฟล์ไปอยู่ที่ไหน

| ไฟล์ตัวอย่าง | ปลายทางจริง | วาระ | ใครวาง | ใครดูแลต่อ |
|---|---|---|---|---|
| `package.json` | `package.json` (ราก) | ว-01 | | |
| `packages/contract/package.json` | เหมือนกัน | ว-01 | | |
| `packages/contract/src/index.ts` | เหมือนกัน | ว-01 | | |
| `packages/contract/src/generated/appRouter.ts` | เหมือนกัน **(generated ห้ามแก้มือ)** | ว-01 | | |
| `packages/contract/src/schemas/pagination.schema.ts` | เหมือนกัน | ว-07 | | |
| `packages/contract/src/schemas/datetime.schema.ts` | เหมือนกัน | ว-08 | | |
| `packages/contract/src/schemas/status.schema.ts` | เหมือนกัน | ว-10 | | |
| `packages/contract/src/schemas/user.schema.ts` | เหมือนกัน | ว-09 | | |
| `packages/contract/src/errors/error-codes.ts` | เหมือนกัน | ว-06 | | |
| `backend/src/app.module.ts` | `backend/src/app.module.ts` | ว-01 | | |
| `backend/src/main.ts` | `backend/src/main.ts` | ว-03 | | |
| `backend/src/trpc/context.ts` | `backend/src/trpc/context.ts` | ว-03 | | |
| `backend/src/trpc/auth.middleware.ts` | `backend/src/trpc/auth.middleware.ts` | ว-03 ว-05 | | |
| `backend/src/common/errors/business-error.ts` | เหมือนกัน - อยู่ฝั่ง server เพราะ frontend ไม่เคยโยน error | ว-06 | | |
| `backend/src/common/mappers/user.mapper.ts` | เหมือนกัน - เรื่องภายในของ backend ไม่เข้าสัญญา | ว-09 | | |
| `backend/src/auth/*.ts` | `backend/src/auth/` | slice แรก | | |
| `backend/src/loan/*.ts` | `backend/src/loan/` | ว-05 | | |
| `frontend/src/lib/trpc.ts` | `frontend/src/lib/trpc.ts` | ว-01 ว-13 | | |
| `frontend/src/lib/error-messages.ts` | รวมกับไฟล์เดิมที่มีอยู่แล้ว | ว-06 | | |
| `frontend/src/features/loan/use-loans.ts` | `frontend/src/features/borrower/loans/` | ตัวอย่าง | | |
| `process/CONTRACT-OWNERS.md` | `CONTRACT-OWNERS.md` (ราก) | ว-04 | | |
| `process/pull_request_template.md` | `.github/pull_request_template.md` | ว-04 | | |
| `CONTRACT.md` | `CONTRACT.md` (ราก) | ว-05…ว-10 | | |
| `STRUCTURE.md` | `STRUCTURE.md` (ราก) | - | | |

### เส้นแบ่งว่าอะไรเข้า `packages/contract/` ได้

| เข้าได้ | เข้าไม่ได้ |
|---|---|
| zod schema ของ input/output | ตรรกะธุรกิจ |
| รหัส error + ชนิดข้อมูลประกอบ | การต่อฐานข้อมูล, Prisma model |
| สตริงคงที่ของสถานะ (`approveStatus` ฯลฯ) | mapper ที่แปลงจาก Prisma row |
| type ของ `AppRouter` | ข้อความภาษาไทย |

เกณฑ์ง่าย ๆ: **ถ้าอีกฝั่งไม่จำเป็นต้องรู้ อย่าเอาเข้า** แพ็กเกจนี้ยิ่งเล็กยิ่งดี
เพราะทุกอย่างในนี้แก้แล้วกระทบสองฝั่งพร้อมกัน

---

## 4 · ใครรับผิดชอบอะไร แบ่งตามชั้น

ตารางนี้ต่างจาก `CONTRACT-OWNERS.md` - อันนั้นว่าด้วย **ใครอนุมัติการเปลี่ยนสัญญา**
ส่วนอันนี้ว่าด้วย **ใครเขียนและดูแลไฟล์**

| ชั้น | โฟลเดอร์ | ฝั่งที่ดูแล | ผู้รับผิดชอบ | หมายเหตุ |
|---|---|---|---|---|
| **แพ็กเกจสัญญา** | `packages/contract/` | **ทั้งคู่ต้องเห็นชอบ** | | แก้ที่นี่ = เปลี่ยนสัญญา ต้องทำตามกระบวนการ |
| workspace root | `package.json`, `package-lock.json` | **ต้องมีเจ้าของชัดเจน** | | ใครเพิ่ม dependency ต้องรู้ว่าใส่ workspace ไหน |
| โครงสร้างพื้นฐาน tRPC | `backend/src/trpc/` | backend | | context + middleware กระทบทุก procedure |
| ตรรกะธุรกิจ | `backend/src/<โดเมน>/` | backend | ตามโดเมนใน `CONTRACT-OWNERS.md` | |
| การแปลงข้อมูล | `backend/src/common/mappers/` | backend | | |
| การเชื่อมต่อ | `frontend/src/lib/trpc.ts` | frontend | | |
| ข้อความผู้ใช้ | `frontend/src/lib/error-messages.ts` | frontend | | backend ห้ามส่งข้อความไทยมา |
| หน้าจอ | `frontend/src/features/` | frontend | ตามกลุ่มผู้ใช้ | |
| CI | `.github/` | **ต้องมีเจ้าของชัดเจน** | | ข้อนี้มักไม่มีใครรับ แล้วก็ไม่มีใครทำ |
| เอกสารสัญญา | `CONTRACT.md` | **ทั้งคู่** | | อัปเดตทุกครั้งที่เพิ่ม procedure |

### กลุ่มผู้ใช้ใน `frontend/src/features/` (มีอยู่แล้วในรีโป)

`admin/` · `staff/` · `supervisor/` · `borrower/` · `reports/` · `auth/`

---

## 5 · ไฟล์สามประเภทที่ต้องปฏิบัติต่างกัน

| ประเภท | ตัวอย่าง | กฎ |
|---|---|---|
| **สร้างอัตโนมัติ** | `packages/contract/src/generated/`, `backend/src/generated/prisma/` | **ห้ามแก้ด้วยมือเด็ดขาด** แก้ต้นทางแล้วสร้างใหม่ · conflict ให้ regenerate ไม่ใช่แก้มือ |
| **ใช้ร่วมกันสองฝั่ง** | `packages/contract/src/{schemas,errors}/`, `CONTRACT.md` | แก้ได้ แต่ต้องแจ้งอีกฝั่งก่อนตามกระบวนการใน `CONTRACT-OWNERS.md` |
| **ของฝั่งใครฝั่งมัน** | `backend/src/<โดเมน>/*.service.ts`, `frontend/src/features/` | แก้ได้เลย ไม่ต้องถามใคร |

---

## 6 · เพิ่ม procedure ใหม่หนึ่งตัว ต้องแตะไฟล์ไหนบ้าง

ใช้เป็นแบบฝึกหัดตรวจว่าเข้าใจโครงตรงกันหรือยัง - สมมติเพิ่ม `loan.extend`
(ขอต่ออายุการยืม)

| # | ไฟล์ | ทำอะไร | ฝั่ง |
|---|---|---|---|
| 1 | `CONTRACT.md` | เพิ่มแถว: input, output, role, error ที่เป็นไปได้ | ทั้งคู่ตกลง |
| 2 | `packages/contract/src/errors/error-codes.ts` | เพิ่ม `EXTENSION_QUOTA_EXCEEDED` + ข้อมูลประกอบ | ทั้งคู่ |
| 3 | `frontend/src/lib/error-messages.ts` | เพิ่มข้อความไทยของรหัสใหม่ (ไม่เพิ่ม → **compile ไม่ผ่าน**) | frontend |
| 4 | `backend/src/loan/loan.schema.ts` | `extendLoanInput` + ใช้ `loanOutput` เดิม | backend |
| 5 | `backend/src/loan/loan.router.ts` | `@Mutation` + `input` + `output` + middleware | backend |
| 6 | `backend/src/loan/loan.service.ts` | stub คืน mock ก่อน แล้วค่อยต่อ Prisma | backend |
| 7 | `frontend/src/features/borrower/loans/` | เรียกใช้ + `invalidate` query ที่เกี่ยวข้อง | frontend |
| 8 | `npm run typecheck` ที่ราก | ตรวจทั้งสาม workspace ในคำสั่งเดียว | ทั้งคู่ |

**ไม่มีขั้น "รันสคริปต์คัดลอกสัญญา"** - นั่นคือความแตกต่างที่รู้สึกได้ทุกวัน
ระหว่างสองทางเลือก

> ถ้า `loan.extend` ต้องใช้ schema ที่ frontend ก็ต้องใช้ด้วย (เช่นฟอร์มเลือกวัน)
> ให้ย้าย `extendLoanInput` จาก `backend/src/loan/loan.schema.ts` ไปไว้ใน
> `packages/contract/src/schemas/` แทน แล้ว backend import กลับมา

---

## 7 · ลำดับการย้ายของจริง

ห้ามย้ายทีเดียวทั้งหมด ให้เรียงแบบนี้เพื่อให้ทุกขั้นตรวจสอบได้

| ขั้น | ทำอะไร | ตรวจว่าเสร็จด้วย | ผู้รับผิดชอบ |
|---|---|---|---|
| 0 | merge `front-end-branch` + `back-end-branch` เข้า `main` | ทั้งสองฝั่งยัง build ผ่าน (`git merge-tree` บอกว่า 0 conflict) | |
| 1 | ยก `zod` เป็น 4 ฝั่ง frontend (PR แยก) | `npm run typecheck` ผ่าน | |
| 2 | ย้าย `backend-preview/backend/` → `backend/` + `git worktree remove` | `npx prisma generate` ยังผ่าน | |
| 3 | สร้าง `package.json` ราก + `packages/contract/` ลบ `node_modules` ย่อยแล้ว `npm install` | `ls node_modules` มีที่รากที่เดียว | |
| 4 | ย้าย schema/error ที่ใช้ร่วมกันเข้า `packages/contract/` | `npm run typecheck` ผ่านทั้งสาม workspace | |
| 5 | วางชั้น `trpc/` + เปิด CORS + ตั้ง `autoSchemaFile` | `npm run dev:be` ขึ้นได้ และมีไฟล์โผล่ใน `generated/` | |
| 6 | vertical slice `auth.me` ให้วิ่งครบ | เปลี่ยนฟิลด์ใน `userOutput` แล้ว **frontend ต้อง compile ไม่ผ่าน** | |
| 7 | ตั้ง CI (`typecheck` ที่ราก) | PR ทดสอบถูก block จริงเมื่อ type ไม่ตรง | |
| 8 | แตกงานขนาน backend/frontend ทีละโดเมน | ตาม Definition of Done ใน `trpc-guide.pdf` ภาค 5 | |

**ขั้น 6 คือขั้นที่พิสูจน์ว่าสัญญาทำงานจริง** ไม่ใช่แค่ข้อมูลวิ่งถึง -
อย่าข้ามไปขั้น 8 ก่อนที่ขั้น 6 จะผ่านเกณฑ์นั้น

### แผนถอย

ขั้น 2–4 คือขั้นที่เสี่ยงที่สุด ถ้าใช้เวลาเกินที่ตกลงกันไว้ (เสนอ 3 ชั่วโมง)
ให้ `git revert` แล้วไปทางเลือก ข. ชั่วคราว **อย่าปล่อยให้รีโปค้างครึ่งทางข้ามคืน**

---

## 8 · ถ้าสุดท้ายเลือกทางเลือก ข. แทน

เปลี่ยนสี่จุด ที่เหลือเหมือนเดิมทั้งหมด

| จุด | ทางเลือก ก. (เอกสารนี้) | ทางเลือก ข. |
|---|---|---|
| `packages/contract/` | มี | **ไม่มี** - schema กลับไปอยู่ที่ `backend/src/common/schemas/` และ `errors/` |
| ปลายทางของ generated | `packages/contract/src/generated/` | `backend/src/@generated/` แล้วคัดลอกไป `frontend/src/server-types/` |
| สคริปต์คัดลอก | ไม่ต้องมี | **ต้องมี** `scripts/sync-contract.sh` + โหมด `--check` ใน CI |
| ของที่ frontend ต้องลง | `@trpc/client`, `@trpc/tanstack-react-query`, `@ulms/contract` | เพิ่ม **`zod@4` และ `@trpc/server` (dev)** ด้วย เพราะไฟล์สัญญาที่คัดลอกมา import สองตัวนั้นเอง |

และ frontend จะ **เอา zod schema ไป validate ฟอร์มซ้ำไม่ได้** ต้องเขียนใหม่เอง

รายละเอียดทั้งสองทางเลือกอยู่ในเอกสารประชุม `trpc-meeting.pdf` วาระ ว-01

---

## เอกสารที่เกี่ยวข้อง

| ไฟล์ | ตอบคำถามอะไร |
|---|---|
| `README.md` (โฟลเดอร์นี้) | วาระไหน → ดูไฟล์ไหน + ของที่ต้องลงเพิ่ม + กับดักที่รู้แล้ว |
| `CONTRACT.md` | procedure มีอะไรบ้าง input/output หน้าตาไหน |
| `process/CONTRACT-OWNERS.md` | ใครอนุมัติการเปลี่ยนสัญญา และเปลี่ยนแล้วต้องทำอะไร |
| `../report/trpc-meeting.pdf` ว-01 | ทำไมต้องเลือกระหว่าง ก. กับ ข. และ merge ช่วยแค่ไหน |
| `../report/trpc-guide.pdf` ภาค 3 | ชิ้นส่วนที่ต้องมีให้ครบ และ checklist |
