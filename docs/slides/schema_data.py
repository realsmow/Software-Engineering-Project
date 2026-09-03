"""ULMs database schema v4 — ข้อมูลตารางทั้ง 33 ตาราง จัดกลุ่มตาม feature.

ต้นทาง: resource/DatabaseDesign4.pdf (ถอดความไว้แล้วใน sections/05_scope.tex §5.13)
ปลายทางของ FK ที่เอกสารต้นทางไม่ได้ระบุ ตรวจสอบกับ backend/prisma/schema.prisma
ซึ่งเป็น v4 ที่ migrate จริงแล้ว (migration 20260805125233_init)

โครงสร้าง field: (ชื่อฟิลด์, ชนิดข้อมูล, คีย์, ตารางปลายทางของ FK)
  คีย์ = "PK" | "FK" | ""   ·   ปลายทางเป็น None ถ้าไม่ใช่ FK
"""

# ---------------------------------------------------------------- ตารางทั้งหมด
# ชื่อตาราง -> (คำอธิบายสั้นภาษาไทย, [fields])
TABLES = {
    # ---- บัญชีผู้ใช้และสิทธิ์ ----
    "AccountInfo": ("ข้อมูลบัญชีผู้ใช้", [
        ("AccountKey",     "INT",     "PK", None),
        ("Email",          "VARCHAR", "",   None),
        ("HashedPassword", "VARCHAR", "",   None),
        ("UserID",         "VARCHAR", "",   None),
        ("UserFName",      "VARCHAR", "",   None),
        ("UserLName",      "VARCHAR", "",   None),
        ("UserCredit",     "INT",     "",   None),
        ("RoleKey",        "INT",     "FK", "RoleInfo"),
    ]),
    "RoleInfo": ("บทบาทระดับระบบ", [
        ("RoleKey",  "INT",     "PK", None),
        ("RoleName", "VARCHAR", "",   None),
    ]),
    "Authority": ("สิทธิ์ของผู้ใช้ในแต่ละกลุ่ม", [
        ("AuthorityKey",       "INT", "PK", None),
        ("AccountKey",         "INT", "FK", "AccountInfo"),
        ("ManagementGroupKey", "INT", "FK", "ManagementGroup"),
        ("AuthorityRoleKey",   "INT", "FK", "AuthorityRole"),
    ]),
    "AuthorityRole": ("ชื่อและระดับของสิทธิ์", [
        ("AuthorityRoleKey", "INT",     "PK", None),
        ("AuthorityName",    "VARCHAR", "",   None),
        ("AuthorityLevel",   "INT",     "",   None),
    ]),

    # ---- หน่วยงานผู้ให้ยืม ----
    "ManagementGroup": ("กลุ่มผู้มีอำนาจให้ยืม", [
        ("ManageGroupKey", "INT", "PK", None),
        ("GroupType",      "INT", "FK", "GroupType"),
    ]),
    "GroupType": ("ประเภทกลุ่ม (คณะ / ชมรม)", [
        ("GroupTypeKey",  "INT",     "PK", None),
        ("GroupTypeName", "VARCHAR", "",   None),
    ]),
    "FacultyInfo": ("ข้อมูลคณะ แยกตามสาขา", [
        ("FacultyKey",      "INT",     "PK", None),
        ("FacultyName",     "VARCHAR", "",   None),
        ("FacultyBranch",   "VARCHAR", "",   None),
        ("ManagementGroup", "INT",     "FK", "ManagementGroup"),
    ]),
    "ClubInfo": ("ข้อมูลชมรม", [
        ("ClubKey",            "INT",     "PK", None),
        ("ClubName",           "VARCHAR", "",   None),
        ("ManagementGroupKey", "INT",     "FK", "ManagementGroup"),
    ]),

    # ---- ทรัพยากร ----
    "ResourceInfo": ("ตารางกลางของอุปกรณ์และห้อง", [
        ("ResourceKey",   "INT",  "PK", None),
        ("ManagedBy",     "INT",  "FK", "ManagementGroup"),
        ("BorrowRule",    "INT",  "FK", "BorrowRule"),
        ("ConditionKey",  "INT",  "FK", "ConditionLog"),
        ("CurrentStatus", "INT",  "FK", "ResourceStatus"),
        ("BufferTime",    "INT",  "",   None),
        ("AllowBorrow",   "BOOL", "",   None),
    ]),
    "ResourceStatus": ("สถานะปัจจุบันของทรัพยากร", [
        ("StatusKey",  "INT",     "PK", None),
        ("StatusName", "VARCHAR", "",   None),
    ]),
    "ItemInfo": ("ข้อมูลอุปกรณ์แต่ละประเภท", [
        ("ItemKey",      "INT",     "PK", None),
        ("ItemName",     "VARCHAR", "",   None),
        ("ItemDesc",     "TEXT",    "",   None),
        ("CreditWeight", "FLOAT",   "",   None),
    ]),
    "ItemIndiv": ("อุปกรณ์แยกรายชิ้น", [
        ("IndivKey",    "INT",     "PK", None),
        ("ResourceKey", "INT",     "FK", "ResourceInfo"),
        ("ItemKey",     "INT",     "FK", "ItemInfo"),
        ("ItemID",      "VARCHAR", "",   None),
    ]),
    "RoomInfo": ("ข้อมูลห้องและสถานที่", [
        ("RoomKey",      "INT",     "PK", None),
        ("ResourceKey",  "INT",     "FK", "ResourceInfo"),
        ("RoomName",     "VARCHAR", "",   None),
        ("RoomDesc",     "TEXT",    "",   None),
        ("RoomLocation", "VARCHAR", "",   None),
        ("CreditWeight", "FLOAT",   "",   None),
    ]),

    # ---- กฎการยืมและเครดิต ----
    "BorrowRule": ("หัวข้อรวมของกฎการยืม", [
        ("BorrowRuleKey",  "INT",     "PK", None),
        ("BorrowRuleName", "VARCHAR", "",   None),
    ]),
    "BorrowConstraints": ("ข้อกำหนดการยืม แยกตามช่วงเครดิต", [
        ("ConstraintsKey",        "INT", "PK", None),
        ("BorrowRuleKey",         "INT", "FK", "BorrowRule"),
        ("CreditTierKey",         "INT", "FK", "CreditTier"),
        ("MinimumAuthorityLevel", "INT", "",   None),
        ("MaxBorrowDate",         "INT", "",   None),
        ("MaxExtendTime",         "INT", "",   None),
    ]),
    "CreditTier": ("การแบ่งช่วงคะแนนเครดิต", [
        ("CreditTierKey",  "INT",     "PK", None),
        ("CreditTierName", "VARCHAR", "",   None),
        ("CreditMin",      "INT",     "",   None),
        ("CreditMax",      "INT",     "",   None),
    ]),
    "Eligibility": ("สิทธิ์การยืมข้ามคณะ / ชมรม", [
        ("EliKey",      "INT", "PK", None),
        ("ResourceKey", "INT", "FK", "ResourceInfo"),
        ("GroupKey",    "INT", "FK", "ManagementGroup"),
        ("RoleKey",     "INT", "FK", "AuthorityRole"),
    ]),

    # ---- การจอง ----
    "Reservations": ("ตารางเวลาการจองล่วงหน้า", [
        ("ReservationKey",    "INT",      "PK", None),
        ("ResourceKey",       "INT",      "FK", "ResourceInfo"),
        ("ReservedBy",        "INT",      "FK", "AccountInfo"),
        ("Reason",            "VARCHAR",  "",   None),
        ("StartTime",         "DATETIME", "",   None),
        ("EndTime",           "DATETIME", "",   None),
        ("ApproveStatus",     "INT",      "FK", "ApproveStatus"),
        ("ApprovedBy",        "INT",      "FK", "AccountInfo"),
        ("ReservationExpire", "DATETIME", "",   None),
        ("ActionTime",        "DATETIME", "",   None),
        ("ResolvedAt",        "DATETIME", "",   None),
    ]),
    "ApproveStatus": ("สถานะการอนุมัติ (ใช้ร่วมกัน)", [
        ("ApproveStatusKey", "INT",     "PK", None),
        ("StatusName",       "VARCHAR", "",   None),
    ]),

    # ---- การใช้งาน ----
    "UsageLog": ("บันทึกการส่งมอบและรับคืน", [
        ("UsageKey",          "INT",      "PK", None),
        ("ReservationKey",    "INT",      "FK", "Reservations"),
        ("AccountKey",        "INT",      "FK", "AccountInfo"),
        ("ResourceKey",       "INT",      "FK", "ResourceInfo"),
        ("CurrentStatus",     "INT",      "FK", "ResourceStatus"),
        ("DueTime",           "DATETIME", "",   None),
        ("PendingExtension",  "INT",      "FK", "ExtensionRequest"),
        ("CheckoutTime",      "DATETIME", "",   None),
        ("CheckinTime",       "DATETIME", "",   None),
        ("CheckoutCondition", "INT",      "FK", "ConditionLog"),
        ("CheckinCondition",  "INT",      "FK", "ConditionLog"),
    ]),
    "ExtensionRequest": ("คำขอต่อเวลาการยืม", [
        ("ExtensionKey",     "INT",      "PK", None),
        ("UsageKey",         "INT",      "FK", "UsageLog"),
        ("RequestedBy",      "INT",      "FK", "AccountInfo"),
        ("ExtendNo",         "INT",      "",   None),
        ("PreviousDueTime",  "DATETIME", "",   None),
        ("RequestedDueTime", "DATETIME", "",   None),
        ("ApproveStatus",    "INT",      "FK", "ApproveStatus"),
        ("ApprovedBy",       "INT",      "FK", "AccountInfo"),
        ("ActionTime",       "DATETIME", "",   None),
        ("ResolvedAt",       "DATETIME", "",   None),
    ]),

    # ---- การตรวจสภาพ ----
    "Inspection": ("การตรวจสอบโดยเจ้าหน้าที่", [
        ("InspectionKey", "INT",      "PK", None),
        ("UsageKey",      "INT",      "FK", "UsageLog"),
        ("ResourceKey",   "INT",      "FK", "ResourceInfo"),
        ("InspectorKey",  "INT",      "FK", "AccountInfo"),
        ("ConditionKey",  "INT",      "FK", "ConditionLog"),
        ("AppealKey",     "INT",      "FK", "AppealInfo"),
        ("PenaltyKey",    "INT",      "FK", "PenaltyInfo"),
        ("ActionTime",    "DATETIME", "",   None),
        ("Notes",         "TEXT",     "",   None),
    ]),
    "ConditionLog": ("ประวัติสภาพของทรัพยากร", [
        ("ConditionKey", "INT",      "PK", None),
        ("ResourceKey",  "INT",      "FK", "ResourceInfo"),
        ("LoggedBy",     "INT",      "FK", "AccountInfo"),
        ("Condition",    "INT",      "FK", "ConditionType"),
        ("Notes",        "TEXT",     "",   None),
        ("LoggedAt",     "DATETIME", "",   None),
    ]),
    "ConditionType": ("ประเภทสภาพ (ปกติ / มีรอย / ชำรุด)", [
        ("ConditionTypeKey", "INT",     "PK", None),
        ("ConditionName",    "VARCHAR", "",   None),
    ]),
    "Image": ("รูปภาพประกอบการตรวจสอบ", [
        ("ImageKey",          "INT",     "PK", None),
        ("SubmittedBy",       "INT",     "FK", "AccountInfo"),
        ("UsageKey",          "INT",     "FK", "UsageLog"),
        ("ResourceKey",       "INT",     "FK", "ResourceInfo"),
        ("InspectionKey",     "INT",     "FK", "Inspection"),
        ("ImageURL",          "VARCHAR", "",   None),
        ("SubmissionTypeKey", "INT",     "FK", "ImageSubmissionType"),
    ]),
    "ImageSubmissionType": ("ประเภทของการส่งภาพ", [
        ("SubmissionTypeKey", "INT",     "PK", None),
        ("SubmissionType",    "VARCHAR", "",   None),
    ]),

    # ---- บทลงโทษและอุทธรณ์ ----
    "PenaltyInfo": ("การหักคะแนนที่เกิดขึ้นจริง", [
        ("PenaltyKey",     "INT",      "PK", None),
        ("AccountKey",     "INT",      "FK", "AccountInfo"),
        ("UsageKey",       "INT",      "FK", "UsageLog"),
        ("Reason",         "VARCHAR",  "",   None),
        ("CreditDeducted", "INT",      "",   None),
        ("ActionTime",     "DATETIME", "",   None),
        ("ExpirationTime", "DATETIME", "",   None),
        ("Appealed",       "BOOL",     "",   None),
        ("InEffect",       "BOOL",     "",   None),
    ]),
    "PenaltyRule": ("กฎการหักคะแนนเครดิต", [
        ("PenaltyRuleKey", "INT", "PK", None),
        ("BorrowRuleKey",  "INT", "FK", "BorrowRule"),
        ("PenaltyType",    "INT", "FK", "PenaltyType"),
        ("PenaltyAmount",  "INT", "",   None),
        ("PenaltyLength",  "INT", "",   None),
    ]),
    "PenaltyType": ("ประเภทสาเหตุการลงโทษ", [
        ("PenaltyTypeKey", "INT",     "PK", None),
        ("PenaltyType",    "VARCHAR", "",   None),
    ]),
    "AppealInfo": ("การขออุทธรณ์ผลการประเมิน", [
        ("AppealKey",       "INT",      "PK", None),
        ("OriginalPenalty", "INT",      "FK", "PenaltyInfo"),
        ("NewPenalty",      "INT",      "FK", "PenaltyInfo"),
        ("FiledBy",         "INT",      "FK", "AccountInfo"),
        ("ResolvedBy",      "INT",      "FK", "AccountInfo"),
        ("AppealReason",    "TEXT",     "",   None),
        ("ApproveStatus",   "INT",      "FK", "ApproveStatus"),
        ("ActionTime",      "DATETIME", "",   None),
        ("ResolvedAt",      "DATETIME", "",   None),
    ]),

    # ---- งานสนับสนุน ----
    "RepairLog": ("การซ่อมและช่วงที่งดให้บริการ", [
        ("RepairKey",             "INT",      "PK", None),
        ("ReservationKey",        "INT",      "FK", "Reservations"),
        ("RepairedBy",            "INT",      "FK", "AccountInfo"),
        ("ResourceKey",           "INT",      "FK", "ResourceInfo"),
        ("BeginRepairDate",       "DATETIME", "",   None),
        ("EndRepairDate",         "DATETIME", "",   None),
        ("ConditionBeforeRepair", "INT",      "FK", "ConditionLog"),
        ("ConditionAfterRepair",  "INT",      "FK", "ConditionLog"),
    ]),
    "Notification": ("การแจ้งเตือนที่ส่งถึงผู้ใช้", [
        ("NotificationKey",     "INT",      "PK", None),
        ("AccountKey",          "INT",      "FK", "AccountInfo"),
        ("NotificationType",    "INT",      "FK", "NotificationType"),
        ("NotificationContent", "TEXT",     "",   None),
        ("SentTime",            "DATETIME", "",   None),
        ("IsRead",              "BOOL",     "",   None),
    ]),
    "NotificationType": ("ประเภทของการแจ้งเตือน", [
        ("NotificationTypeKey",  "INT",     "PK", None),
        ("NotificationTypeName", "VARCHAR", "",   None),
    ]),
}

