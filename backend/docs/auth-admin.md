# โดเมน `auth` + `admin` — สิ่งที่ทำเสร็จ และสิ่งที่ schema ยังไม่รองรับ

> ขอบเขต: **backend เท่านั้น** · ไม่มีการแก้ `prisma/schema.prisma` แม้แต่บรรทัดเดียว
>
> ตารางในส่วนที่ 2 คือแถวที่พร้อมคัดลอกไปต่อท้าย `CONTRACT.md` ตามกระบวนการใน
> `docs/trpc-example/STRUCTURE.md` หัวข้อ 6

---

## 1 · เริ่มใช้งาน

```bash
cd backend
cp .env.example .env          # แล้วใส่ SESSION_SECRET
docker compose up -d postgres
npx prisma migrate dev        # ถ้ายังไม่มีตารางในฐานข้อมูล
npm run start:dev
```

ยืนยันว่าไม่พัง (เท่ากับที่ CI รัน):

```bash
npx tsc --noEmit
npm run build
npm test -- password.spec token.spec session.service.spec admin-user.mapper.spec
```

ชุดเทสต์บรรทัดสุดท้ายเป็นเทสต์ล้วน ๆ ไม่ต้องมีฐานข้อมูล ส่วน
`auth.service.spec.ts` กับ `prisma.service.spec.ts` ต้องมี Postgres วิ่งอยู่

---

## 2 · procedure ที่เพิ่มเข้ามา

`ล็อกอิน` = ต้องมี session · `admin` = `AdminMiddleware` · `staff` = `StaffMiddleware` (staff + admin)

### `auth`

| procedure | ชนิด | input | output | role | หมายเหตุ |
|---|---|---|---|---|---|
| `auth.me` | query | — | `userOutput` | ล็อกอิน | มีอยู่แล้ว — แต่เพิ่งจะ **ใช้งานได้จริง** เพราะก่อนหน้านี้ `verifySessionToken()` คืน null ตายตัว ทุก request จึงเป็น 401 |
| `auth.login` | mutation | `{ username, password }` | `{ user: userOutput }` | เปิด | `username` รับได้ทั้ง `AccountInfo.Email` และ `AccountInfo.UserID` (วิธีล็อกอินสองแบบของ frontend คือ procedure เดียวกัน) · error: `INVALID_CREDENTIALS` |
| `auth.logout` | mutation | — | `{ ok: true }` | เปิด | ไม่บังคับล็อกอิน — การล้าง cookie ที่หมดอายุไปแล้วควรผ่าน ไม่ใช่ตอบ 401 |

### `admin`

| procedure | ชนิด | input | output | role | สถานะ |
|---|---|---|---|---|---|
| `admin.listUsers` | query | `paginationInput + { role?, status? }` | `paginated(adminUserSummary)` | admin | ✅ `q` ค้นจาก email / UserID / ชื่อ / นามสกุล |
| `admin.getUserById` | query | `{ id }` | `adminUserDetail` | admin | ✅ |
| `admin.createUser` | mutation | `createUserInput` | `{ user, temporaryPassword }` | admin | ✅ ไม่ส่ง `password` มา = server สุ่มให้ แล้วคืนกลับ **ครั้งเดียว** |
| `admin.updateUser` | mutation | `{ id, email?, studentId?, firstName?, lastName? }` | `adminUserDetail` | admin | ✅ |
| `admin.changeRole` | mutation | `{ id, role }` | `adminUserDetail` | admin | ✅ กันไม่ให้ปลดสิทธิ์ admin ของตัวเอง (`CANNOT_MODIFY_SELF`) |
| `admin.resetPassword` | mutation | `{ id, newPassword? }` | `{ ok, temporaryPassword }` | admin | ✅ |
| `admin.setUserBan` | mutation | `{ id, banned, reason?, days }` | `{ ok: true }` | staff | ✅ บันทึกเป็นแถว `PenaltyInfo` |
| `admin.getLendingSettings` | query | — | `lendingSettingsOutput` | staff | ✅ อ่านจาก `CreditTier` / `BorrowRule` / `BorrowConstraints` / `PenaltyRule` จริง |
| `admin.updateLendingSettings` | mutation | `updateLendingSettingsInput` | `lendingSettingsOutput` | staff | ✅ upsert เฉพาะแถวที่ส่งมา อยู่ใน transaction เดียว |
| `admin.getSystemStatus` | query | — | `systemStatusOutput` | admin | ✅ ping DB จริง + นับ record · ตอบได้แม้ DB ล่ม |
| `admin.listCronJobs` | query | — | `cronJobOutput[]` | admin | ⚠️ คืนทะเบียนงาน 8 ตัวพร้อม `implemented: false` — ยังไม่มี scheduler |
| `admin.setUserActive` | mutation | `{ id, active }` | — | admin | ❌ `NOT_IMPLEMENTED` |
| `admin.runCronJob` | mutation | `{ job }` | — | admin | ❌ `NOT_IMPLEMENTED` |
| `admin.getConfig` / `updateConfig` | query / mutation | — | — | admin | ❌ `NOT_IMPLEMENTED` |
| `admin.listAudit` / `getAuditById` | query | — | — | admin | ❌ `NOT_IMPLEMENTED` |

