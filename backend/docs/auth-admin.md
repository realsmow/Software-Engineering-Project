# โดเมน `auth` · `admin` · `item` · `credit` — สิ่งที่ทำเสร็จ และสิ่งที่ schema ยังไม่รองรับ

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
| `admin.setUserActive` | mutation | `{ id, active }` | `adminUserDetail` | admin | ✅ **ทำแล้วบน `main`** — `AccountInfo.IsActive` มีจริงแล้ว · เพิกถอน session ของบัญชีนั้นด้วย |
| `admin.runCronJob` | mutation | `{ job }` | — | admin | ❌ `NOT_IMPLEMENTED` |
| `admin.getConfig` / `updateConfig` | query / mutation | — | — | admin | ❌ `NOT_IMPLEMENTED` |
| `admin.listAudit` / `getAuditById` | query | `listAuditInput` / `{ id }` | `paginated(auditEvent)` / `auditEvent` | admin | ✅ **ทำแล้วบน `main`** — ตาราง `AuditLog` มีจริงแล้ว |

ตัวที่ ❌ **ประกาศ schema ไว้ครบแล้ว** และโยน `NOT_IMPLEMENTED` พร้อมรายชื่อ
คอลัมน์ที่ขาดใน `cause.missing` — frontend จึงเขียนหน้าจอรอไว้ได้เลยโดยไม่ต้อง
เดา type และเห็นสาเหตุตรง ๆ ตอนเรียก

---

## 3 · สิ่งที่ schema ยังไม่รองรับ (ส่งให้คนที่ดูแล `schema.prisma`)

เรียงจากที่กระทบมากไปน้อย

| # | ต้องเพิ่ม | ปลดล็อกอะไร | ตอนนี้เป็นยังไง |
|---|---|---|---|
| ~~1~~ | ~~`AccountInfo.Email` / `UserID` เป็น `@unique`~~ | — | ✅ **เพิ่มแล้วบน `main`** |
| ~~2~~ | ~~`AccountInfo.IsActive`~~ | — | ✅ **เพิ่มแล้วบน `main`** · `AppContext` ปฏิเสธบัญชีที่ปิดกลาง session ด้วย |
| 3 | ความสัมพันธ์ `AccountInfo` → คณะ/ภาควิชา | `ctx.user.facultyKey` · การจำกัดสิทธิ์ staff ให้เห็นเฉพาะภาควิชาตัวเอง | ⚠️ **คอลัมน์ `AccountInfo.FacultyKey` เพิ่มแล้วบน `main`** แต่ยังไม่มีข้อมูล — `facultyKey` จึงยังเป็น `null` จนกว่าจะกรอก · procedure ที่จำกัดขอบเขตต้องอ่าน `null` ว่า "ยังไม่ถูกจำกัด" ไม่ใช่ "ไม่มีสิทธิ์" |
| ~~4~~ | ~~ตาราง `AuditLog`~~ | — | ✅ **เพิ่มแล้วบน `main`** (`common/audit/audit.service.ts`) |
| 5 | ตาราง `SystemConfig` (`key`, `value Json`, `updatedBy`, `updatedAt`) | `admin.getConfig`, `updateConfig` | ค่าพวกนี้เป็น env var ซึ่งแก้ตอน runtime ไม่ได้ |
| 6 | ตาราง `CronRunLog` (`job`, `startedAt`, `finishedAt`, `result`, `detail`) | `admin.runCronJob` + `lastRunAt`/`lastResult` ใน `listCronJobs` | ยังไม่มีทั้งงานและที่บันทึกผล |
| 7 | `AccountInfo.CreatedAt` / `LastActiveAt` | คอลัมน์ "สร้างเมื่อ" / "ใช้งานล่าสุด" ในหน้า admin users | ไม่มีข้อมูล จึงไม่ได้ใส่ในสัญญา |
| ~~8~~ | ~~ตาราง `SessionInfo`~~ | — | ✅ **เพิ่มแล้วบน `main`** — เพิกถอน session ได้จริงแล้ว |
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

---

