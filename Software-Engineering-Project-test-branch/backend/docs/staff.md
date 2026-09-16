# โดเมน `item` + `loan` + `inspection` — ส่วนของเจ้าหน้าที่ (Staff)

> ขอบเขต: **backend ฝั่ง staff เท่านั้น** · ไม่มีการแก้ `prisma/schema.prisma`
> แม้แต่บรรทัดเดียว · ไม่แตะโดเมน `admin` และไม่แตะ procedure ฝั่งผู้ยืม
>
> ต่อยอดจาก `docs/auth-admin.md` (สาขา `feat/trpc-auth-admin`) ซึ่งวางโครง
> session, `BusinessError`, `paginationInput` และ `CreditTierService` ไว้แล้ว
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
npm run trpc:generate         # ต้องได้ 6 routers / 57 procedures
npm test -- penalty.service.spec staff-scope.service.spec status.schema.spec \
            image.schema.spec image.service.spec image.controller.spec app.module.spec
```

ชุดเทสต์ข้างบนไม่ต้องมีฐานข้อมูล — `app.module.spec.ts` mock `PrismaService`
ทิ้ง จึงจับกรณี "ลืมใส่ provider" ได้ใน CI ที่ไม่มี Postgres ส่วน
`image.controller.spec.ts` ยิง HTTP จริงผ่าน supertest เข้า route อัปโหลด
(ส่วน `auth.service.spec.ts` กับ `prisma.service.spec.ts` ยังต้องมี Postgres
วิ่งอยู่เหมือนเดิม)

**ตัวแปรใหม่ใน `.env`:** `MEDIA_ROOT` (ที่เก็บไฟล์ที่อัปโหลด) และ
`PUBLIC_API_URL` — ตัวหลังต้องเป็น URL ที่**เบราว์เซอร์**เข้าถึงได้ เพราะถูกฝัง
ลงใน upload URL ที่ส่งกลับไปให้ client

### ทดลองรันเองว่าทำงานจริง

หลังตั้งฐานข้อมูลเสร็จ:

```bash
npm run db:seed        # ใส่ข้อมูลตั้งต้นที่โค้ดขาดไม่ได้
npm run smoke:staff    # เดินครบ flow แล้วพิมพ์ผลทีละขั้น
```

`smoke:staff` เดิน 9 ขั้น: ตรวจ tier → อัปโหลดรูปจริงผ่าน `PUT /uploads/:token`
→ ยิงสคริปต์ปลอมเป็น PNG เพื่อดูว่าถูกปฏิเสธ → `createType` → `createUnit` 3 ชิ้น
→ ลอง T2 ไม่ใส่ serial ให้โดนปฏิเสธ → `createRoom` → อ่านกลับจาก DB → เปิดรูปที่
`/media/...` → ทดสอบว่าคนนอกภาควิชาถูกปฏิเสธ · **ขั้นไหนล้ม สคริปต์ exit 1**

`seed.ts` ใส่เฉพาะแถวอ้างอิงที่ขาดแล้วพัง ไม่ใช่ข้อมูลตัวอย่าง:
`BorrowRule` T0–T3 (ขาด → `TIER_NOT_CONFIGURED`), `ManagementGroup` + `Authority`
ของบัญชี staff (ขาด → `NO_MANAGEMENT_SCOPE`), `CreditTier` D0–D3 รันซ้ำได้ไม่พัง

> **`smoke:staff` ยิงเข้า service layer ตรง ๆ ไม่ผ่าน HTTP/login** เพราะ base นี้คือ
> `main` ซึ่ง `trpc/context.ts` ยัง stub `verifySessionToken()` ให้คืน `null`
> ทุก request จึงเป็น 401 ก่อนถึง procedure · จะทดสอบผ่าน tRPC จริงได้เมื่องาน
> session ของสาขา `feat/trpc-auth-admin` เข้า `main` แล้ว
>
> อีกเรื่อง: `tsx` แปลง decorator metadata ไม่ได้ อะไรที่บูท Nest จึงต้องคอมไพล์ด้วย
> `tsc` ก่อน — `smoke:staff` ทำให้แล้ว แต่ถ้าเขียนสคริปต์ใหม่เองอย่าเรียก
> `npx tsx` ตรง ๆ ไม่งั้นจะเจอ `Cannot read properties of undefined (reading 'get')`

> **หลัง seed แล้ว `auth.service.spec.ts` จะล้ม 1 เคส** — ไม่ใช่ผลจากงาน staff
> เทสต์นั้นสร้าง `CreditTier` ชื่อ "D2" ช่วง 50–79 ของตัวเอง แล้วสมมติว่าเป็นแถวเดียว
> ในตาราง พอ seed ใส่แถวตาม §5.7 ลงไป (50–79 = **D1** ไม่ใช่ D2) เครดิต 65 จึงตกลง
> คนละ tier · สามอย่างที่ควรบอกเจ้าของโดเมน auth:
> 1. เทสต์ผูกกับสมมติฐานว่าตารางว่าง — รันบน DB ที่มีข้อมูลแล้วจะล้ม
> 2. ป้าย tier ในเทสต์ขัดกับข้อเสนอ (§5.7 ว่า 79–50 = D1, 49–30 = D2)
> 3. `resolveBorrowLimits` ใช้ `findFirstOrThrow` โดยไม่มี `orderBy` ถ้ามีแถวช่วง
>    ทับกัน ผลลัพธ์จะไม่แน่นอน — ควรมี unique constraint หรือ orderBy
>
> ถ้าจะรัน `npm test` ให้เขียวทั้งหมด ใช้ฐานข้อมูลที่ยังไม่ได้ seed

**หมายเหตุเรื่องพอร์ต:** ถ้ามี Postgres ของเครื่องตัวเองครองพอร์ต 5432 อยู่แล้ว
ให้ map คอนเทนเนอร์ไป 5433 แล้วแก้ `DATABASE_URL` ตาม ไม่งั้นจะต่อไปโดน
ฐานข้อมูลผิดตัวโดยไม่มี error

---

## 2 · procedure ที่เพิ่มเข้ามา

ทุกตัวใช้ `StaffMiddleware` (staff + admin) และ **จำกัดตามภาควิชา** เพิ่มอีกชั้น
(ดูส่วนที่ 5 ข้อ 1)

### `item` — งานตั้งค่าเริ่มต้น (ข้อเสนอ §5.9 "งานตั้งค่าเริ่มต้น")

| procedure | ชนิด | input | output | role | สถานะ |
|---|---|---|---|---|---|
| `item.listManaged` | query | `paginationInput + { tier?, availableOnly }` | `paginated(itemTypeSummary)` | staff | ✅ `q` ค้นจากชื่อ/คำอธิบาย/serial · นับ `totalUnits` และ `availableUnits` เฉพาะชิ้นในภาควิชาตัวเอง |
| `item.getManagedById` | query | `{ itemKey }` | `itemTypeDetail` | staff | ✅ พร้อมรายชิ้นทั้งหมด |
| `item.createType` | mutation | `{ name, description?, imageUrl?, creditWeight }` | `itemTypeDetail` | staff | ✅ ยังไม่มีชิ้น จึงยังไม่มี tier |
| `item.updateType` | mutation | `{ itemKey, ...ที่จะแก้ }` | `itemTypeDetail` | staff | ✅ |
| `item.listManagedUnits` | query | `{ itemKey, status?, lendable? }` | `itemUnitOutput[]` | staff | ✅ ใช้เป็นตัวเลือกตอน `loan.allocate` |
| `item.createUnit` | mutation | `createItemUnitInput` | `itemUnitOutput[]` | staff | ✅ `quantity` ลงทะเบียนทีละหลายชิ้น · T1/T2 บังคับ serial |
| `item.updateUnit` | mutation | `{ resourceKey, serialNo?, tier?, prepDays?, imageUrl? }` | `itemUnitOutput` | staff | ✅ |
| `item.setUnitLendable` | mutation | `{ resourceKey, lendable, reason? }` | `itemUnitOutput` | staff | ✅ §5.9 "ปรับสถานะชั่วคราว" · ปฏิเสธถ้ายังมีคนถืออยู่ (`RESOURCE_IN_USE`) |
| `item.setUnitCondition` | mutation | `{ resourceKey, condition, note? }` | `itemUnitOutput` | staff | ✅ ของพังที่เจอบนชั้น — **ไม่หักเครดิตใคร** |
| `item.listManagedRooms` | query | `paginationInput + { lendable? }` | `paginated(roomOutput)` | staff | ✅ |
| `item.createRoom` | mutation | `createRoomInput` | `roomOutput` | staff | ⚠️ ไม่มีที่เก็บจำนวนที่นั่ง/ความยาวสล็อต (ส่วนที่ 3 ข้อ 3) |
| `item.updateRoom` | mutation | `{ resourceKey, ...ที่จะแก้ }` | `roomOutput` | staff | ⚠️ เหมือนกัน |
| `item.listEligibility` | query | `{ itemKey }` | `eligibilityRule[]` | staff | ✅ ยุบแถวรายชิ้นกลับเป็นกฎรายประเภท |
| `item.setEligibility` | mutation | `{ itemKey, rules[] }` | `eligibilityRule[]` | staff | ⚠️ แทนที่ทั้งชุด · กระจายลงทุกชิ้นใน transaction เดียว (ส่วนที่ 3 ข้อ 6) |
| `item.listTiers` | query | — | `tierOptionOutput[]` | staff | ✅ อ่านจาก `BorrowRule` จริง |
| `item.listManagementGroups` | query | — | `managementGroupRef[]` | staff | ✅ คืนเฉพาะกลุ่มที่ตัวเองมีอำนาจ |
| `item.listAuthorityRoles` | query | — | `authorityRoleOptionOutput[]` | staff | ✅ |

### `loan` — เคาน์เตอร์รับ–ส่ง (§5.9 "งานประจำวัน")

| procedure | ชนิด | input | output | role | สถานะ |
|---|---|---|---|---|---|
| `loan.staffQueue` | query | `paginationInput + { bucket, tier? }` | `paginated(staffQueueRow)` | staff | ✅ **poll 30 วิ** · bucket: `toPrepare` / `toHandover` / `onLoan` / `overdue` |
| `loan.queueCounts` | query | — | `staffQueueCounts` | staff | ✅ **poll 30 วิ** · 6 ตัวเลขสำหรับหน้า dashboard |
| `loan.getForStaff` | query | `{ usageKey }` | `loanOutput` | staff | ✅ |
| `loan.allocate` | mutation | `{ reservationKey, resourceKey?, condition, note? }` | `loanOutput` | staff | ✅ สร้าง `UsageLog` สถานะ `Prepared` · error: `NOT_APPROVED_YET`, `ITEM_UNAVAILABLE` |
| `loan.swapUnit` | mutation | `{ usageKey, resourceKey, reason? }` | `loanOutput` | staff | ✅ เฉพาะ T1 (`UNIT_SWAP_NOT_ALLOWED`) |
| `loan.confirmPickup` | mutation | `{ usageKey, note? }` | `loanOutput` | staff | ✅ `Prepared` → `Lended` |
| `loan.recordReturn` | mutation | `{ usageKey, note? }` | `{ loan, latePenalty }` | staff | ✅ `Lended` → `Returned` + **หักเครดิตคืนช้าทันที** |
| `loan.markLost` | mutation | `{ usageKey, reason?, reportedByBorrower }` | `loanOutput` | staff | ✅ ต้องเกิน 14 วัน (`NOT_YET_LOST`) เว้นแต่ผู้ยืมมารายงานเอง |
| `loan.extensionReviews` | query | `paginationInput` | `paginated(extensionReviewRow)` | staff | ✅ กรอง T2 ออก (เป็นคิวของอาจารย์) |
| `loan.decideExtension` | mutation | `{ extensionKey, decision, condition, note? }` | `loanOutput` | staff | ✅ §5.9 "ต่ออายุแบบตรวจสภาพ" · error: `ALREADY_DECIDED`, `EXTENSION_NEEDS_SUPERVISOR` |

### `inspection` — โต๊ะตรวจสภาพ (§5.7, §5.9)

| procedure | ชนิด | input | output | role | สถานะ |
|---|---|---|---|---|---|
| `inspection.list` | query | `paginationInput + { tier? }` | `paginated(inspectionQueueRow)` | staff | ✅ **poll 30 วิ** · คืนแล้วแต่ยังไม่ประเมิน |
| `inspection.getById` | query | `{ usageKey }` | `inspectionSubjectOutput` | staff | ✅ รูปตอนรับ/ตอนคืนวางคู่กัน + ประวัติสภาพของชิ้นนั้น 10 รายการล่าสุด |
| `inspection.create` | mutation | `{ usageKey, level, note?, imageUrls[] }` | `inspectionOutput` | staff | ✅ B0–B3 → `ConditionLog` + `Inspection` + `PenaltyInfo` ใน transaction เดียว · error: `ALREADY_INSPECTED` |
| `inspection.listForResource` | query | `{ resourceKey, limit }` | `inspectionHistoryEntry[]` | staff | ✅ ประวัติความเสียหายผูกกับหมายเลขอุปกรณ์ (§5.4) |
| `inspection.recordRoomCheck` | mutation | `{ resourceKey, condition, note? }` | `roomCheckOutput` | staff | ✅ §5.9 "ตรวจสถานที่รายวัน" (T3) — เฉพาะการ**บันทึกผล** |
| `inspection.listRepairs` | query | `paginationInput + { openOnly }` | `paginated(repairOutput)` | staff | ✅ R02 |
| `inspection.startRepair` | mutation | `{ resourceKey, note? }` | `repairOutput` | staff | ✅ ดึงออกจาก pool ระหว่างซ่อม |
| `inspection.finishRepair` | mutation | `{ repairKey, condition, note? }` | `repairOutput` | staff | ✅ ผลเป็น `Normal` = กลับเข้า pool |
| `inspection.proposeDecommission` | mutation | `{ resourceKey, reason }` | `decommissionRequestOutput` | staff | ❌ `NOT_IMPLEMENTED` — ไม่มีตารางเก็บคำขอ (ส่วนที่ 3 ข้อ 8) |

### `image` — อัปโหลดไฟล์ (CONTRACT.md ส่วนที่ 3)

| procedure | ชนิด | input | output | role | สถานะ |
|---|---|---|---|---|---|
| `image.requestUpload` | mutation | `{ purpose, contentType, sizeBytes }` | `{ uploadUrl, imageUrl, previewUrl, expiresAt, maxBytes }` | staff | ✅ `purpose`: `itemType` / `itemUnit` / `room` / `inspection` |
| `PUT /uploads/:token` | **REST** | ไฟล์ดิบใน body | `{ imageUrl, previewUrl, bytes }` | ticket | ✅ ไม่ใช่ tRPC — tRPC ส่ง binary ไม่ได้ |

ขั้นตอนตรงกับที่ `frontend/src/lib/api-client.ts` ทำอยู่แล้วเป๊ะ:

```
1. image.requestUpload            → ได้ uploadUrl (เซ็น HMAC อายุ 10 นาที)
2. api-client.uploadFile(url,file)→ PUT ไฟล์ตรงไป ไม่ผ่าน tRPC
3. item.createType({ imageUrl })  → เอา imageUrl ที่ได้จากข้อ 1 ไปเก็บ
```

ข้อ 3 คือขั้น commit — ไฟล์ที่อัปแล้วไม่มีใครอ้างถึงจะเป็นแค่ไฟล์กำพร้าบนดิสก์
ซึ่งเป็นผลลัพธ์ที่ถูกต้องกว่าการมีแถวที่ชี้ไปยังไฟล์ครึ่ง ๆ กลาง ๆ

**`imageUrl` เก็บเป็น path สัมพัทธ์ (`/media/...`) แต่ส่งออกเป็น URL เต็ม** —
mutation รับได้ทั้งสองแบบและ normalize ให้เอง ดังนั้นย้าย API ไปโดเมนอื่นแล้ว
ไม่ต้องไล่แก้ข้อมูลในตาราง

### รหัสข้อผิดพลาดที่เพิ่มใน `common/errors/business-error.ts`

| รหัส | รหัส tRPC | ข้อมูลประกอบ |
|---|---|---|
| `NO_MANAGEMENT_SCOPE` | `PRECONDITION_FAILED` | `{ accountKey }` |
| `OUT_OF_MANAGEMENT_SCOPE` | `FORBIDDEN` | `{ resourceKey? , itemKey?, manageGroupKey? }` |
| `RESOURCE_NOT_FOUND` / `ITEM_TYPE_NOT_FOUND` | `NOT_FOUND` | `{ resourceKey }` / `{ itemKey }` |
| `SERIAL_ALREADY_IN_USE` | `CONFLICT` | `{ itemKey, serialNo }` |
| `SERIAL_REQUIRED_FOR_TIER` | `BAD_REQUEST` | `{ tier, quantity }` |
| `TIER_NOT_CONFIGURED` | `PRECONDITION_FAILED` | `{ tier }` |
| `RESOURCE_IN_USE` | `CONFLICT` | `{ resourceKey, usageKey, state }` |
| `RESERVATION_NOT_FOUND` / `LOAN_NOT_FOUND` | `NOT_FOUND` | `{ reservationKey }` / `{ usageKey }` |
| `NOT_APPROVED_YET` | `CONFLICT` | `{ reservationKey, status }` |
| `WRONG_LOAN_STATE` | `CONFLICT` | `{ usageKey, actual, expected }` |
| `UNIT_DOES_NOT_MATCH_REQUEST` | `BAD_REQUEST` | `{ resourceKey, expectedItemKey, actualItemKey }` |
| `EXTENSION_NOT_FOUND` | `NOT_FOUND` | `{ extensionKey }` |
| `EXTENSION_NEEDS_SUPERVISOR` | `FORBIDDEN` | `{ extensionKey, tier }` |
| `UNIT_SWAP_NOT_ALLOWED` | `FORBIDDEN` | `{ usageKey, tier }` |
| `NOT_YET_LOST` | `CONFLICT` | `{ usageKey, overdueDays, requiredDays }` |
| `INSPECTION_NOT_FOUND` | `NOT_FOUND` | `{ inspectionKey }` |
| `ALREADY_INSPECTED` | `CONFLICT` | `{ usageKey, inspectionKey }` |
| `UPLOAD_TICKET_INVALID` | `FORBIDDEN` | — (ปลอม / หมดอายุ / รูปแบบผิด ตอบเหมือนกันหมด) |
| `UPLOAD_TYPE_MISMATCH` | `BAD_REQUEST` | `{ expected, actual }` |
| `UPLOAD_TOO_LARGE` | `PAYLOAD_TOO_LARGE` | `{ maxBytes, actualBytes }` |
| `UPLOAD_EMPTY` | `BAD_REQUEST` | `{ key }` |
| `UPLOAD_NOT_AN_IMAGE` | `BAD_REQUEST` | `{ contentType }` |
| `UPLOAD_ALREADY_STORED` | `CONFLICT` | `{ key }` |
| `UPLOAD_REJECTED` | `BAD_REQUEST` | `{ key }` |

**ทุกรหัสใหม่ frontend ต้องเพิ่มข้อความไทยใน `lib/error-messages.ts`** ไม่งั้น
compile ไม่ผ่าน (ตามข้อตกลง ว-06)

---

## 3 · สิ่งที่ schema ยังไม่รองรับ (ส่งให้คนที่ดูแล `schema.prisma`)

เรียงจากที่กระทบมากไปน้อย

| # | ต้องเพิ่ม | ปลดล็อกอะไร | ตอนนี้เป็นยังไง |
|---|---|---|---|
| 1 | `ItemIndiv.@@unique([ItemKey, ItemID])` | serial ไม่ซ้ำจริง | เช็คใน service ก่อน insert = **race condition** เจ้าหน้าที่สองคนลงทะเบียน serial เดียวกันพร้อมกันผ่านทั้งคู่ ฐานข้อมูลเท่านั้นที่กันได้ |
| 2 | `AccountInfo.CreatedAt` และคอลัมน์เวลาบน `UsageLog` ที่บอกว่า "อนุมัติเมื่อไร" | ยกเลิกอัตโนมัติเมื่อไม่มารับใน 1 วัน (§5.9) | `Reservations.ReservationExpiration` มีอยู่ แต่ไม่มีอะไรบอกว่า "อนุมัติตอนไหน" ให้ cron จับ |
| 3 | `RoomInfo.SeatCount` และความยาวสล็อตเวลา | §5.9 "ลงทะเบียนสถานที่: กำหนดห้อง ความยาวของสล็อตเวลา และจำนวนที่นั่ง" | `item.createRoom` เก็บได้แค่ชื่อ/ที่ตั้ง/คำอธิบาย · การจองสล็อต T3 จึงยังคำนวณ "ว่างกี่ที่" ไม่ได้ |
| 4 | ตาราง/คอลัมน์ `work_time` (ช่วงเวลารับ–คืนต่อหน่วยงาน) | §5.9 "กำหนดเวลารับ–คืน" | `DUE_TIME_OF_DAY_UTC = '10:00:00'` (17:00 ไทย) เป็นค่าคงที่ในโค้ด ทุกภาควิชาใช้ค่าเดียวกัน |
| 5 | `BorrowConstraints.MaxConcurrentItems` | §5.9 "จำนวนที่ยืมพร้อมกันได้" | ไม่มีที่เก็บ · ตอนนี้ไม่มีการจำกัดจำนวนชิ้นที่ถือพร้อมกัน |
| 6 | `Eligibility.ItemKey` (หรือย้ายไปผูกกับ `ItemInfo`) | กฎสิทธิ์ระดับประเภท | `Eligibility` ผูกกับ `ResourceKey` รายชิ้น · `item.setEligibility` จึงเขียนกระจายลงทุกชิ้น และ **ชิ้นที่ลงทะเบียนทีหลังจะไม่ได้กฎอัตโนมัติ** ต้องกด `setEligibility` ซ้ำ |
| 7 | ค่า `Lost` ใน enum `CurrentStatus` | สถานะของหายที่อ่านออกตรง ๆ | `loan.markLost` เข้ารหัสเป็น `CurrentStatus = Inspected` + `CheckInCondition = Missing` + `ResourceStatus = Missing` — ใครจะกลับรายการตอนของโผล่มา ต้องหาคู่นี้ |
| 8 | ตาราง `DecommissionRequest` + `AuditLog` | `inspection.proposeDecommission` และการอนุมัติปลดระวางของอาจารย์ | โยน `NOT_IMPLEMENTED` พร้อมรายชื่อคอลัมน์ใน `cause.missing` |
| 9 | คอลัมน์บน `ExtensionRequest` ที่บอกว่า "ต่อแบบออนไลน์" หรือ "ต่อแบบตรวจสภาพ" | บังคับกติกาสลับของ T1 (§5.4) | มีแค่ `ExtendNo` · ระบบยังตรวจไม่ได้ว่าครั้งนี้ถึงคิวต้องเอาของมาให้ตรวจหรือยัง — ตอนนี้ขึ้นกับว่าใครสร้าง `ExtensionRequest` ขึ้นมา |
| 10 | `Reservations.ApprovedBy` ยังไม่มี relation | ตรวจว่า "ผู้อนุมัติต้องไม่ใช่ผู้ขอ" (§5.9) | เป็น `Int?` ลอย ๆ ใครจะทำโดเมน supervisor ต้องเพิ่ม relation ก่อน |
| 11 | คอลัมน์ available-from | §5.5 "วันที่พร้อมให้ยืม" | ยังไม่มีที่เก็บ · เป็นงาน cron ข้อ 5 ที่ยังไม่มีคนทำ |

---

## 4 · จุดที่สัญญาต่างจากไฟล์ placeholder ของ frontend

เทียบกับ `frontend/src/server/trpc-contract.ts`

| เรื่อง | placeholder | ของจริง | ทำไม |
|---|---|---|---|
| ชนิดของ id | `z.string()` | `z.number().int()` | PK ในฐานข้อมูลเป็น `Int` เหมือนที่ `admin` ตกลงไปแล้ว |
| ชื่อ id | `id` เดี่ยว ๆ | `itemKey` / `resourceKey` / `usageKey` / `reservationKey` | หน้าจอ staff หนึ่งหน้าถือ key สามแบบพร้อมกัน (ประเภท / ชิ้น / รายการยืม) `id` เฉย ๆ จะสลับกันโดยไม่มีอะไรฟ้อง |
| `item.list` | staff ใช้ตัวเดียวกับผู้ยืม | `item.listManaged` แยกออกมา | ของผู้ยืมต้องกรองด้วย `Eligibility` ของผู้ยืม ส่วนของ staff กรองด้วยภาควิชา — คนละ query คนละสิทธิ์ ถ้าใช้ชื่อเดียวกันจะมีวันที่ใครสักคนเผลอเปิดให้ผู้ยืมเห็น |
| `item.updateUnitStatus` | `{ unitId, status }` | แยกเป็น `setUnitLendable` กับ `setUnitCondition` | "ปิดไม่ให้ยืม" กับ "ของพัง" เป็นคนละเรื่อง อันแรกกลับคืนได้ อันหลังเป็นบันทึกถาวรที่ผูกกับหมายเลขอุปกรณ์ |
| `loan.return` | คืน `Loan` | `loan.recordReturn` คืน `{ loan, latePenalty }` | ถ้าไม่คืนค่าปรับกลับมา หน้าจอจะบอกผู้ยืมไม่ได้ว่าเพิ่งโดนหักกี่แต้มและหมดอายุเมื่อไร |
| `inspection.create` | `{}` passthrough → `DamageReport` | `{ usageKey, level: B0–B3, imageUrls[] }` → `inspectionOutput` | ระดับความเสียหายเป็นค่าคงที่สี่ค่าจาก §5.7 ไม่ใช่ข้อความอิสระ |
| `inspection.confirm` | มี | ไม่มี | ไม่มีขั้น "ยืนยันอีกที" — `inspection.create` จบรายการเลย และการแก้ผลประเมินต้องผ่านการอุทธรณ์เท่านั้น |
| `report.dashboard` | มี | ยังไม่มี | ตัวเลขบน dashboard ของ staff มาจาก `loan.queueCounts` ส่วน `report.*` ยังไม่มีเจ้าของ |

---

## 5 · เรื่องที่ต้องรู้ก่อนรีวิว

1. **สิทธิ์ตามภาควิชาบังคับจริงแล้วในสไลซ์นี้** — `docs/auth-admin.md` ส่วนที่ 5
   ข้อ 1 บอกว่าทำไม่ได้เพราะ `ctx.user.facultyKey` เป็น null เสมอ แต่ตาราง
   `Authority` (AccountKey × ManageGroupKey) ตอบคำถามนี้ได้โดยตรง และ
   `ResourceInfo.ManagedBy` ก็ชี้ไปที่กลุ่มเดียวกัน · `StaffScopeService`
   จึงเป็นตัวกลาง: ทุก query กรองด้วย `ManagedBy in (กลุ่มของฉัน)` และทุก
   mutation เรียก `assertResourceInScope()` ก่อนเขียน **admin ไม่ถูกจำกัด**
   โดยตั้งใจ · บัญชี staff ที่ไม่มีแถว `Authority` เลยจะได้
   `NO_MANAGEMENT_SCOPE` ไม่ใช่ผลลัพธ์ว่าง เพราะ "ภาควิชาคุณไม่มีอุปกรณ์" เป็น
   ข้อสรุปที่ผิดและอันตราย

2. **ทุก mutation ตรวจสถานะก่อนเขียน** — `Pending → Prepared → Lended →
   Returned → Inspected` เดินได้ทีละก้าว ถ้าเรียกจากสถานะอื่นจะได้
   `WRONG_LOAN_STATE` พร้อม `cause.actual` และ `cause.expected` · นี่คือกันปุ่ม
   ที่เคาน์เตอร์ถูกกดสองครั้ง ซึ่งเป็นเรื่องปกติที่สุดของหน้าจอแบบนี้

3. **การคืนกับการประเมินแยกกันโดยตั้งใจ** — `loan.recordReturn` ปิดเรื่องเวลา
   (หักค่าปรับคืนช้าทันที) แล้วปล่อยเรื่องสภาพให้ `inspection.create` ·
   เหตุผลสองข้อ: เคาน์เตอร์ตอนคนแน่นต้องรับของแล้วให้ผู้ยืมไปก่อน และ §5.4
   ระบุเองว่า T2 ให้ "staff A" ส่งมอบ "staff B" ตรวจ · ระหว่างสองขั้นนี้ ชิ้น
   ของยัง**ไม่กลับเข้า pool** เพราะ `UNAVAILABLE_USAGE_STATES` รวม `Returned`
   ไว้ด้วย — ไม่งั้นความเสียหายของคนก่อนจะกลายเป็นของคนถัดไป

4. **ค่าปรับคำนวณที่เดียว** — `PenaltyService` ใช้ `PenaltyRule` ก่อนถ้ามีแถว
   (นั่นคือสิ่งที่ `admin.updateLendingSettings` แก้) ถ้าไม่มีจึงตกไปใช้สูตรใน
   §5.7 · การหักแต้มใช้ `{ decrement }` ไม่ใช่อ่านแล้วเขียนทับ เพราะค่าปรับสองใบ
   ที่ลงพร้อมกันจะลบล้างกันเอง · **การคืนแต้มเมื่อโทษหมดอายุไม่ได้อยู่ในสไลซ์นี้**
   เป็นงาน cron รายวัน "หมดอายุบทลงโทษ" — ที่นี่แค่ตั้ง `ExpirationTime` ไว้ให้

5. **`sort` มี whitelist ทุกที่** — เหมือน `admin` · ส่วนคิวงานของ staff
   ไม่เปิด `sort` เลย เรียงตาม due/เวลาที่คืนอย่างเดียว เพราะมันคือคิว

6. **route อัปโหลดไม่มี session และนั่นคือเรื่องปกติ** — `api-client.uploadFile`
   ยิง `fetch` PUT เปล่า ๆ ไม่ส่ง cookie ดังนั้น `PUT /uploads/:token` อ่าน
   session ไม่ได้เลย · สิ่งที่ทำหน้าที่แทนคือ **ตัว URL เอง**: token เป็น HMAC
   ที่เซ็นด้วย `SESSION_SECRET` ผูกกับ storage key หนึ่งอัน, content type หนึ่งค่า,
   ขนาดหนึ่งค่า และหมดอายุใน 10 นาที · ฝั่งรับตรวจซ้ำทุกอย่างที่ client ตรวจไปแล้ว
   รวมถึง **magic bytes** ของไฟล์ (ไฟล์ที่บอกว่าเป็น `image/png` แต่ขึ้นต้นด้วย
   `#!/bin/sh` ถูกปฏิเสธ) เพราะ Content-Type เป็นแค่คำกล่าวอ้างของผู้อัปโหลด ·
   ชื่อไฟล์มาจาก UUID ล้วน ไม่มีอะไรที่ client ส่งมาถูกใช้ประกอบ path

