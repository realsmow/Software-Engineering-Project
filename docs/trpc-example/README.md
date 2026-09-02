# ตัวอย่างผลลัพธ์ของการประชุมสัญญา tRPC

โฟลเดอร์นี้คือ **หน้าตาของโค้ดเมื่อประชุมจบแล้ว** - ทุกไฟล์เป็นของจริงที่ก๊อปวาง
ไปใช้ได้ ไม่ใช่ pseudocode

จุดประสงค์คือให้ทีมเห็นปลายทางก่อนเริ่มถกเถียง เพราะการเถียงว่า "แบ่งหน้าแบบไหนดี"
บนกระดาษกินเวลากว่าการดูโค้ดสองแบบวางข้างกันมาก

> ### ⚠ อ่านก่อน
>
> **โค้ดชุดนี้เขียนบนสมมติฐานว่าที่ประชุมเลือก ทางเลือก ก. (npm workspaces)**
> ในวาระ ว-01 ซึ่งเป็นทางที่ทีมมีแนวโน้มจะเลือก - ยังไม่ใช่มติ
>
> มติอื่น ๆ ก็อิงข้อเสนอในเอกสาร `trpc-meeting.tex` เช่นกัน ถ้าที่ประชุมตัดสิน
> ต่างออกไป คอลัมน์ขวาสุดของตารางข้างล่างบอกว่าต้องแก้อะไร และ
> [`STRUCTURE.md`](STRUCTURE.md) หัวข้อ 8 สรุปว่าถ้าไปทางเลือก ข. ต้องเปลี่ยนสี่จุดไหน
>
> ทุกไฟล์มีคอมเมนต์หัวไฟล์บอกว่า (1) ตอบวาระไหน (2) สมมติว่าเลือกอะไร
> (3) ปลายทางจริงอยู่ที่พาธไหน

---

## วาระไหน → ดูไฟล์ไหน

| วาระ | เรื่อง | ไฟล์ที่แสดงผลลัพธ์ | ถ้าที่ประชุมเลือกอย่างอื่น |
|---|---|---|---|
| **ว-01** | ขนส่งสัญญา | `package.json` (workspace root)<br>`packages/contract/`<br>`backend/src/app.module.ts` (`autoSchemaFile`) | เลือก ข. → ลบ `packages/contract/` ย้าย schema กลับเข้า `backend/`, เพิ่ม `scripts/sync-contract.sh` |
| **ว-02** | เวอร์ชัน zod | `packages/contract/package.json` ประกาศ `zod@^4` ที่เดียว | เลือกลด backend เป็น zod 3 → แก้ `z.email()`/`z.iso.datetime()` กลับเป็นรูปแบบของ zod 3 |
| **ว-03** | `ctx.user` + cookie/CORS | `backend/src/trpc/context.ts`<br>`backend/src/trpc/auth.middleware.ts`<br>`backend/src/main.ts` | เปลี่ยนฟิลด์ใน `TrpcUser` ที่เดียว แล้ว compiler จะฟ้องทุกจุดที่ต้องตามแก้ |
| **ว-04** | เจ้าของสัญญา | `process/CONTRACT-OWNERS.md`<br>`process/pull_request_template.md` | กรอกชื่อในตารางระหว่างประชุม |
| **ว-05** | ชื่อ router/procedure | `backend/src/loan/loan.router.ts`<br>`backend/src/auth/auth.router.ts` | เปลี่ยนชุดคำกริยา → แก้ชื่อเมท็อดในทุก router |
| **ว-06** | รูปแบบ error | `packages/contract/src/errors/error-codes.ts`<br>`backend/src/common/errors/business-error.ts`<br>`frontend/src/lib/error-messages.ts` | เลือก "ตัดวันยืมอัตโนมัติ" แทนปฏิเสธ → แก้บล็อกใน `loan.service.ts` ตามคอมเมนต์ที่เขียนไว้ |
| **ว-07** | แบ่งหน้า/กรอง | `packages/contract/src/schemas/pagination.schema.ts` | เลือก cursor → เปลี่ยน `paginated()` เป็นคืน `{ items, nextCursor }` |
| **ว-08** | วันที่/เวลา | `packages/contract/src/schemas/datetime.schema.ts` | เลือก superjson → ลบไฟล์นี้ แล้วตั้ง transformer ทั้งสองฝั่ง |
| **ว-09** | แปลงชื่อฟิลด์ | `packages/contract/src/schemas/user.schema.ts`<br>`backend/src/common/mappers/user.mapper.ts` | - (ข้อเสนอนี้แทบไม่มีทางเลือกอื่นที่ปลอดภัย) |
| **ว-10** | สถานะเป็นสตริง | `packages/contract/src/schemas/status.schema.ts` | เติม/แก้รายการค่าให้ตรงกับตารางในฐานข้อมูลจริง |
| ทั้งหมด | ตารางสัญญาที่คนอ่านได้ | `CONTRACT.md` | อัปเดตทุกครั้งที่เพิ่ม procedure |

