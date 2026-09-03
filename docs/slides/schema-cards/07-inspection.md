# 07. การตรวจสภาพและรูปภาพ (Inspection & Condition)

ทุกการตรวจสอบเพิ่มระเบียนใหม่ ไม่ทับของเดิม จึงย้อนดูประวัติได้

## Inspection — การตรวจสอบโดยเจ้าหน้าที่

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| InspectionKey | INT | PK |  |
| UsageKey | INT | FK | UsageLog |
| ResourceKey | INT | FK | ResourceInfo |
| InspectorKey | INT | FK | AccountInfo |
| ConditionKey | INT | FK | ConditionLog |
| AppealKey | INT | FK | AppealInfo |
| PenaltyKey | INT | FK | PenaltyInfo |
| ActionTime | DATETIME |  |  |
| Notes | TEXT |  |  |

## ConditionLog — ประวัติสภาพของทรัพยากร

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| ConditionKey | INT | PK |  |
| ResourceKey | INT | FK | ResourceInfo |
| LoggedBy | INT | FK | AccountInfo |
| Condition | INT | FK | ConditionType |
| Notes | TEXT |  |  |
| LoggedAt | DATETIME |  |  |

## Image — รูปภาพประกอบการตรวจสอบ

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| ImageKey | INT | PK |  |
| SubmittedBy | INT | FK | AccountInfo |
| UsageKey | INT | FK | UsageLog |
| ResourceKey | INT | FK | ResourceInfo |
| InspectionKey | INT | FK | Inspection |
| ImageURL | VARCHAR |  |  |
| SubmissionTypeKey | INT | FK | ImageSubmissionType |

## ImageSubmissionType — ประเภทของการส่งภาพ

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| SubmissionTypeKey | INT | PK |  |
| SubmissionType | VARCHAR |  |  |

## ConditionType — ประเภทสภาพ (ปกติ / มีรอย / ชำรุด)

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| ConditionTypeKey | INT | PK |  |
| ConditionName | VARCHAR |  |  |