## 7 · โดเมน `item` (ค้นหาอุปกรณ์/ห้อง) + `credit`

> เพิ่มรอบที่สอง ตาม requirement "User สามารถดูข้อมูลตัวเองได้ / สามารถ search หาอุปกรณ์–ห้องได้"

### `credit`

| procedure | ชนิด | input | output | role | สถานะ |
|---|---|---|---|---|---|
| `credit.me` | query | — | `creditOutput` | ล็อกอิน | ✅ คะแนน + ระดับ + วันยืมสูงสุด + **รายการหักที่ยัง active** |
| `credit.getById` | query | `{ id }` | `creditOutput` | staff | ✅ |

`auth.me` มีคะแนนกับระดับเครดิตอยู่แล้ว (ทุกหน้าใช้) ส่วน `credit.me` เพิ่มสิ่งที่หน้า
"เครดิตของฉัน" ต้องใช้จริง คือ **รายการโทษที่ยังมีผล** เพื่อให้คำถาม "ทำไมยืมได้แค่ 5 วัน"
มีคำตอบอยู่บนหน้าจอ ไม่ต้องเดินไปถามเจ้าหน้าที่

`credit.me` อ่าน accountKey จาก `ctx.user` ไม่ใช่จาก input — ผู้ยืมจะเปลี่ยน id เพื่อดูเครดิต
คนอื่นไม่ได้ ถ้าจะดูของคนอื่นต้องใช้ `credit.getById` ซึ่งเป็นคนละสิทธิ์

### `item`

| procedure | ชนิด | input | output | role | สถานะ |
|---|---|---|---|---|---|
| `item.list` | query | `paginationInput + { tier?, ownerGroupKey?, availableOnly }` | `paginated(itemSummary)` | ล็อกอิน | ✅ `q` ค้นจากชื่อ / คำอธิบาย / **asset tag ของชิ้นย่อย** |
| `item.getById` | query | `{ id }` | `itemDetail` | ล็อกอิน | ✅ พร้อมชิ้นย่อยทุกชิ้น + สภาพ + กำหนดคืน |
| `item.getAvailability` | query | `{ id }` | `{ availableUnits, totalUnits, nextAvailableAt }` | ล็อกอิน | ✅ **poll 10–15 วิ** output เล็กที่สุดเท่าที่ทำได้ |
| `item.listUnits` | query | `{ id }` | `itemUnit[]` | ล็อกอิน | ✅ |
| `item.listRooms` | query | `paginationInput + { ownerGroupKey?, bookableOnly }` | `paginated(roomSummary)` | ล็อกอิน | ✅ `q` ค้นจากชื่อ / คำอธิบาย / สถานที่ |
| `item.getRoomById` | query | `{ id }` | `roomSummary` | ล็อกอิน | ✅ |
| `item.listCategories` | query | — | — | ล็อกอิน | ❌ `NOT_IMPLEMENTED` ไม่มีตารางหมวดหมู่ |

**ทุกตัวต้องล็อกอิน** — catalogue ไม่ใช่ข้อมูลสาธารณะ ว่าคณะมีอุปกรณ์อะไรและหายไปกี่ชิ้น
ไม่ควรแจกให้คนที่ไม่ได้ล็อกอิน

### Tier — เปลี่ยนที่มาแล้วตอนรวมสาขา (`feat/trpc-backend`)

> **ของเดิมในสาขานี้คำนวณ tier จาก `CreditWeight` — ตอนนี้ไม่ใช่แล้ว**
> สาขา `feat/trpc-staff-staff` อ่าน tier จาก `BorrowRule.RuleName` ตอนรวมสองสาขา
> จึงต้องเลือกอันเดียว และตัดสินจากเอกสาร ผลคือ **`BorrowRule.RuleName` ชนะ**

เหตุผลสามข้อ เรียงตามน้ำหนัก:

