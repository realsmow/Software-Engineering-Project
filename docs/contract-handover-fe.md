# ส่งมอบสัญญา tRPC ให้ฝั่ง Front-End

> จาก SA · 13 ส.ค. 2569 · ฐานอ้างอิง `origin/main` ที่ `e76f01f`
>
> **สิ่งที่ส่งมาคือไฟล์สัญญา 1 ไฟล์ กับข้อเสนอ 4 ข้อ** การเปลี่ยนเวอร์ชันไลบรารี
> และการแก้โค้ดฝั่ง FE ทั้งหมดเป็นการตัดสินใจของทีม FE ไม่ได้ทำมาให้

---

## 1 · ของที่ส่งมา

```
frontend/src/generated/server.ts      60 บรรทัด — สร้างอัตโนมัติ ห้ามแก้ด้วยมือ
```

ไฟล์นี้ `export type AppRouter` ซึ่งเป็นตัวสัญญาจริง สร้างจาก decorator กับ zod schema
ที่อยู่ในโค้ด backend โดยตรง ไม่ได้เขียนด้วยมือ สร้างใหม่ได้ทุกเมื่อด้วย

```bash
cd backend && npm run contract:generate
```

**ตอนนี้สัญญามี 3 procedure** — `auth.login` · `auth.me` · `auth.logout`
ทั้งสามทำงานได้จริงบน backend แล้ว (ทดสอบครบวงจรกับฐานข้อมูลจริง ดูหัวข้อ 4)

---

## 2 · ข้อเสนอ 4 ข้อ

| # | เปลี่ยนอะไร | จาก | เป็น |
|---|---|---|---|
| 1 | `frontend/package.json` → `zod` | `^3.23.8` | `4.4.3` (ตรึงเป๊ะ ไม่ใส่ `^`) |
| 2 | `frontend/package.json` → `@hookform/resolvers` | `^3.10.0` | `^5.2.2` |
| 3 | `frontend/src/lib/trpc.ts` บรรทัด 3 | `from "@/server/trpc-contract"` | `from "@/generated/server"` |
| 4 | `frontend/src/server/trpc-contract.ts` | 188 บรรทัด | **ลบทิ้ง** |

### ทำไมต้องยก zod ไปพร้อมกัน ไม่ใช่แยกรอบ

ไฟล์สัญญาที่ส่งมา**มีโค้ด zod อยู่ข้างในจริง ๆ** ไม่ใช่ type ล้วน เปิดดูจะเห็น

```ts
import { z } from "zod";
...
.input(z.object({ method: z.enum(['ku', 'local']), ... }))
```

`z.email()` ที่สัญญาใช้เป็นรูปแบบของ zod 4 (ใน zod 3 ต้องเขียน `z.string().email()`)
และชนิดข้อมูลของ zod 3 กับ 4 เข้ากันไม่ได้ในระดับ type ถ้า FE ยังอยู่ที่ 3
การ import สัญญาจะตรวจชนิดไม่ผ่านตั้งแต่บรรทัดแรก

ส่วน `@hookform/resolvers` ต้องขึ้นเป็น 5 เพราะรุ่น 3 ผูกกับ zod 3

### ทำไมต้องตรึงเวอร์ชันเป๊ะ ไม่ใช้ `^`

`scripts/check-versions.mjs` ที่ CI เรียกอยู่ตรวจ 3 ข้อ — ทั้งสองฝั่งประกาศเวอร์ชัน
เดียวกัน · ตรึงเป๊ะ · และติดตั้งอยู่ชุดเดียว ตอนนี้ตกทั้ง 3 ข้อ งาน `versions` ใน CI
จึงถูกตั้ง `continue-on-error: true` ไว้ให้รายงานเฉย ๆ โดยไม่ขวางการรวมโค้ด

