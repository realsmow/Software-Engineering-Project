# สัญญา tRPC ของ ULMs

> **ผลลัพธ์รวมของวาระ ว-05 ถึง ว-10** · ปลายทางจริง: `CONTRACT.md` ที่รากรีโป
>
> tRPC ไม่แถมหน้าเอกสาร API มาให้เหมือน OpenAPI สิ่งที่ทดแทนได้คือไฟล์นี้
> ซึ่งไม่ใช่งานเสียเปล่า เพราะใช้เป็นภาคผนวกของรายงานส่งอาจารย์ได้ด้วย
>
> **สถานะ: ร่าง** - เนื้อหาข้างล่างครอบคลุมเฉพาะ vertical slice ตัวอย่าง
> ต้องเติมให้ครบทั้ง 18 รายการจาก *รายการเรียกใช้งานจาก Backend.pdf*
> หลังที่ประชุมยืนยันข้อตกลงแล้ว

---

## ส่วนที่ 1 · ข้อตกลงร่วม

ทุก procedure ในตารางส่วนที่ 2 ยึดตามนี้ทั้งหมด ไม่มีข้อยกเว้น

| เรื่อง | ข้อตกลง | วาระ |
|---|---|---|
| การขนส่งสัญญา | **npm workspaces** - `autoSchemaFile` เขียนลง `packages/contract/src/generated/` ทั้งสองฝั่ง `import` จาก `@ulms/contract` ไม่มีขั้นตอนคัดลอก | ว-01 |
| เวอร์ชัน zod | 4.x ทั้งสองฝั่ง | ว-02 |
| การยืนยันตัวตน | httpOnly cookie ชื่อ `ulms_session` + `credentials: 'include'` | ว-03 |
| การจัดกลุ่ม | ตามโดเมน ไม่ใช่ตามบทบาท คุมสิทธิ์ด้วย middleware | ว-05 |
| คำกริยา | `list` · `getById` · `create` · `update` · `cancel` · `decide` · `confirm` | ว-05 |
| error | สองชั้น: รหัส tRPC + รหัสธุรกิจใน `message` และข้อมูลประกอบใน `cause` | ว-06 |
| ข้อความผู้ใช้ | อยู่ฝั่ง frontend เท่านั้น backend ส่งแต่รหัส | ว-06 |
| การแบ่งหน้า | ตามเลขหน้า `{ page, pageSize, q, sort, order }` → `{ items, total, page, pageSize }` ปริยาย 20 เพดาน 100 | ว-07 |
| วันที่/เวลา | สตริง ISO 8601 ใน UTC เสมอ · วันล้วนใช้ `YYYY-MM-DD` · แปลงเป็นเวลาไทยตอนแสดงผล | ว-08 |
| ชื่อฟิลด์ | `camelCase` ห้าม `return` Prisma model ตรง ๆ | ว-09 |
| สถานะ | สตริงคงที่ผ่าน `z.enum([...])` ห้ามส่งเลข primary key | ว-10 |

### รหัสข้อผิดพลาดทางธุรกิจ

ที่มา: `packages/contract/src/errors/error-codes.ts`

| รหัส | รหัส tRPC | ข้อมูลประกอบ |
|---|---|---|
| `NOT_AUTHENTICATED` | `UNAUTHORIZED` | - |
| `ROLE_NOT_ALLOWED` | `FORBIDDEN` | - |
| `NOT_ELIGIBLE` | `FORBIDDEN` | `{ itemId }` |
| `ITEM_UNAVAILABLE` | `CONFLICT` | `{ itemId, nextAvailableAt }` |
| `SLOT_TAKEN` | `CONFLICT` | `{ roomId, startTime }` |
| `LOAN_PERIOD_EXCEEDS_LIMIT` | `BAD_REQUEST` | `{ maxDays, requestedDays, creditTier }` |
| `EXTENSION_QUOTA_EXCEEDED` | `FORBIDDEN` | `{ used, maxTimes }` |
| `ALREADY_DECIDED` | `CONFLICT` | `{ decidedAt }` |
| `APPEAL_WINDOW_CLOSED` | `FORBIDDEN` | `{ closedAt }` |
| `CREDIT_TOO_LOW` | `FORBIDDEN` | `{ creditTier, creditScore }` |
| `INVALID_BORROW_WINDOW` | `BAD_REQUEST` | `{ reason, startTime, endTime }` |
| `WINDOW_NOT_AVAILABLE` | `CONFLICT` | `{ resourceKey, nextAvailableAt }` |
| `CANNOT_CANCEL` | `CONFLICT` | `{ reservationKey, usageKey, reason }` |
| `CANNOT_APPROVE_OWN_REQUEST` | `FORBIDDEN` | `{ reservationKey }` |
| `APPROVAL_NEEDS_SUPERVISOR` | `FORBIDDEN` | `{ reservationKey, route, tier }` |
| `ALREADY_AUTO_APPROVED` | `CONFLICT` | `{ reservationKey, status }` |

