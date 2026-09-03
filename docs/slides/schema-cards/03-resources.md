# 03. ทรัพยากร: อุปกรณ์และห้อง (Resources — Equipment & Rooms)

ResourceInfo เป็นศูนย์กลาง ทำให้อุปกรณ์และห้องเดินบนกระบวนการเดียวกัน

## ItemInfo — ข้อมูลอุปกรณ์แต่ละประเภท

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| ItemKey | INT | PK |  |
| ItemName | VARCHAR |  |  |
| ItemDesc | TEXT |  |  |
| CreditWeight | FLOAT |  |  |

## ItemIndiv — อุปกรณ์แยกรายชิ้น

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| IndivKey | INT | PK |  |
| ResourceKey | INT | FK | ResourceInfo |
| ItemKey | INT | FK | ItemInfo |
| ItemID | VARCHAR |  |  |

## ResourceStatus — สถานะปัจจุบันของทรัพยากร

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| StatusKey | INT | PK |  |
| StatusName | VARCHAR |  |  |

## ResourceInfo — ตารางกลางของอุปกรณ์และห้อง

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| ResourceKey | INT | PK |  |
| ManagedBy | INT | FK | ManagementGroup |
| BorrowRule | INT | FK | BorrowRule |
| ConditionKey | INT | FK | ConditionLog |
| CurrentStatus | INT | FK | ResourceStatus |
| BufferTime | INT |  |  |
| AllowBorrow | BOOL |  |  |

## RoomInfo — ข้อมูลห้องและสถานที่

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| RoomKey | INT | PK |  |
| ResourceKey | INT | FK | ResourceInfo |
| RoomName | VARCHAR |  |  |
| RoomDesc | TEXT |  |  |
| RoomLocation | VARCHAR |  |  |
| CreditWeight | FLOAT |  |  |
