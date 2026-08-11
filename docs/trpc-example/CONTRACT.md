# สัญญา tRPC ของ ULMs

> **ผลลัพธ์รวมของวาระ ว-05 ถึง ว-10** · ปลายทางจริง: `CONTRACT.md` ที่รากรีโป
>
> tRPC ไม่แถมหน้าเอกสาร API มาให้เหมือน OpenAPI สิ่งที่ทดแทนได้คือไฟล์นี้
> ซึ่งไม่ใช่งานเสียเปล่า เพราะใช้เป็นภาคผนวกของรายงานส่งอาจารย์ได้ด้วย
>
> **สถานะ: ร่าง** — เนื้อหาข้างล่างครอบคลุมเฉพาะ vertical slice ตัวอย่าง
> ต้องเติมให้ครบทั้ง 18 รายการจาก *รายการเรียกใช้งานจาก Backend.pdf*
> หลังที่ประชุมยืนยันข้อตกลงแล้ว

---

## ส่วนที่ 1 · ข้อตกลงร่วม

ทุก procedure ในตารางส่วนที่ 2 ยึดตามนี้ทั้งหมด ไม่มีข้อยกเว้น

| เรื่อง | ข้อตกลง | วาระ |
|---|---|---|
| การขนส่งสัญญา | **npm workspaces** — `autoSchemaFile` เขียนลง `packages/contract/src/generated/` ทั้งสองฝั่ง `import` จาก `@ulms/contract` ไม่มีขั้นตอนคัดลอก | ว-01 |
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
| `NOT_AUTHENTICATED` | `UNAUTHORIZED` | — |
| `ROLE_NOT_ALLOWED` | `FORBIDDEN` | — |
| `NOT_ELIGIBLE` | `FORBIDDEN` | `{ itemId }` |
| `ITEM_UNAVAILABLE` | `CONFLICT` | `{ itemId, nextAvailableAt }` |
| `SLOT_TAKEN` | `CONFLICT` | `{ roomId, startTime }` |
| `LOAN_PERIOD_EXCEEDS_LIMIT` | `BAD_REQUEST` | `{ maxDays, requestedDays, creditTier }` |
| `EXTENSION_QUOTA_EXCEEDED` | `FORBIDDEN` | `{ used, maxTimes }` |
| `ALREADY_DECIDED` | `CONFLICT` | `{ decidedAt }` |
| `APPEAL_WINDOW_CLOSED` | `FORBIDDEN` | `{ closedAt }` |

> **ไม่มีรหัส "เครดิตต่ำจนยืมไม่ได้" เพราะกฎแบบนั้นไม่มีในระบบ**
> เครดิตกำหนดแค่ *จำนวนวันยืมสูงสุด* ผ่าน `CreditTier` → `BorrowConstraints.MaxBorrowDate`
> สิ่งที่กันไม่ให้ยืมเป็นคนละกลไก คือตาราง `Eligibility` (สังกัด × บทบาท × ของ)
> และ `MinimumAuthorityLevel` ซึ่งไม่ดูคะแนนเครดิตเลย

---

## ส่วนที่ 2 · ตาราง procedure

คอลัมน์ **role** กับ **หมายเหตุ** คือสิ่งที่ทำให้ตารางนี้ต่างจากรายการ endpoint ธรรมดา
สิทธิ์การเข้าถึงเป็นส่วนหนึ่งของสัญญา และความถี่ polling เป็นข้อกำหนดที่ backend
ต้องออกแบบ query กับ index รองรับ

### `auth`

| procedure | ชนิด | input | output | role | หมายเหตุ |
|---|---|---|---|---|---|
| `auth.me` | query | — | `userOutput` | ล็อกอินแล้ว | ทุกหน้าใช้ · คืน `maxBorrowDays` มาให้แล้ว frontend ไม่ต้องคำนวณเอง |

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
| `loan.create` | mutation | `createLoanInput` | `loanOutput` | ผู้ยืม | `NOT_ELIGIBLE` · `ITEM_UNAVAILABLE` · `LOAN_PERIOD_EXCEEDS_LIMIT` · **ต้องคืน `dueAt` จริง** |
| `loan.cancel` | mutation | `{ id }` | `{ ok: true }` | ผู้ยืม | `ALREADY_DECIDED` |

### `approval`

| procedure | ชนิด | input | output | role | หมายเหตุ |
|---|---|---|---|---|---|
| `approval.queue` | query | `paginationInput` | `paginated(approvalItemOutput)` | อาจารย์ | **poll 30–60 วิ** · แบ่งหน้าเสมอ |
| `approval.decide` | mutation | `{ id, decision, reason? }` | `{ ok: true }` | อาจารย์ | `ALREADY_DECIDED` |

### ยังไม่ได้ทำ — ต้องเติมให้ครบ

`reservation.*` (จองห้อง T3) · `appeal.*` · `credit.*` · `inspection.*` ·
`notification.*` · `report.*` · `admin.*`
ที่มา: *รายการเรียกใช้งานจาก Backend.pdf* กลุ่มที่ 1 (6 รายการ polling) และ
กลุ่มที่ 2 (9 read + 9 mutation)

---

## ส่วนที่ 3 · สิ่งที่ไม่ผ่าน tRPC

| งาน | ทำอย่างไร | ทำไม |
|---|---|---|
| อัปโหลดรูปตอนรับ/คืนของ | `image.requestUpload` (tRPC) → `PUT` ตรงไปที่ URL ชั่วคราว (`api-client.uploadFile`) → `loan.confirmPickup` (tRPC) | tRPC คุยกันด้วย JSON ส่ง binary ไม่ได้ |
| งาน cron รายวัน 7 งาน | ตัวจับเวลาฝั่ง backend | ไม่มี client เรียก |