ตัวอย่างการใช้งานฝั่ง frontend ที่รวมทุกมติไว้ในไฟล์เดียว:
`frontend/src/features/loan/use-loans.ts`

**อยากรู้ว่าไฟล์เหล่านี้ต้องไปวางที่ไหนจริง ๆ และใครดูแล → [`STRUCTURE.md`](STRUCTURE.md)**

---

## ทำไม `packages/contract/` ถึงเป็นหัวใจ

ทางเลือก ก. ไม่ได้แค่ "ทำให้ import ผ่าน" แต่เปลี่ยนวิธีที่ทีมทำงานกับสัญญา

```
backend เขียน router  ──build──▶  packages/contract/src/generated/  ──▶  frontend เห็นทันที
                                            ▲
                        schemas/ + errors/  │  ทั้งสองฝั่ง import จากที่เดียวกัน
```

- **ไม่มีขั้นตอนคัดลอก** จึงไม่มีสถานการณ์ "สัญญาเก่าเงียบ ๆ"
- **มี `node_modules` กองเดียว** จึงไม่มีวันเจอ `zod` สองชุด
- **frontend เอา zod schema ไป validate ฟอร์มได้เลย** - `createLoanInput`
  ตัวเดียวกับที่ backend ใช้ตรวจ ไม่ต้องเขียนซ้ำใน `frontend/src/schemas/`

ข้อสุดท้ายเป็นประโยชน์ที่ทางเลือก ข. ให้ไม่ได้ และเป็นเหตุผลที่ควรย้าย
`extendLoanInput` แบบนี้เข้าแพ็กเกจกลางเมื่อไรก็ตามที่ฟอร์มต้องใช้

---

## เส้นที่ควรทำให้วิ่งก่อน (vertical slice)

`auth.me` - เพราะทุกหน้าใช้ และมันบังคับให้แก้เรื่อง cookie, CORS, context และ
การขนส่งสัญญาไปพร้อมกัน เจอปัญหาโครงสร้างทั้งหมดตั้งแต่ procedure แรก
ตอนที่แก้แล้วกระทบแค่ตัวเดียว

ไฟล์ที่เกี่ยวข้อง: `main.ts` → `context.ts` → `auth.middleware.ts` →
`auth.router.ts` → `auth.service.ts` → `user.mapper.ts` →
`packages/contract/src/index.ts` → `frontend/src/lib/trpc.ts`

**เกณฑ์ว่าเสร็จ:** เปิดหน้าที่ยังไม่ล็อกอิน → เด้งไป `/login` → ล็อกอิน →
เห็นชื่อจริงจากฐานข้อมูล **และ** เมื่อลองเปลี่ยนชื่อฟิลด์ใน `userOutput`
แล้วรัน `npm run typecheck` ที่ราก **ต้องขึ้น error**

ประโยคหลังคือการทดสอบว่าสัญญาทำงานจริง ไม่ใช่แค่ข้อมูลวิ่งถึง

---

## ก่อนใช้งาน - ของที่ต้องทำ