7. **ไฟล์ที่อัปโหลดเสิร์ฟแบบไม่มี auth** — กันด้วยการเดา URL ไม่ได้ (UUID)
   ไม่ใช่ด้วยสิทธิ์ · **นี่คือข้อจำกัดจริง ไม่ใช่สิ่งที่ตั้งใจ**: §5.8 จัดรูปถ่าย
   อุปกรณ์เป็นข้อมูลส่วนบุคคล แต่เบราว์เซอร์ไม่ส่ง cookie ไปกับ `<img src>`
   ข้ามโดเมน การใส่ auth จึงต้องแก้ฝั่ง frontend ด้วย · ก่อนขึ้นใช้กับนักศึกษาจริง
   ต้องปิดช่องนี้ (เสิร์ฟผ่าน route ที่ตรวจสิทธิ์ หรือใช้ presigned GET ของ S3)

8. **เก็บไฟล์ลงดิสก์ในเครื่อง** — ไม่มีงบ object storage ในข้อเสนอ (§8) แต่รูปร่าง
   ของ flow เป็นแบบ presigned URL ตาม CONTRACT.md อยู่แล้ว การย้ายไป S3 จึงแก้แค่
   `ImageService.issueTicket` (สร้าง URL) กับ `store` (`writeFile`) ไม่กระทบโดเมน
   ไหนและไม่กระทบ frontend เลย · ไฟล์ที่ถูกแทนที่ยังค้างบนดิสก์ ยังไม่มีงานเก็บกวาด