ตัวที่ ❌ **ประกาศ schema ไว้ครบแล้ว** และโยน `NOT_IMPLEMENTED` พร้อมรายชื่อ
คอลัมน์ที่ขาดใน `cause.missing` — frontend จึงเขียนหน้าจอรอไว้ได้เลยโดยไม่ต้อง
เดา type และเห็นสาเหตุตรง ๆ ตอนเรียก

---

## 3 · สิ่งที่ schema ยังไม่รองรับ (ส่งให้คนที่ดูแล `schema.prisma`)

เรียงจากที่กระทบมากไปน้อย

| # | ต้องเพิ่ม | ปลดล็อกอะไร | ตอนนี้เป็นยังไง |
|---|---|---|---|
| 1 | `AccountInfo.Email` เป็น `@unique` และ `AccountInfo.UserID` เป็น `@unique` | `auth.login` แม่นยำ · `admin.createUser` ปลอดภัยจริง | เช็คซ้ำใน service ก่อน insert ซึ่งเป็น **race condition** — admin สองคนสร้าง email เดียวกันพร้อมกันผ่านทั้งคู่ ฐานข้อมูลเท่านั้นที่กันได้จริง |
| 2 | `AccountInfo.IsActive Boolean @default(true)` | `admin.setUserActive` | ❌ ไม่มีทางทำ — คนละเรื่องกับ ban: บัญชีที่ปิด **ล็อกอินไม่ได้** ส่วน ban แค่ยืมไม่ได้ |
| 3 | ความสัมพันธ์ `AccountInfo` → คณะ/ภาควิชา | `ctx.user.facultyKey` · การจำกัดสิทธิ์ staff ให้เห็นเฉพาะภาควิชาตัวเอง | `facultyKey` เป็น `null` เสมอ · **`admin.setUserBan` กับ `updateLendingSettings` จึงยังไม่ถูกจำกัดขอบเขตจริง** (ดูส่วนที่ 5) · `userOutput.facultyName` เป็น null เสมอ |
| 4 | ตาราง `AuditLog` (`actorKey`, `action`, `target`, `ip`, `userAgent`, `detail`, `at`) | `admin.listAudit`, `getAuditById` + กราฟในหน้า audit/dashboard | ไม่มีอะไรบันทึกว่าใครทำอะไรเลย |
| 5 | ตาราง `SystemConfig` (`key`, `value Json`, `updatedBy`, `updatedAt`) | `admin.getConfig`, `updateConfig` | ค่าพวกนี้เป็น env var ซึ่งแก้ตอน runtime ไม่ได้ |
| 6 | ตาราง `CronRunLog` (`job`, `startedAt`, `finishedAt`, `result`, `detail`) | `admin.runCronJob` + `lastRunAt`/`lastResult` ใน `listCronJobs` | ยังไม่มีทั้งงานและที่บันทึกผล |
| 7 | `AccountInfo.CreatedAt` / `LastActiveAt` | คอลัมน์ "สร้างเมื่อ" / "ใช้งานล่าสุด" ในหน้า admin users | ไม่มีข้อมูล จึงไม่ได้ใส่ในสัญญา |
| 8 | ตาราง `SessionInfo` | logout ทุกเครื่อง · เพิกถอน session ทันทีตอน reset password | session เป็น token เซ็น HMAC ไม่มี state ฝั่ง server — เพิกถอนกลางคันไม่ได้ ต้องรอหมดอายุ |
| 9 | สถานะ `invited` (บัญชีที่สร้างแล้วแต่ยังไม่ตั้งรหัสผ่าน) | ค่าที่สามใน `accountStatus` | `accountStatus` มีแค่ `active` / `suspended` เพราะสองค่านี้พิสูจน์ได้จากฐานข้อมูล |

---

## 4 · จุดที่สัญญาต่างจากไฟล์ placeholder ของ frontend

`frontend/src/server/trpc-contract.ts` เป็นไฟล์ชั่วคราวที่จะถูกแทนด้วยของจริงที่
backend generate — ข้างล่างคือจุดที่ไม่ตรงกัน **ตั้งใจให้ไม่ตรง** ควรคุยกันก่อน merge

