# ตัวอย่างผลลัพธ์ของการประชุมสัญญา tRPC

โฟลเดอร์นี้คือ **หน้าตาของโค้ดเมื่อประชุมจบแล้ว** — ทุกไฟล์เป็นของจริงที่ก๊อปวาง
ไปใช้ได้ ไม่ใช่ pseudocode

จุดประสงค์คือให้ทีมเห็นปลายทางก่อนเริ่มถกเถียง เพราะการเถียงว่า "แบ่งหน้าแบบไหนดี"
บนกระดาษกินเวลากว่าการดูโค้ดสองแบบวางข้างกันมาก

> ### ⚠ อ่านก่อน
>
> ไฟล์ทั้งหมด **เขียนบนสมมติฐานว่าที่ประชุมเลือกตามข้อเสนอ** ในเอกสาร
> `trpc-meeting.tex` — ยังไม่ใช่มติ ถ้าที่ประชุมตัดสินต่างออกไป ไฟล์ที่ต้องแก้
> ระบุไว้ในตารางข้างล่างแล้ว
>
> ทุกไฟล์มีคอมเมนต์หัวไฟล์บอกว่า (1) ตอบวาระไหน (2) สมมติว่าเลือกอะไร
> (3) ปลายทางจริงอยู่ที่พาธไหน

---

## วาระไหน → ดูไฟล์ไหน

| วาระ | เรื่อง | ไฟล์ที่แสดงผลลัพธ์ | ถ้าที่ประชุมเลือกอย่างอื่น |
|---|---|---|---|
| **ว-01** | ขนส่งสัญญา | `backend/src/app.module.ts` (`autoSchemaFile`)<br>`scripts/sync-contract.sh`<br>`frontend/src/server-types/appRouter.ts` | เลือก workspaces → ลบ `sync-contract.sh` ทิ้ง แล้วย้ายสัญญาไป `packages/contract/` |
| **ว-02** | เวอร์ชัน zod | ดู "ก่อนใช้งาน" ข้างล่าง | เลือกลด backend เป็น zod 3 → แก้ `z.email()`/`z.iso.datetime()` กลับเป็นรูปแบบของ zod 3 |
| **ว-03** | `ctx.user` + cookie/CORS | `backend/src/trpc/context.ts`<br>`backend/src/trpc/auth.middleware.ts`<br>`backend/src/main.ts` | เปลี่ยนฟิลด์ใน `TrpcUser` ที่เดียว แล้ว compiler จะฟ้องทุกจุดที่ต้องตามแก้ |
| **ว-04** | เจ้าของสัญญา | `process/CONTRACT-OWNERS.md`<br>`process/pull_request_template.md` | กรอกชื่อในตารางระหว่างประชุม |
| **ว-05** | ชื่อ router/procedure | `backend/src/loan/loan.router.ts`<br>`backend/src/auth/auth.router.ts` | เปลี่ยนชุดคำกริยา → แก้ชื่อเมท็อดในทุก router |
| **ว-06** | รูปแบบ error | `backend/src/common/errors/error-codes.ts`<br>`backend/src/common/errors/business-error.ts`<br>`frontend/src/lib/error-messages.ts` | เลือก "ตัดวันยืมอัตโนมัติ" แทนปฏิเสธ → แก้บล็อกใน `loan.service.ts` ตามคอมเมนต์ที่เขียนไว้ |
| **ว-07** | แบ่งหน้า/กรอง | `backend/src/common/schemas/pagination.schema.ts` | เลือก cursor → เปลี่ยน `paginated()` เป็นคืน `{ items, nextCursor }` |
| **ว-08** | วันที่/เวลา | `backend/src/common/schemas/datetime.schema.ts` | เลือก superjson → ลบไฟล์นี้ แล้วตั้ง transformer ทั้งสองฝั่ง |
| **ว-09** | แปลงชื่อฟิลด์ | `backend/src/common/schemas/user.schema.ts`<br>`backend/src/common/mappers/user.mapper.ts` | — (ข้อเสนอนี้แทบไม่มีทางเลือกอื่นที่ปลอดภัย) |
| **ว-10** | สถานะเป็นสตริง | `backend/src/common/schemas/status.schema.ts` | เติม/แก้รายการค่าให้ตรงกับตารางในฐานข้อมูลจริง |
| ทั้งหมด | ตารางสัญญาที่คนอ่านได้ | `CONTRACT.md` | อัปเดตทุกครั้งที่เพิ่ม procedure |

ตัวอย่างการใช้งานฝั่ง frontend ที่รวมทุกมติไว้ในไฟล์เดียว:
`frontend/src/features/loan/use-loans.ts`

---

## เส้นที่ควรทำให้วิ่งก่อน (vertical slice)

`auth.me` — เพราะทุกหน้าใช้ และมันบังคับให้แก้เรื่อง cookie, CORS, context และ
การขนส่งสัญญาไปพร้อมกัน เจอปัญหาโครงสร้างทั้งหมดตั้งแต่ procedure แรก
ตอนที่แก้แล้วกระทบแค่ตัวเดียว