```bash
# ว-02 - ทำก่อนอย่างอื่น และแยกเป็น PR ของตัวเอง
cd frontend && npm i zod@^4
npm run typecheck   # ต้องผ่านก่อนไปต่อ (ระวัง loan-request.schema.ts + @hookform/resolvers)

# ว-01 - ตั้ง workspace (ทำที่รากรีโป หลัง merge สองสาขาแล้ว)
mv backend-preview/backend ./backend
git worktree remove backend-preview
git worktree remove frontend-preview
rm -rf frontend/node_modules backend/node_modules
rm -f  frontend/package-lock.json backend/package-lock.json
# วาง package.json ราก + packages/contract/ ตามไฟล์ตัวอย่าง แล้ว:
npm install                      # ครั้งเดียว ได้ node_modules กองเดียว

# ว-03 - backend ยังไม่มีตัวอ่าน cookie
npm i cookie-parser -w backend
npm i -D @types/cookie-parser -w backend

# ว-01 - frontend ยังไม่มีแพ็กเกจของ tRPC เลยสักตัว
npm i @trpc/client @trpc/tanstack-react-query -w frontend
```

เพิ่ม `"@ulms/contract": "*"` ใน `dependencies` ของทั้ง `frontend/package.json`
และ `backend/package.json`

> **ไม่ต้องลง `@trpc/server` ที่ฝั่ง frontend** - ต่างจากทางเลือก ข. เพราะ
> `packages/contract/package.json` ประกาศไว้เป็น `peerDependencies` แล้ว และ
> `node_modules` มีกองเดียว frontend จึง resolve เจอเอง

---

## กับดักที่รู้ไว้ก่อนจะเจอ

### 1 · NestJS กับ workspace package ที่เป็น TypeScript ดิบ

`packages/contract` ส่งออกเป็นซอร์ส `.ts` ตรง ๆ (ไม่ build เป็น `dist` ก่อน)
Vite จัดการได้สบาย แต่ **`tsc` ของ NestJS จะบ่น** เพราะไฟล์อยู่นอก `rootDir`

สองทางแก้ เลือกทางใดทางหนึ่ง

```jsonc
// ทาง A - ให้ backend มองเห็นซอร์สของ contract (ง่ายกว่า)
// backend/tsconfig.json
{
  "compilerOptions": { /* ไม่ต้องตั้ง rootDir */ },
  "include": ["src", "../packages/contract/src"]
}

// ทาง B - ให้ contract build เป็น dist ก่อน (สะอาดกว่า แต่มีขั้นตอนเพิ่ม)
// packages/contract/package.json
{ "main": "./dist/index.js", "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc" } }
// แล้วต้องรัน npm run build -w packages/contract ก่อน build backend ทุกครั้ง
```

**แนะนำทาง A ตอนเริ่ม** เพราะ dev loop สั้นกว่า ถ้าวันหลังต้อง deploy แยก
ค่อยย้ายไปทาง B

### 2 · พาธของ Prisma พังตอนย้ายโฟลเดอร์

`schema.prisma` ตั้ง `output = "../src/generated/prisma"` และ
`prisma.config.ts` ชี้ `"prisma/schema.prisma"` - ทั้งคู่เป็นพาธสัมพัทธ์กับ cwd

**รัน Prisma จากใน workspace เสมอ** (`npm run prisma:generate -w backend`)
ไม่ใช่จากราก และตรวจ `npx prisma generate` ให้ผ่านทันทีหลังย้ายโฟลเดอร์

### 3 · phantom dependency

hoisting ทำให้ `import` แพ็กเกจที่ไม่ได้ประกาศใน `package.json` ของ workspace
ตัวเองได้ แล้วพังตอนแยกไป deploy - **ทุกครั้งที่ import ของใหม่ ให้
`npm i <pkg> -w <workspace>` เสมอ** ห้ามพึ่งว่า "มันก็เห็นอยู่แล้ว"

### 4 · lockfile เดียว conflict บ่อยขึ้น

`package-lock.json` ไฟล์เดียวสำหรับทุก workspace - เวลา conflict
**อย่าแก้ด้วยมือ** ให้เอาของฝั่งใดฝั่งหนึ่งแล้ว `npm install` ใหม่เพื่อสร้างใหม่

### 5 · `export type` ใน `index.ts` ห้ามเปลี่ยนเป็น `export`

