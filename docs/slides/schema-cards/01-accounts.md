# 01. บัญชีผู้ใช้และสิทธิ์ (Accounts & Authority)

ผู้ใช้หนึ่งคนมีสิทธิ์ต่างระดับกันได้ในแต่ละหน่วยงาน

## AccountInfo — ข้อมูลบัญชีผู้ใช้

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| AccountKey | INT | PK |  |
| Email | VARCHAR |  |  |
| HashedPassword | VARCHAR |  |  |
| UserID | VARCHAR |  |  |
| UserFName | VARCHAR |  |  |
| UserLName | VARCHAR |  |  |
| UserCredit | INT |  |  |
| RoleKey | INT | FK | RoleInfo |

## RoleInfo — บทบาทระดับระบบ

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| RoleKey | INT | PK |  |
| RoleName | VARCHAR |  |  |

## Authority — สิทธิ์ของผู้ใช้ในแต่ละกลุ่ม

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| AuthorityKey | INT | PK |  |
| AccountKey | INT | FK | AccountInfo |
| ManagementGroupKey | INT | FK | ManagementGroup |
| AuthorityRoleKey | INT | FK | AuthorityRole |

## AuthorityRole — ชื่อและระดับของสิทธิ์

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| AuthorityRoleKey | INT | PK |  |
| AuthorityName | VARCHAR |  |  |
| AuthorityLevel | INT |  |  |