1. `BorrowConstraints` ถูก unique ด้วย `(BorrowRuleKey, CreditTierKey)` และเก็บ
   `MaxBorrowDate` / `MaxExtendTime` / `MinimumAuthorityLevel` — ก็คือตาราง
   T-tier × D-tier ที่ `CONTRACT.md` อธิบายไว้ตรง ๆ ("เครดิตกำหนดแค่จำนวนวันยืม
   สูงสุด ผ่าน `CreditTier` → `BorrowConstraints.MaxBorrowDate`) ถ้า tier ไม่ใช่แถว
   `BorrowRule` ก็ไม่มีอะไรเป็นคีย์ของตารางนั้นได้
2. `admin.getLendingSettings` / `updateLendingSettings` ในสาขานี้เองแก้กฎการยืม
   **รายแถว `BorrowRule`** อยู่แล้ว ถ้า catalogue ไปเดา tier จากที่อื่น หน้า admin
   กับหน้า catalogue จะบอก tier ของของชิ้นเดียวกันไม่ตรงกัน
3. `TIER_CONFIG` ให้ T0 กับ T3 มี `creditWeight` เท่ากันคือ 0 — credit weight
   จึงแยกสอง tier นี้ออกจากกันไม่ได้ด้วยตัวเอง มันคือ *ราคาเครดิต* ของของ
   ไม่ใช่ tier ของของ

ผลที่ตามมาในโค้ด:

| เดิม | ตอนนี้ |
|---|---|
| `equipmentTier` · `tierFromCreditWeight()` · `creditWeightRangeForTier()` | ลบทิ้ง แทนด้วย `resourceTier` · `tryMapTier()` |
| `itemSummary.tier` / `roomSummary.tier` เป็น enum เสมอ | **nullable** |
| กรอง `tier` ด้วยช่วง `CreditWeight` | กรองด้วย `Items.some.Resource.BorrowRuleInfo.RuleName` |

`tier` เป็น nullable เพราะ `BorrowRule` ผูกกับ `ResourceInfo` คือผูกกับ *ชิ้น*
ไม่ใช่ *ประเภท* — `ItemInfo` ที่เพิ่งสร้างด้วย `item.createType` ยังไม่มีชิ้น จึงยังไม่มี
tier (ดู `docs/staff.md` ส่วนที่ 2) และแถว `BorrowRule` ที่ภาควิชาตั้งเองนอกเหนือ
T0–T3 จะ map เป็น `null` แทนที่จะพังทั้งหน้า

**ต้อง seed `BorrowRule` T0–T3 ก่อนใช้งาน** (`npm run seed`) ไม่งั้นของทุกชิ้นจะไม่มี
tier และ `item.createUnit` จะโยน `TIER_NOT_CONFIGURED`

### สิ่งที่ schema ยังไม่รองรับ — เพิ่มจากส่วนที่ 3

| # | ต้องเพิ่ม | ปลดล็อกอะไร | ตอนนี้เป็นยังไง |
|---|---|---|---|
| 10 | ตาราง `Category` + `ItemInfo.CategoryKey` | `item.listCategories` · ตัวกรองหมวดหมู่ในหน้า catalogue | ❌ ไม่มีอะไรจัดกลุ่มอุปกรณ์เลย (frontend mock มี instrument / tool / board) |
| 11 | `RoomInfo.Capacity` (จำนวนที่นั่ง) | คอลัมน์ความจุ + ตัวกรอง S/M/L ในหน้าห้อง | ❌ ไม่มี |
| 12 | `RoomInfo.RoomType` (lab / meet / lect / shop) | ตัวกรองประเภทห้อง | ❌ ไม่มี |
| 13 | `RoomInfo.BuildingKey` หรือตาราง `Building` | ตัวกรองอาคาร | ⚠️ มีแต่ `RoomLocation` ที่เป็น free text — ค้นด้วย `q` ได้ แต่กรองเป็นกลุ่มไม่ได้ |
| 14 | ระบบสล็อตเวลาของห้อง | `freeSlots` / `totalSlots` ที่หน้า room list แสดง · `reservation.getSlots` | ❌ ต้องออกแบบร่วมกับโดเมน `reservation` ทั้งก้อน ไม่ใช่แค่คอลัมน์ |
| 15 | `ItemInfo.AvailableUnits` (คอลัมน์คำนวณไว้ล่วงหน้า) | เรียงตาม "ของว่าง" ในระดับ SQL | ⚠️ ดูหัวข้อถัดไป — งาน cron `computeAvailability` ที่วางแผนไว้แล้วคือคำตอบพอดี |