> **แก้แล้ว — เดิมข้อนี้เขียนว่า "ไม่มีรหัสเครดิตต่ำจนยืมไม่ได้ เพราะกฎแบบนั้นไม่มีในระบบ"**
>
> frontend ถูกเขียนตามกฎตรงข้าม: `CREDIT_BAND_POLICY` ใน
> `frontend/src/constants/index.ts` ให้ D3 เป็น `blocked: true` พร้อมคอมเมนต์
> *"D3 cannot open a new request until outstanding items are cleared"* และหน้าจอ
> คำขอถูกสร้างรอบกฎนี้ · ที่ประชุมตัดสินตาม frontend รหัส `CREDIT_TOO_LOW` จึงมีจริง
>
> สรุปกลไกที่ใช้อยู่ตอนนี้ **สามชั้น แยกกันคนละเรื่อง**:
>
> | ชั้น | ตอบคำถาม | ดูจาก |
> |---|---|---|
> | `Eligibility` × `Authority` | "ของชิ้นนี้เปิดให้คนสังกัดนี้บทบาทนี้ยืมไหม" | ไม่ดูเครดิตเลย |
> | `BorrowConstraints.MinimumAuthorityLevel` | "ระดับอำนาจถึงขั้นต่ำของกฎไหม" | ไม่ดูเครดิตเลย |
> | `CreditTier` | ① เปิดคำขอได้ไหม (D3 = ไม่ได้) ② ยืมได้กี่วัน ③ ต้องให้ใครอนุมัติ | คะแนนเครดิต |
>
> ทั้งหมดอยู่ที่ `backend/src/common/approval/approval-policy.ts` และ
> `backend/src/common/authority/eligibility.service.ts` ที่เดียว

---

## ส่วนที่ 2 · ตาราง procedure

คอลัมน์ **role** กับ **หมายเหตุ** คือสิ่งที่ทำให้ตารางนี้ต่างจากรายการ endpoint ธรรมดา
สิทธิ์การเข้าถึงเป็นส่วนหนึ่งของสัญญา และความถี่ polling เป็นข้อกำหนดที่ backend
ต้องออกแบบ query กับ index รองรับ

### `auth`

| procedure | ชนิด | input | output | role | หมายเหตุ |
|---|---|---|---|---|---|
| `auth.me` | query | - | `userOutput` | ล็อกอินแล้ว | ทุกหน้าใช้ · คืน `maxBorrowDays` มาให้แล้ว frontend ไม่ต้องคำนวณเอง |

### `item`

| procedure | ชนิด | input | output | role | หมายเหตุ |
|---|---|---|---|---|---|
| `item.list` | query | `paginationInput + { categoryId?, tier? }` | `paginated(itemSummaryOutput)` | ล็อกอินแล้ว | |
| `item.getById` | query | `{ itemId }` | `itemDetailOutput` | ล็อกอินแล้ว | |
| `item.availability` | query | `{ itemId }` | `{ available, nextAvailableAt }` | ล็อกอินแล้ว | **poll 10–15 วิ** · output ต้องเล็กที่สุด · ใช้ `context.realtime` แยกออกจาก batch |

### `loan`