`packages/contract/src/index.ts` ใช้ `export type { AppRouter }` โดยตั้งใจ
ไฟล์ generated ข้างในมี `initTRPC.create()` ซึ่งเป็นโค้ดที่รันได้จริง
ถ้า re-export แบบธรรมดา โมดูลจะถูกประเมินตอนรันและลาก `@trpc/server`
เข้า bundle ของเบราว์เซอร์ - build ยังผ่านปกติ ไม่มี error

กันด้วยกฎ ESLint `consistent-type-imports`

---

## ข้อจำกัดที่ต้องรู้

**ตรวจไวยากรณ์แล้ว แต่ยังไม่ได้ตรวจ type** - ไฟล์ `.ts` ทั้ง 21 ไฟล์ผ่าน
`tsc 5.7 --noEmit --strict` โดยไม่มี syntax error (`TS1xxx`) เหลือเลย

แต่ error ที่เหลืออยู่ 46 รายการล้วนเป็น `TS2307 Cannot find module` และผลพวง
ของมัน เพราะเครื่องที่สร้างไฟล์ชุดนี้ไม่มี `node_modules` ของโปรเจกต์เลย
(`@trpc/*`, `@nestjs/*`, `zod`, `@tanstack/react-query`, และตัว `@ulms/contract`
เองที่ยังไม่ได้ `npm install`) จึงยัง **ไม่ได้พิสูจน์ว่า type ตรงกันจริง**

**ให้รัน `npm run typecheck` ที่รากอีกครั้งหลังตั้ง workspace เสร็จเสมอ**

**ชื่อ decorator ของ `nestjs-trpc` ต้องเช็กกับเวอร์ชันที่ลงจริง** - รีโปใช้
`nestjs-trpc@^2.13.0` และ API ของมันขยับระหว่างเวอร์ชันใหญ่ ถ้า
`@UseMiddlewares` หรือรูปแบบของ `TRPCModule.forRoot()` ไม่ตรง ให้ยึดเอกสารของ
เวอร์ชันที่ลงไว้ **โครงสร้างและการแบ่งไฟล์ยังใช้ได้เหมือนเดิม เปลี่ยนแค่ชื่อ decorator**

**`autoSchemaFile: '../packages/contract/src/generated'` ต้องทดสอบจริง** -
ค่านี้เป็นพาธสัมพัทธ์กับ cwd ตอนรัน backend ถ้า nestjs-trpc ตีความต่างจากที่คาด
ให้ปรับพาธ แล้วบันทึกค่าที่ใช้ได้จริงลง `CONTRACT.md`

**`prisma.service.ts` และ `prisma.module.ts` ไม่ได้อยู่ในโฟลเดอร์นี้** เพราะมี
อยู่แล้วในรีโปจริง ไฟล์ตัวอย่าง import จากพาธเดิมของมัน

**ค่าที่เป็นตัวอย่างล้วน ๆ** ที่ต้องแทนด้วยของจริง: ชื่อ cookie `ulms_session`,
`DUE_TIME_OF_DAY_UTC`, รายการค่าใน `status.schema.ts`, และ mock ทั้งหมดใน
`loan.service.ts`

---

## เอกสารที่เกี่ยวข้อง

| ไฟล์ | เนื้อหา |
|---|---|
| `STRUCTURE.md` (โฟลเดอร์นี้) | **ของจริงควรอยู่ที่ไหน และใครรับผิดชอบ** - โครงเป้าหมาย, ตารางแมปไฟล์ → ปลายทาง, ลำดับการย้าย 8 ขั้น |
| `CONTRACT.md` (โฟลเดอร์นี้) | ตารางสัญญา: procedure มีอะไรบ้าง input/output หน้าตาไหน |
| `../report/trpc-guide.pdf` | หลักการของ tRPC · ทางเดินของ request · ความเสี่ยง 8 ข้อในรีโปนี้ |
| `../report/trpc-meeting.pdf` | วาระประชุม 19 วาระ - ว-01 มีรายละเอียดทั้งสองทางเลือกและเรื่อง merge |
| `../../รายการเรียกใช้งานจาก Backend.pdf` | ร่างสัญญาฉบับแรกของทีม - ต้นทางของตารางใน `CONTRACT.md` |
