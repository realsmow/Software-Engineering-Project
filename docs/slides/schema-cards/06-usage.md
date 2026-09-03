# 06. การยืม–คืนและต่อเวลา (Usage & Extension)

UsageLog คือรอบการยืมหนึ่งรอบ ตั้งแต่ส่งมอบจนรับคืน

## UsageLog — บันทึกการส่งมอบและรับคืน

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| UsageKey | INT | PK |  |
| ReservationKey | INT | FK | Reservations |
| AccountKey | INT | FK | AccountInfo |
| ResourceKey | INT | FK | ResourceInfo |
| CurrentStatus | INT | FK | ResourceStatus |
| DueTime | DATETIME |  |  |
| PendingExtension | INT | FK | ExtensionRequest |
| CheckoutTime | DATETIME |  |  |
| CheckinTime | DATETIME |  |  |
| CheckoutCondition | INT | FK | ConditionLog |
| CheckinCondition | INT | FK | ConditionLog |

## ExtensionRequest — คำขอต่อเวลาการยืม

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| ExtensionKey | INT | PK |  |
| UsageKey | INT | FK | UsageLog |
| RequestedBy | INT | FK | AccountInfo |
| ExtendNo | INT |  |  |
| PreviousDueTime | DATETIME |  |  |
| RequestedDueTime | DATETIME |  |  |
| ApproveStatus | INT | FK | ApproveStatus |
| ApprovedBy | INT | FK | AccountInfo |
| ActionTime | DATETIME |  |  |
| ResolvedAt | DATETIME |  |  |
