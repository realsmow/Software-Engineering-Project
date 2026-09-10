# 05. การจองและการอนุมัติ (Reservation & Approval)

ทุกคำขอในระบบใช้ชุดสถานะการอนุมัติเดียวกัน

## Reservations — ตารางเวลาการจองล่วงหน้า

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| ReservationKey | INT | PK |  |
| ResourceKey | INT | FK | ResourceInfo |
| ReservedBy | INT | FK | AccountInfo |
| Reason | VARCHAR |  |  |
| StartTime | DATETIME |  |  |
| EndTime | DATETIME |  |  |
| ApproveStatus | INT | FK | ApproveStatus |
| ApprovedBy | INT | FK | AccountInfo |
| ReservationExpire | DATETIME |  |  |
| ActionTime | DATETIME |  |  |
| ResolvedAt | DATETIME |  |  |

## ApproveStatus — สถานะการอนุมัติ (ใช้ร่วมกัน)

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| ApproveStatusKey | INT | PK |  |
| StatusName | VARCHAR |  |  |
