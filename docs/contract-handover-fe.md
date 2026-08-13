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

## 2 · ข้อเสนอ — แยกเป็นสองรอบ ไม่ต้องทำพร้อมกัน

### รอบแรก · รับสัญญามาใช้ (ทำได้เลย ไม่ต้องแตะเวอร์ชัน)

| # | เปลี่ยนอะไร | จาก | เป็น |
|---|---|---|---|
| 1 | `frontend/src/lib/trpc.ts` บรรทัด 3 | `from "@/server/trpc-contract"` | `from "@/generated/server"` |
| 2 | `frontend/src/server/trpc-contract.ts` | 188 บรรทัด | **ลบทิ้ง** |

**ไฟล์สัญญาถูกทำให้ใช้ได้กับทั้ง zod 3 และ zod 4** จึงไม่ต้องรอการยกเวอร์ชัน

เดิมสัญญาใช้ `z.email()` ซึ่งเป็นไวยากรณ์เฉพาะของ zod 4 และทำให้ `tsc` ฝั่ง FE
พังทันที 2 จุด ผมจึงเปลี่ยน schema ต้นทางฝั่ง backend ให้เขียนเป็น
`z.string().email()` แทน ซึ่งใช้ได้ทั้งสองรุ่น (ทดสอบแล้วทั้งบน zod 3.25.76 ที่ FE
ติดตั้งอยู่จริง และ zod 4.4.3 ของ backend) ไวยากรณ์อื่นในสัญญาทั้งหมด — `z.object`
`z.enum` `z.string().trim().min().max()` `z.number().int().positive()` `z.literal(true)` —
ใช้ได้ทั้งสองรุ่นอยู่แล้ว

### รอบสอง · ยกเวอร์ชัน (แยกทำทีหลังได้ ไม่บล็อกใคร)

| # | เปลี่ยนอะไร | จาก | เป็น |
|---|---|---|---|
| 3 | `frontend/package.json` → `zod` | `^3.23.8` | `4.4.3` (ตรึงเป๊ะ ไม่ใส่ `^`) |
| 4 | `frontend/package.json` → `@hookform/resolvers` | `^3.10.0` | `^5.2.2` |

ยังจำเป็นอยู่ แต่ไม่ใช่เงื่อนไขของการรับสัญญาแล้ว เหตุผลที่ยังต้องทำ

- ตราบใดที่สองฝั่งยังคนละรุ่นหลัก **จะแชร์ zod schema ข้ามฝั่งไม่ได้เลย** ทุก procedure
  ที่เพิ่มเข้ามาต้องเขียน schema ซ้ำสองที่ตลอดไป
- งาน `versions` ใน CI จะเขียวไม่ได้จนกว่าจะตรงกัน (ดูหัวข้อถัดไป)
- `@hookform/resolvers` รุ่น 3 ผูกกับ zod 3 จึงต้องขึ้นเป็น 5 พร้อมกัน

### ทำไมต้องตรึงเวอร์ชันเป๊ะ ไม่ใช้ `^`

`scripts/check-versions.mjs` ที่ CI เรียกอยู่ตรวจ 3 ข้อ — ทั้งสองฝั่งประกาศเวอร์ชัน
เดียวกัน · ตรึงเป๊ะ · และติดตั้งอยู่ชุดเดียว ตอนนี้ตกทั้ง 3 ข้อ งาน `versions` ใน CI
จึงถูกตั้ง `continue-on-error: true` ไว้ให้รายงานเฉย ๆ โดยไม่ขวางการรวมโค้ด

**หมายเหตุ: ฝั่ง backend ก็ต้องตรึงด้วย** ตอนนี้ยังเป็น `"zod": "^4.4.3"` ต้องเป็น
`"4.4.3"` — เป็นการแก้ของฝั่ง BE ขอให้ประสานกันว่าจะไปพร้อมกันใน PR เดียว
เมื่อทั้งสองฝั่งตรึงตรงกันแล้ว จึงค่อยถอด `continue-on-error` ออกจาก `ci.yml`

---

## 3 · จะพังแค่ไหน — ทดสอบมาแล้ว

**รอบแรก (รับสัญญา)** — วัดกับ `frontend/` ของจริง ที่ zod 3.25.76 ตามที่ติดตั้งอยู่ตอนนี้
โดยมีไฟล์สัญญาวางอยู่ใน `src/generated/` แล้ว

```
npm run typecheck    0 error
npm run build        ✓ built in 3.56s
```

**รอบสอง (ยก zod 4 + resolvers 5)** — ลองใน**สำเนาแยกนอกโปรเจกต์** ติดตั้งใหม่หมด
พร้อมสลับ import และลบ `trpc-contract.ts`

```
npx tsc --noEmit     0 error
npm run build        ✓ built in 3.23s
```

**ทั้งสองรอบไม่มี error เลยแม้แต่ข้อเดียว** เหตุผลคือ ณ ตอนนี้ยังไม่มีไฟล์ไหนใน `src/`
เรียก `useTRPC()` หรือ `useTRPCClient()` — ชั้นเชื่อมต่อถูกประกอบไว้แล้วแต่ยังไม่มีผู้ใช้งาน
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

**PR แรก — รับสัญญา** (ทีม FE ทำได้เลย ไม่ต้องรอใคร)

1. สลับ import ใน `lib/trpc.ts` แล้วลบ `server/trpc-contract.ts` (ข้อ 1–2 ในหัวข้อ 2)
2. ต่อหน้าโปรไฟล์เข้ากับ `auth.me` ของจริง เป็นหน้าแรกที่เลิกใช้ข้อมูลจำลอง

**PR ที่สอง — ยกเวอร์ชัน** (ต้องประสานกับ BE)

3. FE ยก `zod` เป็น `4.4.3` และ `@hookform/resolvers` เป็น `^5.2.2`
4. BE ตรึง `zod` จาก `^4.4.3` เป็น `4.4.3`
5. ถอด `continue-on-error` ออกจากงาน `versions` ใน `ci.yml`

ข้อ 3–5 ต้องอยู่ PR เดียวกัน เพราะถ้าแยก จะมีช่วงที่ CI แดงโดยไม่มีใครแก้ได้
ส่วน PR แรกไม่กระทบ CI เลย — ทดสอบแล้วทั้ง typecheck และ build ผ่านบน zod 3 ที่ใช้อยู่