### เรื่องที่ต้องรู้: `item.list` ไม่ได้แบ่งหน้าใน SQL

sort ปริยายของหน้า catalogue คือ "ของว่างมากสุดก่อน" และ "ของว่าง" คือ **จำนวนชิ้นที่ตรงเงื่อนไข**
(อยู่ในคลัง และเปิดให้ยืม) ซึ่ง Prisma เรียงลำดับด้วย relation count **ที่มีเงื่อนไข** ไม่ได้
(เรียงด้วย count ที่ไม่มีเงื่อนไขได้ แต่นั่นคือคนละตัวเลข)

ถ้าเรียงเฉพาะหน้าที่ดึงมา ผลจะผิดแบบเงียบ ๆ — หน้า 2 จะไม่ต่อจากหน้า 1

ตอนนี้จึง **กรองใน SQL** (ซึ่งเป็นตัวที่ตัดข้อมูลออกจริง ๆ) แล้ว **เรียงกับตัดหน้าใน service**
แถวที่ดึงคือ *ประเภท* อุปกรณ์ ไม่ใช่ชิ้นย่อยและไม่ใช่ประวัติการยืม — คณะหนึ่งมีหลักร้อย ไม่ใช่หลักล้าน

**ต้องกลับมาแก้เมื่อ**: `ItemInfo` โตเกินหลักพันแถว **หรือ** งาน cron `computeAvailability`
(ข้อ 5 ในกลุ่มที่ 3 ของ *รายการเรียกใช้งานจาก Backend*) ทำเสร็จแล้วเก็บจำนวนของว่างเป็นคอลัมน์
— ตอนนั้นมันจะกลายเป็น `ORDER BY` ธรรมดาที่มี index

ส่วน `item.listRooms` **แบ่งหน้าใน SQL ปกติ** เพราะทุกคอลัมน์ที่ใช้เรียง (ชื่อ สถานที่ credit weight)
อยู่บน `RoomInfo` ตรง ๆ และห้องหนึ่งมี resource เดียว ไม่มีอะไรต้องนับ

### จุดที่สัญญาต่างจาก placeholder ของ frontend — เพิ่มจากส่วนที่ 4

| เรื่อง | placeholder | ของจริง | ทำไม |
|---|---|---|---|
| ค้นหาห้อง | **ไม่มี** | `item.listRooms` · `item.getRoomById` | สัญญาไม่ได้ระบุว่าค้นหาห้องอยู่โดเมนไหน — `reservation.*` เป็นเรื่อง *จอง* ไม่ใช่ *ค้นหา* · การค้นห้องกับค้นมัลติมิเตอร์คือการกระทำเดียวกันบนตารางเดียวกัน (`ResourceInfo`) เลยอยู่ใน `item` · **ถ้าทีมอยากให้ย้ายไป `reservation.listRooms` แก้ที่เดียวคือ alias ของ router** |
| `item.list` input | `{ page, pageSize, sort, q }` | ตัดฟิลด์ `order` ออก + เพิ่ม `tier`, `ownerGroupKey`, `availableOnly` | หน้า catalogue มี dropdown เรียงลำดับแต่ไม่มีปุ่มสลับทิศทาง การรับ `order` เท่ากับบอกว่ามีปุ่มที่ไม่มีจริง · sort แต่ละแบบมีทิศทางที่มีความหมายอยู่ทางเดียว |
| `credit.me` | `{ score, band, demerits }` | `{ accountId, score, tier, maxBorrowDays, maxExtendTimes, activePenalties, totalDeducted }` | ใช้ชื่อ `tier` ให้ตรงกับ `userOutput.creditTier` ที่ตกลงกันไปแล้ว แทนที่จะมีสองชื่อสำหรับของเดียวกัน |
| ชนิดของ id | `z.string()` | `z.number().int()` | เหมือนเดิม — PK เป็น `Int` |
