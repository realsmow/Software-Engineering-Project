# 02. หน่วยงานผู้ให้ยืม (Lending Organizations)

คณะและชมรมใช้กลไกสิทธิ์ชุดเดียวกันผ่าน ManagementGroup

## FacultyInfo — ข้อมูลคณะ แยกตามสาขา

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| FacultyKey | INT | PK |  |
| FacultyName | VARCHAR |  |  |
| FacultyBranch | VARCHAR |  |  |
| ManagementGroup | INT | FK | ManagementGroup |

## ClubInfo — ข้อมูลชมรม

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| ClubKey | INT | PK |  |
| ClubName | VARCHAR |  |  |
| ManagementGroupKey | INT | FK | ManagementGroup |

## ManagementGroup — กลุ่มผู้มีอำนาจให้ยืม

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| ManageGroupKey | INT | PK |  |
| GroupType | INT | FK | GroupType |

## GroupType — ประเภทกลุ่ม (คณะ / ชมรม)

| ฟิลด์ | ชนิดข้อมูล | คีย์ | อ้างอิง |
|---|---|---|---|
| GroupTypeKey | INT | PK |  |
| GroupTypeName | VARCHAR |  |  |