ไฟล์ที่เกี่ยวข้อง: `main.ts` → `context.ts` → `auth.middleware.ts` →
`auth.router.ts` → `auth.service.ts` → `user.mapper.ts` → `sync-contract.sh` →
`frontend/src/lib/trpc.ts`

**เกณฑ์ว่าเสร็จ:** เปิดหน้าที่ยังไม่ล็อกอิน → เด้งไป `/login` → ล็อกอิน →
เห็นชื่อจริงจากฐานข้อมูล **และ** เมื่อลองเปลี่ยนชื่อฟิลด์ใน `userOutput`
ฝั่ง backend แล้วรัน `tsc --noEmit` ฝั่ง frontend **ต้องขึ้น error**

ประโยคหลังคือการทดสอบว่าสัญญาทำงานจริง ไม่ใช่แค่ข้อมูลวิ่งถึง

---

## ก่อนใช้งาน — ของที่ต้องลงเพิ่ม

รีโปตอนนี้ยังขาดสามอย่าง (ตรวจจาก `package.json` จริงเมื่อ 8 ส.ค. 2569)

```bash
# ว-02 — ต้องทำก่อนอย่างอื่น และแยกเป็น PR ของตัวเอง
cd frontend && npm i zod@^4
# ตรวจให้ผ่านก่อนไปต่อ: schemas/loan-request.schema.ts และ @hookform/resolvers
npm run typecheck

# ว-01 — ฝั่ง frontend ยังไม่มีแพ็กเกจของ tRPC เลย
cd frontend && npm i @trpc/client @trpc/tanstack-react-query

# ว-03 — backend ยังไม่มีตัวอ่าน cookie
cd backend-preview/backend && npm i cookie-parser && npm i -D @types/cookie-parser
```

เพิ่มสคริปต์ที่ `package.json` ระดับรากรีโป:

```json
{
  "scripts": {
    "sync:contract": "./scripts/sync-contract.sh",
    "check:contract": "./scripts/sync-contract.sh --check",
    "typecheck": "cd frontend && npm run typecheck && cd ../backend-preview/backend && npx tsc --noEmit"
  }
}
```

---

## ข้อจำกัดที่ต้องรู้

**ตรวจไวยากรณ์แล้ว แต่ยังไม่ได้ตรวจ type** — ไฟล์ `.ts` ทั้ง 15 ไฟล์ผ่าน
`tsc 5.7 --noEmit --strict` โดยไม่มี syntax error (`TS1xxx`) เหลือเลย และ
`sync-contract.sh` ผ่าน `bash -n`

แต่ error ที่เหลืออยู่ 36 รายการล้วนเป็น `TS2307 Cannot find module` และผลพวง
ของมัน เพราะเครื่องที่สร้างไฟล์ชุดนี้ไม่มี `node_modules` ของทั้งสองโปรเจกต์
(`@trpc/*`, `@nestjs/*`, `zod`, `@tanstack/react-query` ยังไม่ได้ลง)
จึงยัง **ไม่ได้พิสูจน์ว่า type ตรงกันจริง**

**ให้รัน `tsc --noEmit` อีกครั้งหลังคัดลอกไปวางในโปรเจกต์จริงเสมอ**

**ชื่อ decorator ของ `nestjs-trpc` ต้องเช็กกับเวอร์ชันที่ลงจริง** — รีโปใช้
`nestjs-trpc@^2.13.0` และ API ของมันขยับระหว่างเวอร์ชันใหญ่ ตัวอย่างในบล็อกเก่า
ใช้ชื่อไม่ตรงกับ 2.x ถ้า `@UseMiddlewares` หรือรูปแบบของ `TRPCModule.forRoot()`
ไม่ตรง ให้ยึดเอกสารของเวอร์ชันที่ลงไว้ **โครงสร้างและการแบ่งไฟล์ยังใช้ได้เหมือนเดิม
เปลี่ยนแค่ชื่อ decorator**

**`prisma.service.ts` และ `prisma.module.ts` ไม่ได้อยู่ในโฟลเดอร์นี้** เพราะมี
อยู่แล้วในรีโปจริง ไฟล์ตัวอย่าง import จากพาธเดิมของมัน

**ค่าที่เป็นตัวอย่างล้วน ๆ** ที่ต้องแทนด้วยของจริง: ชื่อ cookie `ulms_session`,
`DUE_TIME_OF_DAY_UTC`, รายการค่าใน `status.schema.ts`, และ mock ทั้งหมดใน
`loan.service.ts`

---

## เอกสารที่เกี่ยวข้อง

| ไฟล์ | เนื้อหา |
|---|---|
| `../report/trpc-guide.pdf` | หลักการของ tRPC · ทางเดินของ request · ความเสี่ยง 8 ข้อในรีโปนี้ |
| `../report/trpc-meeting.pdf` | วาระประชุม 19 วาระ พร้อมตัวเลือกและเหตุผลของแต่ละข้อเสนอ |
| `../../รายการเรียกใช้งานจาก Backend.pdf` | ร่างสัญญาฉบับแรกของทีม — ต้นทางของตารางใน `CONTRACT.md` |