| เรื่อง | placeholder | ของจริง | ทำไม |
|---|---|---|---|
| ชนิดของ id | `z.string()` | `z.number().int()` | PK ในฐานข้อมูลเป็น `Int` และ `userOutput.id` ที่ตกลงกันไปแล้วก็เป็น number อยู่ก่อน |
| `admin.resetPassword` | `{ ok: true }` | `{ ok: true, temporaryPassword: string \| null }` | ยังไม่มีระบบส่งอีเมล ถ้าไม่คืนรหัสชั่วคราวกลับมา admin จะไม่มีทางบอกผู้ใช้ได้เลย ฟังก์ชันนี้จึงไร้ประโยชน์ |
| `admin.createUser` | `passthrough()` | schema ระบุฟิลด์ชัดเจน + คืน `temporaryPassword` | เหตุผลเดียวกัน |
| ชื่อฟิลด์สังกัด | `departmentId: string` | `managementGroup: { id, name, type } \| null` | schema แยก `BranchInfo` (ภาควิชา) กับ `ClubInfo` (ชมรม) ผ่าน `ManagementGroup` ยุบเป็น `departmentId` เดียวจะทำให้ข้อมูลชมรมหาย |
| `AdminUser.status` | `active \| suspended \| invited` | `active \| suspended` | ดูข้อ 9 ในตารางบน |
| `AdminUser.auth` | `ku \| local` | ไม่มี | ไม่มีคอลัมน์ไหนบอกว่าบัญชีนี้สมัครมาทางไหน |

---

## 5 · เรื่องความปลอดภัยที่ต้องรู้

1. **สิทธิ์ตามภาควิชายังไม่ถูกบังคับ** — `admin.setUserBan`,
   `admin.getLendingSettings`, `admin.updateLendingSettings` ใช้
   `StaffMiddleware` ตามที่ตกลงไว้ในสัญญา แต่เพราะข้อ 3 ในส่วนที่ 3 ยังไม่มี
   staff คนหนึ่ง**จึงแบนใครก็ได้และแก้กฎการยืมของทุกภาควิชาได้** ห้ามขึ้น
   production ก่อนปิดช่องนี้ · ส่วน `listUsers`/`getUserById` ตั้งใจล็อกไว้ที่
   `AdminMiddleware` ก่อน (แม้สัญญาจะบอกว่า staff ควรเห็นด้วย) เพราะให้สิทธิ์
   เกินไว้ก่อนอันตรายกว่าให้น้อยไว้ก่อน

2. **รหัสผ่านใช้ scrypt จาก `node:crypto`** ไม่ได้ลง bcrypt/argon2 เพิ่ม เพื่อไม่ให้
   โปรเจกต์มี native dependency (ซึ่งมักพังเวลาเพื่อนคนละ OS รัน `npm ci`)
   ค่า cost ถูกเก็บไว้ในตัว hash เอง ปรับขึ้นทีหลังได้โดยของเก่ายังใช้ได้

3. **`auth.login` ไม่บอกว่าบัญชีมีอยู่จริงหรือไม่** — ทั้ง "ไม่มีผู้ใช้นี้" และ
   "รหัสผิด" คืน `INVALID_CREDENTIALS` เหมือนกัน และกรณีไม่มีผู้ใช้ก็ยังเสียเวลา
   hash กับค่าหลอกเท่าเดิม ไม่งั้นเวลาตอบกลับจะกลายเป็นเครื่องมือไล่เดาว่าอีเมล
   ไหนสมัครไว้แล้ว

4. **cookie เป็น `httpOnly`** — ถ้ามีช่องโหว่ XSS สคริปต์จะอ่าน session ออกไป
   ไม่ได้ · `sameSite` ปรับผ่าน env เพราะ production ที่แยกโดเมนต้องใช้
   `none` + `secure` (ดู `.env.example`)

5. **`sort` มี whitelist** — `paginationInput.sort` มาจาก client และปลายทางคือ
   ชื่อคอลัมน์ของ Prisma ส่งต่อดิบ ๆ เท่ากับเปิดให้ไล่ดูโครงสร้างตาราง

---

## 6 · ไฟล์ที่เพิ่ม/แก้

```
src/
├── admin/                              ★ ใหม่ทั้งโฟลเดอร์
│   ├── admin.schema.ts                 zod ของ input/output ทุกตัวในโดเมน
│   ├── admin.service.ts                ตรรกะ + query
│   └── admin.router.ts                 procedure + middleware
├── auth/
│   ├── auth.schema.ts                  ★ ใหม่
│   ├── session.service.ts              ★ ใหม่ — ที่เดียวที่รู้ว่ามี cookie
│   ├── auth.service.ts                 + authenticate()
│   ├── auth.router.ts                  + login / logout
│   └── auth.service.spec.ts            + เทสต์ authenticate() (ต้องมี DB)
├── common/
│   ├── credit/credit-tier.service.ts   ★ ย้ายออกจาก AuthService เพราะ admin ใช้ด้วย
│   ├── crypto/password.ts              ★ scrypt
│   ├── crypto/token.ts                 ★ HMAC
│   ├── errors/business-error.ts        ★ ว-06
│   ├── mappers/admin-user.mapper.ts    ★ ใหม่
│   ├── schemas/pagination.schema.ts    ★ ว-07
│   └── schemas/ok.schema.ts            ★ ใหม่
├── trpc/
│   ├── context.ts                      verifySessionToken ที่เป็น stub → ของจริง
│   └── auth.middleware.ts              ใช้ BusinessError แทน TRPCError ดิบ
└── app.module.ts                       ลงทะเบียน provider ใหม่
```