9. **`penaltyReason` ประกาศซ้ำสองที่** — มีทั้งใน `admin/admin.schema.ts` (ของเดิม)
   และ `common/schemas/status.schema.ts` (ที่เพิ่มใหม่ ตามข้อตกลง ว-10 ว่าสถานะ
   ควรอยู่ที่เดียว) · **ไม่ได้แก้ให้เพราะไม่แตะไฟล์ในโดเมน admin** — เป็นงานลบ
   บรรทัดเดียว: ให้ `admin.schema.ts` import จาก `status.schema.ts` แทน

---

## 6 · สิ่งที่ **ไม่ได้** อยู่ในสไลซ์นี้

เขียนไว้กันเข้าใจผิดว่าโดเมนพวกนี้ทำเสร็จแล้ว

| ของ | เจ้าของ |
|---|---|
| `item.list` / `getById` / `availability`, `loan.list` / `getById` / `create` / `cancel` / `requestExtension` | สไลซ์ผู้ยืม (ใส่ใน router เดียวกัน ไม่ชนชื่อกับของที่มีอยู่) |
| `approval.*` — อนุมัติ T2, เครดิตต่ำ, ต่ออายุ T2, ตัดสินอุทธรณ์, อนุมัติปลดระวาง | สไลซ์อาจารย์ (supervisor) |
| `reservation.*` — สล็อตเวลา T3 และการจอง | ทีมงานอีกคน |
| งาน cron ทั้ง 8 ตัว (mark overdue, mark lost, หมดอายุบทลงโทษ, เตือนใกล้ครบกำหนด, คำนวณวันพร้อมให้ยืม, สร้างรอบตรวจ T3, สรุปสถิติ, ยกเลิกคำขอค้าง) | ทีมงานอีกคน · ทะเบียนงานอยู่ใน `admin.listCronJobs` แล้ว |
| `appeal.*`, `notification.*`, `report.*`, `credit.*` | ยังไม่มีเจ้าของ |
| `uploadPurpose` ของผู้ยืม (`loanBefore` / `loanAfter`) | สไลซ์ผู้ยืม · โครงอัปโหลดทำเสร็จแล้ว เหลือแค่เพิ่มค่าใน enum และเช็คว่าผู้เรียกถือ loan นั้นจริง แล้วลด `ImageRouter` จาก `StaffMiddleware` เป็น `AuthMiddleware` |