# ------------------------------------------------------ การจัดกลุ่มตาม feature
# แต่ละกลุ่ม = 1 สไลด์ ; "columns" คือการจัดวางการ์ดบนสไลด์ (คอลัมน์ซ้าย -> ขวา)
GROUPS = [
    {
        "id": "01-accounts",
        "map_order": ["AccountInfo", "Authority", "AuthorityRole", "RoleInfo"],   # ลำดับชิปบนแผนที่รวม (ฮับไว้บนสุด)
        "short": "บัญชีและสิทธิ์",   # ป้ายบนแผนที่รวม
        "slot": (0, 0),        # ช่อง (คอลัมน์, แถว) บนแผนที่รวม 4x3
        "th": "บัญชีผู้ใช้และสิทธิ์",
        "en": "Accounts & Authority",
        "note": "ผู้ใช้หนึ่งคนมีสิทธิ์ต่างระดับกันได้ในแต่ละหน่วยงาน",
        "accent": "#16726D",
        "columns": [["AccountInfo", "RoleInfo"], ["Authority", "AuthorityRole"]],
    },
    {
        "id": "02-org-units",
        "short": "หน่วยงานผู้ให้ยืม",   # ป้ายบนแผนที่รวม
        "slot": (1, 0),        # ช่อง (คอลัมน์, แถว) บนแผนที่รวม 4x3
        "th": "หน่วยงานผู้ให้ยืม",
        "en": "Lending Organizations",
        "note": "คณะและชมรมใช้กลไกสิทธิ์ชุดเดียวกันผ่าน ManagementGroup",
        "accent": "#1D5052",
        "columns": [["FacultyInfo", "ClubInfo"], ["ManagementGroup", "GroupType"]],
    },
    {
        "id": "03-resources",
        "map_order": ["ResourceInfo", "ItemIndiv", "RoomInfo", "ItemInfo", "ResourceStatus"],   # ลำดับชิปบนแผนที่รวม (ฮับไว้บนสุด)
        "short": "ทรัพยากร",   # ป้ายบนแผนที่รวม
        "slot": (2, 0),        # ช่อง (คอลัมน์, แถว) บนแผนที่รวม 4x3
        "th": "ทรัพยากร: อุปกรณ์และห้อง",
        "en": "Resources — Equipment & Rooms",
        "note": "ResourceInfo เป็นศูนย์กลาง ทำให้อุปกรณ์และห้องเดินบนกระบวนการเดียวกัน",
        "accent": "#077A5F",
        "columns": [["ItemInfo", "ItemIndiv", "ResourceStatus"], ["ResourceInfo", "RoomInfo"]],
    },
    {
        "id": "04-rules-credit",
        "short": "กฎและเครดิต",   # ป้ายบนแผนที่รวม
        "slot": (3, 0),        # ช่อง (คอลัมน์, แถว) บนแผนที่รวม 4x3
        "th": "กฎการยืมและเครดิต",
        "en": "Borrow Rules & Credit",
        # Eligibility ไม่มีเส้นเชื่อมในสไลด์นี้ เพราะ FK ทั้งสามเส้นชี้ออกนอกกลุ่ม
        # (ResourceInfo · ManagementGroup · AuthorityRole) และไม่มีตารางไหนชี้กลับมา
        # เป็น junction 3 ทางที่ไม่ได้สังกัดฟีเจอร์ใดฟีเจอร์เดียว จึงเขียนบอกไว้ในโน้ต
        "note": "กฎถูกแยกออกจากข้อมูล ปรับค่าได้โดยไม่ต้องแก้โครงสร้าง · "
                "Eligibility เป็นตัวเชื่อมข้าม 3 กลุ่ม",
        "accent": "#2A7A3E",
        "columns": [["BorrowRule", "BorrowConstraints"], ["CreditTier", "Eligibility"]],
    },
    {
        "id": "05-reservation",
        "short": "การจอง",   # ป้ายบนแผนที่รวม
        "slot": (0, 1),        # ช่อง (คอลัมน์, แถว) บนแผนที่รวม 4x3
        "th": "การจองและการอนุมัติ",
        "en": "Reservation & Approval",
        "note": "ทุกคำขอในระบบใช้ชุดสถานะการอนุมัติเดียวกัน",
        "accent": "#35827C",
        "columns": [["Reservations"], ["ApproveStatus"]],
    },
    {
        "id": "06-usage",
        "short": "ยืม–คืน",   # ป้ายบนแผนที่รวม
        "slot": (1, 1),        # ช่อง (คอลัมน์, แถว) บนแผนที่รวม 4x3
        "th": "การยืม–คืนและต่อเวลา",
        "en": "Usage & Extension",
        "note": "UsageLog คือรอบการยืมหนึ่งรอบ ตั้งแต่ส่งมอบจนรับคืน",
        "accent": "#0B6B6E",
        "columns": [["UsageLog"], ["ExtensionRequest"]],
    },
    {
        "id": "07-inspection",
        "map_order": ["ConditionLog", "Inspection", "Image", "ConditionType",
                      "ImageSubmissionType"],   # ลำดับชิปบนแผนที่รวม (ฮับไว้บนสุด)
        "short": "ตรวจสภาพ",   # ป้ายบนแผนที่รวม
        "slot": (2, 1),        # ช่อง (คอลัมน์, แถว) บนแผนที่รวม 4x3
        "th": "การตรวจสภาพและรูปภาพ",
        "en": "Inspection & Condition",
        "note": "ทุกการตรวจสอบเพิ่มระเบียนใหม่ ไม่ทับของเดิม จึงย้อนดูประวัติได้",
        "accent": "#5C7C4E",
        "columns": [["Inspection", "ConditionLog"],
                    ["Image", "ImageSubmissionType", "ConditionType"]],
    },
    {
        "id": "08-penalty-appeal",
        "short": "บทลงโทษ",   # ป้ายบนแผนที่รวม
        "slot": (3, 1),        # ช่อง (คอลัมน์, แถว) บนแผนที่รวม 4x3
        "th": "บทลงโทษและการอุทธรณ์",
        "en": "Penalty & Appeal",
        "note": "อุทธรณ์สำเร็จจะออกบทลงโทษใหม่ โดยเก็บของเดิมไว้เป็นหลักฐาน",
        "accent": "#AD4E0C",
        "columns": [["PenaltyRule", "PenaltyInfo"], ["AppealInfo", "PenaltyType"]],
    },
    {
        "id": "09-support",
        "short": "งานสนับสนุน",   # ป้ายบนแผนที่รวม
        "slot": (0, 2),        # ช่อง (คอลัมน์, แถว) บนแผนที่รวม 4x3
        "th": "งานสนับสนุน: ซ่อมบำรุงและแจ้งเตือน",
        "en": "Maintenance & Notification",
        "note": "การซ่อมจองช่วงเวลาของทรัพยากรด้วยกลไกเดียวกับการยืม",
        "accent": "#4A5D54",
        "columns": [["RepairLog"], ["Notification", "NotificationType"]],
    },
]
