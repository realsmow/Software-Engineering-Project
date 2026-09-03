# 09. งานสนับสนุน: ซ่อมบำรุงและแจ้งเตือน (Maintenance & Notification)

การซ่อมจองช่วงเวลาของทรัพยากรด้วยกลไกเดียวกับการยืม

## RepairLog — การซ่อมและช่วงที่งดให้บริการ

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| RepairKey | INT | PK |  |
| ReservationKey | INT | FK | Reservations |
| RepairedBy | INT | FK | AccountInfo |
| ResourceKey | INT | FK | ResourceInfo |
| BeginRepairDate | DATETIME |  |  |
| EndRepairDate | DATETIME |  |  |
| ConditionBeforeRepair | INT | FK | ConditionLog |
| ConditionAfterRepair | INT | FK | ConditionLog |

## Notification — การแจ้งเตือนที่ส่งถึงผู้ใช้

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| NotificationKey | INT | PK |  |
| AccountKey | INT | FK | AccountInfo |
| NotificationType | INT | FK | NotificationType |
| NotificationContent | TEXT |  |  |
| SentTime | DATETIME |  |  |
| IsRead | BOOL |  |  |

## NotificationType — ประเภทของการแจ้งเตือน

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| NotificationTypeKey | INT | PK |  |
| NotificationTypeName | VARCHAR |  |  |
