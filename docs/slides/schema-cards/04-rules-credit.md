# 04. กฎการยืมและเครดิต (Borrow Rules & Credit)

กฎถูกแยกออกจากข้อมูล ปรับค่าได้โดยไม่ต้องแก้โครงสร้าง · Eligibility เป็นตัวเชื่อมข้าม 3 กลุ่ม

## BorrowRule — หัวข้อรวมของกฎการยืม

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| BorrowRuleKey | INT | PK |  |
| BorrowRuleName | VARCHAR |  |  |

## BorrowConstraints — ข้อกำหนดการยืม แยกตามช่วงเครดิต

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| ConstraintsKey | INT | PK |  |
| BorrowRuleKey | INT | FK | BorrowRule |
| CreditTierKey | INT | FK | CreditTier |
| MinimumAuthorityLevel | INT |  |  |
| MaxBorrowDate | INT |  |  |
| MaxExtendTime | INT |  |  |

## CreditTier — การแบ่งช่วงคะแนนเครดิต

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| CreditTierKey | INT | PK |  |
| CreditTierName | VARCHAR |  |  |
| CreditMin | INT |  |  |
| CreditMax | INT |  |  |

## Eligibility — สิทธิ์การยืมข้ามคณะ / ชมรม

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| EliKey | INT | PK |  |
| ResourceKey | INT | FK | ResourceInfo |
| GroupKey | INT | FK | ManagementGroup |
| RoleKey | INT | FK | AuthorityRole |
