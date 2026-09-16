# ข้อตกลงร่วมของ backend — อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง

> **ทำไมมีไฟล์นี้:** งาน backend แยกกันทำสองสาย (`feat/trpc-auth-admin` กับ
> `feat/trpc-staff-staff`) แล้วเขียนของกลางชนกัน 9 ไฟล์ ที่หนักที่สุดคือ **นิยาม
> tier ไม่ตรงกันทั้งที่ชื่อเหมือนกัน** ซึ่งเป็นชนิดการเปลี่ยนสัญญาที่
> `docs/trpc-example/process/CONTRACT-OWNERS.md` เรียกว่า *"เปลี่ยนความหมายโดย
> รูปร่างเหมือนเดิม — อันตรายที่สุด compiler จับไม่ได้"* ตรงเป๊ะ
>
> ไฟล์นี้บันทึกสิ่งที่ตัดสินไปแล้วตอนรวมสาขา เพื่อไม่ให้ตัดสินซ้ำหรือตัดสินสวนกันอีก
> **ทั้งคนและ AI ที่จะเขียนโค้ดในรีโปนี้ต้องอ่านไฟล์นี้ก่อน** พร้อมกับ
> `docs/trpc-example/CONTRACT.md` (ข้อตกลง ว-01 ถึง ว-10)

---

## 1 · หนึ่งสาขา

ทุกคนทำบน **`feat/trpc-backend`** สาขาเดียว แตกสาขาย่อยอายุสั้นได้ แต่ต้องรีบรวมกลับ

`feat/trpc-auth-admin` กับ `feat/trpc-staff-staff` ถูกรวมเข้ามาที่นี่แล้ว —
เก็บไว้อ่านประวัติได้ แต่ **ห้ามเขียนเพิ่ม** เพราะจะกลับไปสู่ปัญหาเดิม

`origin/main` ก็ถูกรวมเข้ามาแล้วเช่นกัน สาขานี้จึงมีทั้ง session/audit/throttle
ที่ลงบน `main` ไปก่อน และงาน staff ครบทั้งก้อน · **ก่อน push ทุกครั้งให้
`git merge origin/main` ก่อน** ไม่ปล่อยให้ห่างจาก `main` เกินไม่กี่วัน เพราะรอบที่แล้ว
งานถูกก๊อปขึ้น `main` แทนที่จะ merge (commit `343e0e0` มี parent เดียว) git จึงมองว่า
ไม่มีประวัติร่วมกัน และ conflict บวมเป็น 35 ไฟล์

---

## 2 · เรื่องที่ตัดสินไปแล้ว — ห้ามเขียนสวน

| เรื่อง | ข้อสรุป | อยู่ที่ไหน | ที่มา |
|---|---|---|---|
| **Tier T0–T3** | มาจาก `BorrowRule.RuleName` ผ่าน `tryMapTier()` · **ไม่ใช่** `CreditWeight` · เป็น `null` ได้ | `common/schemas/status.schema.ts` | `BorrowConstraints` unique ที่ `(BorrowRuleKey, CreditTierKey)` = ตาราง T×D ที่ `CONTRACT.md` อธิบาย · `TIER_CONFIG` ให้ T0 กับ T3 weight เท่ากันจึงแยกกันไม่ได้ด้วย weight |
| **Tier อยู่กับชิ้น ไม่ใช่ประเภท** | `ItemInfo` ไม่มี tier ของตัวเอง ใช้ tier ของชิ้นแรกที่มี · ประเภทที่ยังไม่มีชิ้น = `null` | `common/mappers/item.mapper.ts` (`typeTier`) | `BorrowRule` ผูกกับ `ResourceInfo` |
| **Credit weight** | คือ *ราคาเครดิต* ที่หักเวลาของเสีย (`DAMAGE_CREDIT_WEIGHT`) **ไม่ใช่ tier** | `status.schema.ts` | ข้อเสนอ §5.7 |
| **error** | โยน `BusinessError` เสมอ · ห้ามโยน `TRPCError` ดิบ (ทำให้ `cause` หาย) | `common/errors/business-error.ts` | ว-06 |
| **session** | `AppContext` + `SessionService` ของจริง · cookie `ulms_session` · `cookieParser()` ติดตั้งใน `bootstrap.ts` | `trpc/context.ts`, `auth/session.service.ts` | ว-03 |
| **จัดกลุ่ม router** | ตาม *โดเมน* ไม่ใช่ตามบทบาท · หนึ่ง alias ต่อหนึ่งโดเมน · คุมสิทธิ์ด้วย `@UseMiddlewares` **รายเมธอด** ไม่ใช่ทั้ง class | `item/item.router.ts` เป็นตัวอย่าง (borrower + staff อยู่ router เดียว) | ว-05 |
| **ตั้งชื่อ procedure ไม่ให้ชน** | ฝั่งผู้ยืม `list` / `getById` · ฝั่ง staff `listManaged` / `getManagedById` · ห้ามให้ชื่อฝั่ง staff ดูเหมือนของสาธารณะ | `item.router.ts` | ว-05 |
| **แบ่งหน้า** | `paginationInput` / `paginated()` ตัวเดียวจาก `common/schemas/pagination.schema.ts` | | ว-07 |
| **วันเวลา** | ISO 8601 UTC ผ่าน `common/schemas/datetime.schema.ts` | | ว-08 |
| **สถานะ** | สตริงคงที่จาก `status.schema.ts` เท่านั้น ห้ามส่ง primary key | | ว-10 |

