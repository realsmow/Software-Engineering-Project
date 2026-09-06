# 08. บทลงโทษและการอุทธรณ์ (Penalty & Appeal)

อุทธรณ์สำเร็จจะออกบทลงโทษใหม่ โดยเก็บของเดิมไว้เป็นหลักฐาน

## PenaltyRule — กฎการหักคะแนนเครดิต

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| PenaltyRuleKey | INT | PK |  |
| BorrowRuleKey | INT | FK | BorrowRule |
| PenaltyType | INT | FK | PenaltyType |
| PenaltyAmount | INT |  |  |
| PenaltyLength | INT |  |  |

## PenaltyInfo — การหักคะแนนที่เกิดขึ้นจริง

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| PenaltyKey | INT | PK |  |
| AccountKey | INT | FK | AccountInfo |
| UsageKey | INT | FK | UsageLog |
| Reason | VARCHAR |  |  |
| CreditDeducted | INT |  |  |
| ActionTime | DATETIME |  |  |
| ExpirationTime | DATETIME |  |  |
| Appealed | BOOL |  |  |
| InEffect | BOOL |  |  |

## AppealInfo — การขออุทธรณ์ผลการประเมิน

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| AppealKey | INT | PK |  |
| OriginalPenalty | INT | FK | PenaltyInfo |
| NewPenalty | INT | FK | PenaltyInfo |
| FiledBy | INT | FK | AccountInfo |
| ResolvedBy | INT | FK | AccountInfo |
| AppealReason | TEXT |  |  |
| ApproveStatus | INT | FK | ApproveStatus |
| ActionTime | DATETIME |  |  |
| ResolvedAt | DATETIME |  |  |

## PenaltyType — ประเภทสาเหตุการลงโทษ

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| PenaltyTypeKey | INT | PK |  |
| PenaltyType | VARCHAR |  |  |