**หมายเหตุ: ฝั่ง backend ก็ต้องตรึงด้วย** ตอนนี้ยังเป็น `"zod": "^4.4.3"` ต้องเป็น
`"4.4.3"` — เป็นการแก้ของฝั่ง BE ขอให้ประสานกันว่าจะไปพร้อมกันใน PR เดียว
เมื่อทั้งสองฝั่งตรึงตรงกันแล้ว จึงค่อยถอด `continue-on-error` ออกจาก `ci.yml`

---

## 3 · จะพังแค่ไหน — ทดสอบมาแล้ว

ผมลองการเปลี่ยนแปลงทั้ง 4 ข้อใน**สำเนาแยกนอกโปรเจกต์** (ไม่ได้แตะ `frontend/` ของจริง)
ติดตั้งใหม่หมดแล้ววัดผล

```
npx tsc --noEmit    0 error
npm run build       ✓ built in 3.23s
```

**ไม่มี error เลยแม้แต่ข้อเดียว** เหตุผลคือ ณ ตอนนี้ยังไม่มีไฟล์ไหนใน `src/` เรียก
`useTRPC()` หรือ `useTRPCClient()` — ชั้นเชื่อมต่อถูกประกอบไว้แล้วแต่ยังไม่มีผู้ใช้งาน
การสลับสัญญาจึงยังไม่กระทบโค้ดที่มีอยู่

> เดิมผมประเมินไว้ว่าจะเกิด compile error ราว 52 จุด **ตัวเลขนั้นผิด** — มันจะเกิดก็ต่อ
> เมื่อมีโค้ดเรียก procedure เหล่านั้นจริง ซึ่งตอนนี้ยังไม่มี

### แต่ต้องรู้ไว้ว่าสัญญาเก่ากับใหม่ต่างกันมาก

| | procedure |
|---|---|
| `trpc-contract.ts` (เขียนมือ ของเดิม) | 60 รายการ ใน 11 กลุ่ม |
| `generated/server.ts` (ของจริง) | **3 รายการ** ในกลุ่ม `auth` |

57 รายการที่หายไปคือของที่ backend **ยังไม่ได้เขียน** ไม่ใช่ของที่ถูกตัดทิ้ง
เมื่อไรที่เริ่มเขียนหน้าจอที่ต้องเรียก `item.list` / `loan.create` ฯลฯ จะเจอว่ายังไม่มี
— ซึ่งเป็นเรื่องดี เพราะเปลี่ยนช่องว่างที่ตอนนี้มองไม่เห็น ให้เป็นสิ่งที่คอมไพเลอร์บอกได้

---

## 4 · หลักฐานว่า 3 procedure ใช้ได้จริง

ทดสอบกับฐานข้อมูล PostgreSQL จริง (สร้างแยกไว้ต่างหาก ลบทิ้งแล้ว) ผ่าน HTTP ทุกข้อ

| # | ทดสอบ | ผล |
|---|---|---|
| 1 | `auth.me` ก่อนล็อกอิน | `UNAUTHORIZED / NOT_AUTHENTICATED` |
| 2 | `auth.login` รหัสผ่านผิด | `UNAUTHORIZED / INVALID_CREDENTIALS` |
| 3 | `auth.login` บัญชีไม่มีจริง | ข้อความ**เดียวกับข้อ 2** (ไม่บอกว่าบัญชีไม่มี) |
| 4 | `auth.login` ถูกต้อง | คืนโปรไฟล์ + ตั้งคุกกี้ `ulms_session` (httpOnly) |
| 5 | `auth.me` พร้อมคุกกี้ | คืนโปรไฟล์ |
| 6 | `auth.login` ด้วยอีเมล KU ตัวพิมพ์ต่างกัน | ผ่าน (จับแบบไม่สนตัวพิมพ์) |
| 7 | `method: "ku"` แต่อีเมลไม่ใช่ KU | `BAD_REQUEST / NOT_KU_EMAIL` |
| 8 | `auth.logout` | `{ ok: true }` + คุกกี้ถูกลบ |
| 9 | `auth.me` หลังออกจากระบบ | `UNAUTHORIZED` |