---

## 3 · ก่อนสร้างไฟล์ใน `common/` ให้เช็คก่อน

conflict ทั้ง 9 ไฟล์ตอนรวมสาขาเกิดจากอย่างเดียว: สองคนสร้างของกลางชื่อเดียวกัน
คนละเวอร์ชัน (`token.ts`, `business-error.ts`, `pagination.schema.ts`,
`status.schema.ts`) โดยไม่มีใครรู้ว่าอีกฝั่งทำแล้ว

**กติกา:** ก่อนเพิ่มอะไรใน `src/common/` ให้ `grep` ชื่อนั้นทั้ง `src/` ก่อน
ถ้ามีอยู่แล้ว → แก้ของเดิม ไม่ใช่สร้างใหม่ · ถ้าต้องแก้ความหมายของสิ่งที่มีอยู่ →
คุยกับอีกคนก่อน แล้วแก้พร้อมกันใน PR เดียว (CONTRACT-OWNERS ข้อ 2 แถวล่างสุด)

---

## 4 · ก่อน push

```bash
cd backend
npx tsc --noEmit      # ต้องผ่าน
npm test              # ต้องผ่าน — ยกเว้นที่จดไว้ข้างล่าง
npm run seed          # ต้องมี BorrowRule T0–T3 ไม่งั้น tier เป็น null ทั้งระบบ
```

**ก่อนรันเทสต์ที่ต่อฐานข้อมูล ต้องมี DB ที่ตรงกับ `schema.prisma` ก่อน**

3 suite ที่ต่อ DB จริง (`auth.service`, `session.service`, `audit.service`) จะล้ม
ถ้ายังไม่มี `backend/.env` และฐานข้อมูลที่ push schema แล้ว:

```bash
cp .env.example .env      # แล้วแก้ DATABASE_URL ให้ตรงกับ Postgres ของตัวเอง
npx prisma db push
npm run seed              # BorrowRule T0–T3 + CreditTier D0–D3
```

**หนี้ที่รู้อยู่แล้ว:** `auth/auth.service.spec.ts` สร้าง `RoleInfo` / `CreditTier` ของ
ตัวเองโดยสมมติว่าตารางว่าง — รันบน DB ที่ seed แล้วจะล้ม และป้าย tier ในเทสต์
(50–79 = D2) ขัดกับข้อเสนอ §5.7 (50–79 = **D1**) · เจ้าของโดเมน `auth` ควรแก้ให้
เทสต์ล้างข้อมูลของตัวเองและแก้ป้ายให้ตรงข้อเสนอ

---

## 5 · เอกสารที่เกี่ยวข้อง

| ไฟล์ | เนื้อหา |
|---|---|
| `docs/trpc-example/CONTRACT.md` | ข้อตกลง ว-01–ว-10 + ตาราง procedure ที่ตกลงกันในที่ประชุม |
| `docs/trpc-example/process/CONTRACT-OWNERS.md` | ใครเป็นเจ้าของโดเมนไหน + ขั้นตอนขอเปลี่ยนสัญญา · **ตารางเจ้าของยังว่าง ต้องกรอก** |
| `backend/docs/auth-admin.md` | โดเมน `auth` · `admin` · `credit` · catalogue ฝั่งผู้ยืม |
| `backend/docs/staff.md` | โดเมน `item` ฝั่ง staff · `loan` · `inspection` · `image` |