| procedure | ชนิด | input | output | role | หมายเหตุ |
|---|---|---|---|---|---|
| `loan.list` | query | `listLoansInput` | `paginated(loanSummaryOutput)` | ล็อกอินแล้ว | invalidate หลังทุก action |
| `loan.getById` | query | `{ id }` | `loanOutput` | ล็อกอินแล้ว | |
| `loan.create` | mutation | `{ startTime, endTime, lines[] }` | `createRequestOutput` | ผู้ยืม | ✅ basket 1 บรรทัด = 1 `Reservations` · บรรทัดที่ไม่ผ่านคืนใน `rejected` ไม่ทำให้ทั้งตะกร้าล้ม · `CREDIT_TOO_LOW` · `NOT_ELIGIBLE` · `LOAN_PERIOD_EXCEEDS_LIMIT` · `WINDOW_NOT_AVAILABLE` |
| `loan.list` | query | `paginationInput + { tab? }` | `paginated(requestOutput)` | ผู้ยืม | ✅ คำขอของตัวเองเท่านั้น · `tab` = active / using / history |
| `loan.getById` | query | `{ reservationKey }` | `requestOutput` | ผู้ยืม | ✅ ของคนอื่นตอบ `RESERVATION_NOT_FOUND` ไม่ใช่ 403 |
| `loan.cancel` | mutation | `{ reservationKey, reason? }` | `requestOutput` | ผู้ยืม | ✅ ได้เฉพาะตอนยังไม่มีใครจัดของ · `CANNOT_CANCEL` · `ALREADY_DECIDED` |

### `approval`

คิวเดียวสองโต๊ะ แยกด้วย `route` ที่คำนวณจาก `approval-policy.ts` (ไม่เก็บลง DB):

| tier | เครดิต D0/D1 | เครดิต D2 | เครดิต D3 |
|---|---|---|---|
| T0 · T1 | **auto** ระบบอนุมัติเอง | supervisor | เปิดคำขอไม่ได้ (`CREDIT_TOO_LOW`) |
| T2 | supervisor | supervisor | เปิดคำขอไม่ได้ |
| T3 (ห้อง) | staff | staff | เปิดคำขอไม่ได้ |

| procedure | ชนิด | input | output | role | หมายเหตุ |
|---|---|---|---|---|---|
| `approval.queue` | query | `paginationInput + { route?, tier? }` | `paginated(approvalQueueRow)` | staff · supervisor | ✅ **poll 30–60 วิ** · เห็นเฉพาะแถวที่ตัวเองตัดสินได้และอยู่ในภาควิชาตัวเอง · แต่ละแถวบอก `clashesWith` ว่าถ้าอนุมัติจะไปยกเลิกใครบ้าง |
| `approval.counts` | query | — | `approvalCounts` | staff · supervisor | ✅ **poll 30–60 วิ** · 4 ตัวเลขสำหรับ dashboard |
| `approval.decide` | mutation | `{ reservationKey, decision, reason? }` | `decideApprovalOutput` | staff · supervisor | ✅ **อนุมัติแล้วยกเลิกคำขออื่นที่ชนหน้าต่างเวลา (รวม buffer) ใน transaction เดียว** · `CANNOT_APPROVE_OWN_REQUEST` · `APPROVAL_NEEDS_SUPERVISOR` · `ALREADY_AUTO_APPROVED` |

### ยังไม่ได้ทำ - ต้องเติมให้ครบ

`reservation.*` (สล็อตเวลาห้อง T3 — การ *จอง* ห้องทำผ่าน `loan.create` แล้ว
เหลือแต่ระบบสล็อต) · `appeal.*` · `notification.*` · `report.*`
ที่มา: *รายการเรียกใช้งานจาก Backend.pdf* กลุ่มที่ 1 (6 รายการ polling) และ
กลุ่มที่ 2 (9 read + 9 mutation)

---

## ส่วนที่ 3 · สิ่งที่ไม่ผ่าน tRPC

| งาน | ทำอย่างไร | ทำไม |
|---|---|---|
| อัปโหลดรูปตอนรับ/คืนของ | `image.requestUpload` (tRPC) → `PUT` ตรงไปที่ URL ชั่วคราว (`api-client.uploadFile`) → `loan.confirmPickup` (tRPC) | tRPC คุยกันด้วย JSON ส่ง binary ไม่ได้ |
| งาน cron รายวัน 7 งาน | ตัวจับเวลาฝั่ง backend | ไม่มี client เรียก |