### รูปร่างที่ FE จะได้รับ

```ts
// auth.login (mutation)
input:  { method: 'ku' | 'local'; identifier: string; password: string }

// auth.login และ auth.me คืนรูปเดียวกัน
output: {
  id: number; studentId: string; firstName: string; lastName: string;
  email: string; role: 'borrower' | 'staff' | 'supervisor' | 'admin';
  facultyName: string | null;
  creditScore: number; creditTier: 'D0' | 'D1' | 'D2' | 'D3';
  maxBorrowDays: number; maxExtendTimes: number;
}

// auth.logout (mutation) -> { ok: true }
```

**ไม่มี token ส่งกลับมาให้เก็บ** เซสชันอยู่ในคุกกี้ `httpOnly` ซึ่ง JavaScript อ่านไม่ได้
FE เรียก `login` แล้วเรียก `me` ได้เลย เบราว์เซอร์แนบคุกกี้ให้เอง — `lib/trpc.ts`
ตั้ง `credentials: "include"` ไว้ถูกแล้ว ไม่ต้องแก้

---

## 5 · ลองเองที่เครื่อง

```bash
# 1. ฐานข้อมูล + ตัวแปรแวดล้อม
cd backend
cp .env.example .env
#    แก้ DATABASE_URL ให้ชี้ postgres ของคุณ แล้วใส่ JWT_SECRET:
#    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npx prisma migrate deploy
npx prisma generate

# 2. รัน backend (พอร์ต 3000)
npm run start:dev

# 3. ยังไม่มีสคริปต์ seed — ต้องสร้างบัญชีเองก่อนถึงจะล็อกอินได้
#    (สคริปต์ seed เป็นงานที่ยังค้างอยู่ฝั่ง BE)
```

Vite ตั้ง proxy `/trpc` ไปที่ backend ไว้แล้ว ไม่ต้องตั้งค่าเพิ่ม

---

## 6 · กฎ 2 ข้อของ generator (สำหรับคนที่จะไปแก้ router ฝั่ง BE)

ไม่กระทบ FE โดยตรง แต่เขียนไว้เพราะเป็นสาเหตุที่สัญญาหน้าตาเป็นแบบนี้

1. **schema ทุกตัวต้องเขียน inline ในเดคอเรเตอร์** ถ้า `import` symbol เข้ามา
   generator จะใส่ import ที่เป็น absolute path ต่อท้าย `../../../` ซึ่ง resolve ไม่ได้
   (ยืนยันกับ nestjs-trpc 2.13.0) ราคาที่จ่ายคือ output shape ถูกเขียนซ้ำสองที่
   ระหว่าง `auth.router.ts` กับ `common/schemas/user.schema.ts` — **ต้องแก้ให้ตรงกันด้วยมือ**

2. **ห้ามมีอักขระที่ไม่ใช่ ASCII ในไฟล์ router** generator เป็น Rust binary ที่ตัด
   ข้อความด้วย byte index อักษรไทยกว้าง 3 ไบต์ คอมเมนต์ไทยบรรทัดเดียวทำให้ panic
   ทันที และจะดูเหมือน crash แบบสุ่มถ้าไม่รู้กฎนี้

---

## 7 · ลำดับที่แนะนำ

1. ทีม FE ตัดสินใจข้อ 1–4 ในหัวข้อ 2
2. ฝั่ง BE ตรึง `zod` เป็น `4.4.3` ใน PR เดียวกัน
3. ถอด `continue-on-error` ออกจากงาน `versions` ใน `ci.yml`
4. ต่อหน้าโปรไฟล์เข้ากับ `auth.me` ของจริง เป็นหน้าแรกที่เลิกใช้ข้อมูลจำลอง

ข้อ 1–3 ควรอยู่ PR เดียวกัน เพราะถ้าแยก จะมีช่วงที่ CI แดงโดยไม่มีใครแก้ได้