---

## 7 · ไฟล์ที่เพิ่ม/แก้

```
src/
├── item/                                   ★ ใหม่ทั้งโฟลเดอร์
│   ├── item.schema.ts                      zod ของ input/output ทุกตัว
│   ├── item.service.ts                     คลังอุปกรณ์ ห้อง สิทธิ์การเข้าใช้
│   └── item.router.ts                      17 procedure
├── loan/                                   ★ ใหม่ทั้งโฟลเดอร์ (ครึ่งของ staff)
│   ├── loan.schema.ts
│   ├── loan.service.ts                     คิวงาน จัดเตรียม ส่งมอบ รับคืน ของหาย ต่ออายุ
│   └── loan.router.ts                      10 procedure
├── inspection/                             ★ ใหม่ทั้งโฟลเดอร์
│   ├── inspection.schema.ts
│   ├── inspection.service.ts               ประเมิน B0–B3 ประวัติ ตรวจห้อง ซ่อม
│   └── inspection.router.ts                9 procedure
├── image/                                  ★ ใหม่ทั้งโฟลเดอร์
│   ├── image.schema.ts                     requestUpload input/output
│   ├── image.service.ts                    เซ็น ticket, รับไฟล์, แปลง URL (+ spec)
│   ├── image.router.ts                     image.requestUpload
│   └── image.controller.ts                 PUT /uploads/:token (+ spec ผ่าน supertest)
├── common/
│   ├── authority/staff-scope.service.ts    ★ ขอบเขตอำนาจตามภาควิชา (+ spec)
│   ├── penalty/penalty.service.ts          ★ สูตรหักเครดิต §5.7 (+ spec)
│   ├── usage/usage-states.ts               ★ HELD / UNAVAILABLE ใช้ร่วมสามโดเมน
│   ├── schemas/datetime.schema.ts          ★ ว-08 ISO/UTC + DUE_TIME_OF_DAY_UTC
│   ├── schemas/image.schema.ts             ★ กัน javascript:/data: ใน ImageURL (+ spec)
│   ├── schemas/status.schema.ts            + tier, damage level, lifecycle enum (+ spec)
│   └── errors/business-error.ts            + 26 รหัสใหม่
├── bootstrap.ts                            ★ cookie + CORS + mount /media ใช้ร่วมกับ smoke test
├── app.module.spec.ts                      ★ เช็ค DI ทั้งโมดูลโดยไม่ต้องมี DB
├── app.module.ts                           + provider ใหม่ · raw body middleware ของ route อัปโหลด
└── main.ts                                 + เสิร์ฟ /media, CORS อนุญาต PUT
```

นอกโฟลเดอร์ `src/`: `prisma/seed.ts` (ข้อมูลตั้งต้น), `scripts/smoke-staff.ts`
(ทดสอบ 9 ขั้น), `package.json` (+`db:seed`, `smoke:staff`, devDep `tsx`), `.env.example` (`MEDIA_ROOT`, `PUBLIC_API_URL`),
`.gitignore` (`/media`, `/dist-tools`), และประกาศ `express` เป็น dependency ตรง
(`app.module.ts` import มันเองแล้ว ไม่ควรพึ่ง transitive dep)

ไม่แตะ: `admin/`, `auth/`, `trpc/`, `prisma/schema.prisma`
