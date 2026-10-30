-- Presentation data: replaces all equipment, rooms, loans and test/demo
-- accounts with a clean, realistic set. Run once:
--
--   psql '<External Database URL>' -v ON_ERROR_STOP=1 -f scripts/presentation-data.sql
--
-- Kept: admins, the real team accounts listed below, roles, borrow rules,
-- credit tiers, work hours and holidays. Everything else that people or
-- tests created is cleared first. New accounts sign in with the password of
-- demo.admin (the demo password), and so does test_admin from now on.
-- All of it runs in one transaction: an error changes nothing.

BEGIN;

-- One complete loan: request, pickup photo, and if it came back, the return
-- photo, inspection and any late or damage penalty. Returns the loan's key.
CREATE FUNCTION pg_temp.make_loan(
  p_res int, p_acc int, p_start timestamptz, p_due timestamptz,
  p_back timestamptz, p_cond text, p_inspect boolean,
  p_staff int, p_super int, p_t2 boolean, p_reason text, p_weight float
) RETURNS int LANGUAGE plpgsql AS $f$
DECLARE
  v_res int; v_cl int; v_cl2 int; v_usage int; v_insp int; v_pen int; v_days int; v_amount int;
  v_note text;
BEGIN
  INSERT INTO "Reservations" ("ResourceKey", "ReservedBy", "Reason", "StartTime", "EndTime", "ApproveStatus",
    "ApprovedBy", "AutoApproved", "ApprovedAt", "ReservationExpiration", "ActionTime", "ResolvedAt")
  VALUES (p_res, p_acc, p_reason, p_start, p_due, 'Approved',
    CASE WHEN p_t2 THEN p_super END, NOT p_t2,
    p_start - interval '1 day', p_start + interval '1 day', p_start - interval '1 day', p_back)
  RETURNING "ReservationKey" INTO v_res;
  INSERT INTO "ConditionLog" ("ResourceKey", "LoggedBy", "Condition", "LoggedAt")
  VALUES (p_res, p_staff, 'Normal', p_start - interval '30 minutes') RETURNING "ConditionKey" INTO v_cl;

  IF p_back IS NULL THEN
    INSERT INTO "UsageLog" ("ReservationKey", "AccountKey", "ResourceKey", "CurrentStatus", "DueTime", "CheckoutTime", "CheckoutCondition")
    VALUES (v_res, p_acc, p_res, 'Lended', p_due, p_start, v_cl) RETURNING "UsageKey" INTO v_usage;
    UPDATE "ResourceInfo" SET "ResourceStatus" = 'Lended', "ConditionKey" = v_cl WHERE "ResourceKey" = p_res;
  ELSE
    v_note := CASE p_cond WHEN 'Normal' THEN 'สภาพปกติ ครบชุด'
      WHEN 'MinorDamage' THEN 'มีรอยขีดข่วนที่ตัวเครื่อง ใช้งานได้ปกติ'
      ELSE 'ชิ้นส่วนแตกหัก ต้องส่งซ่อม' END;
    INSERT INTO "ConditionLog" ("ResourceKey", "LoggedBy", "Condition", "Notes", "LoggedAt")
    VALUES (p_res, p_staff, p_cond::"ConditionType", v_note, p_back + interval '1 hour') RETURNING "ConditionKey" INTO v_cl2;
    INSERT INTO "UsageLog" ("ReservationKey", "AccountKey", "ResourceKey", "CurrentStatus", "DueTime", "CheckoutTime",
      "CheckInTime", "CheckoutCondition", "CheckInCondition")
    VALUES (v_res, p_acc, p_res, CASE WHEN p_inspect THEN 'Inspected' ELSE 'Returned' END::"CurrentStatus",
      p_due, p_start, p_back, v_cl, CASE WHEN p_inspect THEN v_cl2 END)
    RETURNING "UsageKey" INTO v_usage;
    INSERT INTO "Images" ("SubmittedBy", "UsageKey", "ResourceKey", "ImageURL", "SubmissionType", "ActionTime")
    VALUES (p_staff, v_usage, p_res, '/media/inspection/demo/after.png', 'AfterPicture', p_back);

    IF p_back > p_due THEN
      v_days := ceil(extract(epoch FROM p_back - p_due) / 86400);
      v_amount := greatest(1, ceil(p_weight / 7 * v_days));
      INSERT INTO "PenaltyInfo" ("AccountKey", "UsageKey", "Reason", "CreditDeducted", "ActionTime", "ExpirationTime", "Appealed", "InEffect")
      VALUES (p_acc, v_usage, 'ReturnLate: overdue ' || v_days || 'd', v_amount, p_back, p_back + interval '14 days',
        false, p_back + interval '14 days' > now());
    END IF;

    IF p_inspect THEN
      IF p_cond <> 'Normal' THEN
        v_amount := ceil(p_weight * CASE WHEN p_cond = 'MinorDamage' THEN 1 ELSE 3 END);
        INSERT INTO "PenaltyInfo" ("AccountKey", "UsageKey", "Reason", "CreditDeducted", "ActionTime", "ExpirationTime", "Appealed", "InEffect")
        VALUES (p_acc, v_usage, 'DamagedItem: ' || v_note, v_amount, p_back + interval '1 hour', p_back + interval '30 days',
          false, p_back + interval '30 days' > now())
        RETURNING "PenaltyKey" INTO v_pen;
      END IF;
      INSERT INTO "Inspection" ("UsageKey", "ResourceKey", "InspectorKey", "ConditionKey", "PenaltyKey", "ActionTime", "Notes")
      VALUES (v_usage, p_res, p_staff, v_cl2, v_pen, p_back + interval '1 hour', v_note)
      RETURNING "InspectionKey" INTO v_insp;
      IF p_cond <> 'Normal' THEN
        INSERT INTO "Images" ("SubmittedBy", "UsageKey", "ResourceKey", "InspectionKey", "ImageURL", "SubmissionType", "ActionTime")
        VALUES (p_staff, v_usage, p_res, v_insp, '/media/inspection/demo/damage.png', 'InspectionPicture', p_back + interval '1 hour');
      END IF;
      UPDATE "ResourceInfo" SET "ConditionKey" = v_cl2,
        "AllowBorrow" = (p_cond <> 'MajorDamage') WHERE "ResourceKey" = p_res;
    END IF;
  END IF;

  INSERT INTO "Images" ("SubmittedBy", "UsageKey", "ResourceKey", "ImageURL", "SubmissionType", "ActionTime")
  VALUES (p_acc, v_usage, p_res, '/media/inspection/demo/before.png', 'BeforePicture', p_start - interval '10 minutes');
  RETURN v_usage;
END $f$;

-- The n-th unit of equipment type `p_item`, by asset tag.
CREATE FUNCTION pg_temp.unit(p_item int, p_n int) RETURNS int LANGUAGE sql AS $f$
  SELECT "ResourceKey" FROM "ItemIndiv" WHERE "ItemKey" = p_item ORDER BY "ItemID" OFFSET p_n - 1 LIMIT 1
$f$;

-- A Bangkok wall-clock time `p_days` from today.
CREATE FUNCTION pg_temp.bkk(p_days int, p_hour int) RETURNS timestamptz LANGUAGE sql AS $f$
  SELECT ((now() AT TIME ZONE 'Asia/Bangkok')::date + p_days + make_time(p_hour, 0, 0)) AT TIME ZONE 'Asia/Bangkok'
$f$;


DO $$
DECLARE
  v_hash text;
  v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_faculty int;
  v_cpe int; v_ee int; v_cs int;
  -- ส่วนกลาง: the faculty office, which runs every room
  v_central int;
  v_student_role int; v_staff_role int; v_super_role int;
  v_ar_student int; v_ar_staff int;
  v_t int[] := ARRAY[0, 0, 0, 0];
  v_t3 int;
  -- one staff member and one supervisor per department: CPE, EE, CS
  v_staffs int[] := '{}'; v_supers int[] := '{}';
  v_students int[] := '{}';
  v_item int; v_res int; v_acc int; v_res_key int; v_cl int; v_cl2 int; v_usage int;
  v_group int; v_tier int;
  v_start timestamptz; v_due timestamptz; v_back timestamptz;
  i int; j int; k int;
  -- name | description | credit weight | tier 0-2 | dept 1=cpe 2=ee 3=cs | prefix | units
  v_items text[][] := ARRAY[
    ['บอร์ด Arduino Uno R3 พร้อมชุดเซ็นเซอร์', 'บอร์ดไมโครคอนโทรลเลอร์ สาย USB และเซ็นเซอร์ 12 ชนิด', '2', '1', '1', 'CPE-ARD', '6'],
    ['ชุด Raspberry Pi 4 (4 GB) พร้อมจอ 7 นิ้ว', 'บอร์ด การ์ด 32 GB จอสัมผัส และพาวเวอร์ซัพพลาย', '2', '1', '1', 'CPE-RPI', '5'],
    ['บอร์ด ESP32 DevKit', 'บอร์ด Wi-Fi/Bluetooth พร้อมสาย USB-C', '1', '0', '1', 'CPE-ESP', '8'],
    ['ลอจิกแอนะไลเซอร์ 16 ช่อง', 'วิเคราะห์สัญญาณดิจิทัล I2C SPI UART', '3', '1', '1', 'CPE-LGA', '3'],
    ['บอร์ด FPGA Basys 3', 'Xilinx Artix-7 พร้อมสาย USB', '3', '2', '1', 'CPE-FPG', '4'],
    ['สถานีบัดกรีควบคุมอุณหภูมิ', 'หัวแร้ง ปรับ 200-480 °C พร้อมขาตั้งและฟองน้ำ', '1', '0', '1', 'CPE-SLD', '5'],
    ['ชุดเบรดบอร์ดและสายจัมเปอร์', 'เบรดบอร์ด 830 จุด และสายจัมเปอร์ 120 เส้น', '1', '0', '1', 'CPE-BRD', '10'],
    ['มัลติมิเตอร์ดิจิทัล Fluke 117', 'วัดแรงดัน กระแส ความต้านทาน พร้อมสายวัด', '2', '0', '2', 'EE-DMM', '6'],
    ['ออสซิลโลสโคปดิจิทัล 4 ช่อง 200 MHz', 'พร้อมโพรบ 4 เส้น', '4', '2', '2', 'EE-OSC', '3'],
    ['แหล่งจ่ายไฟ DC ปรับได้ 30 V 5 A', 'แหล่งจ่ายไฟสองช่อง พร้อมสายปากคีบ', '2', '1', '2', 'EE-PSU', '5'],
    ['เครื่องกำเนิดสัญญาณ (Function Generator)', 'ความถี่สูงสุด 25 MHz สองช่อง', '3', '2', '2', 'EE-FGN', '3'],
    ['แคลมป์มิเตอร์', 'วัดกระแส AC/DC ได้ถึง 600 A', '1', '0', '2', 'EE-CLP', '4'],
    ['LCR มิเตอร์', 'วัดค่าตัวเหนี่ยวนำ ตัวเก็บประจุ และความต้านทาน', '2', '1', '2', 'EE-LCR', '3'],
    ['โน้ตบุ๊ก ThinkPad T14', 'Core i7 RAM 16 GB พร้อมอะแดปเตอร์', '4', '2', '3', 'CS-NBK', '5'],
    ['iPad Air พร้อม Apple Pencil', 'จอ 10.9 นิ้ว 64 GB พร้อมเคส', '3', '1', '3', 'CS-IPD', '4'],
    ['แว่น VR Meta Quest 3', 'พร้อมคอนโทรลเลอร์และสายชาร์จ', '4', '2', '3', 'CS-VRH', '3'],
    ['กล้อง Mirrorless Sony a6400 พร้อมเลนส์', 'เลนส์ 18-135 มม. แบตเตอรี่ 2 ก้อน การ์ด 64 GB', '4', '2', '3', 'CS-CAM', '3'],
    ['โปรเจกเตอร์พกพา Full HD', 'ความสว่าง 3,000 ลูเมน สาย HDMI และรีโมต', '2', '1', '3', 'CS-PRJ', '3'],
    ['ชุดไมโครโฟนไร้สาย', 'ไมโครโฟน 2 ตัว พร้อมตัวรับสัญญาณ', '1', '1', '3', 'CS-MIC', '4'],
    ['ขาตั้งกล้องและไฟสตูดิโอ', 'ขาตั้ง 3 ขา และไฟ LED 2 ดวง', '1', '0', '3', 'CS-TRI', '4']
  ];
  -- Thai first name | Thai last name | login
  v_people text[][] := ARRAY[
    ['ณัฐวุฒิ', 'มีสุข', 'natthawut.m'], ['ปิยะนุช', 'แก้วงาม', 'piyanuch.k'],
    ['ธนกร', 'วงศ์ใหญ่', 'thanakorn.w'], ['กมลชนก', 'ทองดี', 'kamonchanok.t'],
    ['อนันต์', 'สุขสวัสดิ์', 'anan.s'], ['กิตติพงษ์', 'บุญมา', 'kittipong.b'],
    ['ศิริพร', 'แสงทอง', 'siriporn.s'], ['ภัทรา', 'จันทร์เพ็ญ', 'phattra.c'],
    ['วรเมธ', 'ศรีวงศ์', 'woramet.s'], ['ชนิดา', 'พรหมมา', 'chanida.p'],
    ['ธีรวัฒน์', 'ทองคำ', 'teerawat.t'], ['พิมพ์ชนก', 'วัฒนากุล', 'pimchanok.w'],
    ['ณัฐธิดา', 'อินทร์แก้ว', 'natthida.i'], ['ปกรณ์', 'ปัญญาดี', 'pakorn.p'],
    ['สุภาวดี', 'เรืองศรี', 'supawadee.r'], ['จิรายุ', 'มณีรัตน์', 'jirayu.m'],
    ['ธนวัฒน์', 'สมบูรณ์', 'thanawat.s'], ['อรอุมา', 'ชัยมงคล', 'onuma.c'],
    ['ศุภกร', 'รักษาวงศ์', 'supakorn.r'], ['วริศรา', 'นาคประเสริฐ', 'warisara.n']
  ];
  -- staff CPE, EE, CS, then supervisors CPE, EE, CS
  v_lab text[][] := ARRAY[
    ['สมศักดิ์', 'ใจดี', 'somsak.j'], ['ประภาพร', 'ศรีสวัสดิ์', 'prapaporn.s'], ['ณัฐพงศ์', 'คงมั่น', 'nattapong.k'],
    ['ผศ.ดร.วิภาวรรณ', 'ศรีสุข', 'wipawan.s'], ['รศ.ดร.ธนากร', 'อินทรวงศ์', 'thanakorn.i'], ['ผศ.ดร.สุดารัตน์', 'พูลผล', 'sudarat.p']
  ];
  v_reasons text[] := ARRAY['โปรเจกต์วิชาปฏิบัติการ', 'ทำการบ้านแล็บ', 'เตรียมนำเสนองานกลุ่ม',
    'ทดลองต้นแบบโปรเจกต์จบ', 'ถ่ายทำวิดีโอประกอบรายวิชา', 'ใช้ในกิจกรรมชมรม', 'ฝึกใช้งานก่อนสอบปฏิบัติ'];
BEGIN
  -- The demo password, taken before the demo accounts go.
  SELECT "HashedPassword" INTO v_hash FROM "AccountInfo" WHERE "UserID" = 'demo.admin';
  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'demo.admin not found: its password is the one the new accounts use';
  END IF;

  -- 1. Clear everything people and tests made.
  TRUNCATE "Images", "Inspection", "AppealInfo", "PenaltyInfo", "ExtensionRequest",
    "RepairLog", "RetirementRequest", "RoomCheckRound", "UsageLog", "ConditionLog",
    "Reservations", "RequestCart", "Eligibility", "ItemIndiv", "RoomInfo",
    "ResourceInfo", "ItemInfo", "Notification", "AuditLog", "MediaFile",
    "Authority", "SessionInfo", "EmailVerification", "PasswordReset", "CronRunLog"
    RESTART IDENTITY;

  DELETE FROM "AccountInfo" a
  USING "RoleInfo" r
  WHERE r."RoleKey" = a."RoleKey"
    AND lower(trim(r."RoleName")) <> 'admin'
    AND lower(a."Email") NOT IN ('ratchapol.san@ku.th', 'veerasak.th@ku.th', 'punyawat.cha@ku.th',
      'chakapat.c@ku.th', 'jirawat.somro@ku.th', 'kawinphop.j@ku.th');
  UPDATE "AccountInfo" SET "HashedPassword" = v_hash WHERE "UserID" = 'test_admin';

  DELETE FROM "BranchInfo" WHERE "BranchName" NOT IN ('ภาควิชาวิศวกรรมคอมพิวเตอร์',
    'ภาควิชาวิศวกรรมไฟฟ้า', 'ภาควิชาวิทยาการคอมพิวเตอร์', 'ภาควิชาวิศวกรรมเครื่องกล', 'ส่วนกลาง');
  DELETE FROM "ClubInfo";
  DELETE FROM "ManagementGroup" g WHERE NOT EXISTS (
    SELECT 1 FROM "BranchInfo" b WHERE b."ManageGroupKey" = g."ManageGroupKey");
  DELETE FROM "SystemSetting" WHERE "Key" IN ('demoSeed', 'openDays');

  -- 2. Departments, roles and rules the data hangs off.
  SELECT "FacultyKey" INTO v_faculty FROM "FacultyInfo" WHERE "FacultyName" = 'คณะวิศวกรรมศาสตร์' LIMIT 1;
  IF v_faculty IS NULL THEN
    INSERT INTO "FacultyInfo" ("FacultyName") VALUES ('คณะวิศวกรรมศาสตร์') RETURNING "FacultyKey" INTO v_faculty;
  END IF;
  FOR i IN 1..4 LOOP
    SELECT "ManageGroupKey" INTO v_group FROM "BranchInfo" WHERE "BranchName" =
      (ARRAY['ภาควิชาวิศวกรรมคอมพิวเตอร์', 'ภาควิชาวิศวกรรมไฟฟ้า', 'ภาควิชาวิทยาการคอมพิวเตอร์', 'ส่วนกลาง'])[i] LIMIT 1;
    IF v_group IS NULL THEN
      INSERT INTO "ManagementGroup" ("GroupType") VALUES ('Faculty') RETURNING "ManageGroupKey" INTO v_group;
      INSERT INTO "BranchInfo" ("BranchName", "FacultyKey", "ManageGroupKey") VALUES
        ((ARRAY['ภาควิชาวิศวกรรมคอมพิวเตอร์', 'ภาควิชาวิศวกรรมไฟฟ้า', 'ภาควิชาวิทยาการคอมพิวเตอร์', 'ส่วนกลาง'])[i], v_faculty, v_group);
    END IF;
    IF i = 1 THEN v_cpe := v_group; ELSIF i = 2 THEN v_ee := v_group; ELSIF i = 3 THEN v_cs := v_group; ELSE v_central := v_group; END IF;
    v_group := NULL;
  END LOOP;

  SELECT "RoleKey" INTO v_student_role FROM "RoleInfo" WHERE lower(trim("RoleName")) IN ('student', 'borrower') LIMIT 1;
  SELECT "RoleKey" INTO v_staff_role FROM "RoleInfo" WHERE lower(trim("RoleName")) = 'staff' LIMIT 1;
  SELECT "RoleKey" INTO v_super_role FROM "RoleInfo" WHERE lower(trim("RoleName")) IN ('supervisor', 'professor') LIMIT 1;

  SELECT "AuthorityRoleKey" INTO v_ar_student FROM "AuthorityRole" WHERE "AuthorityName" = 'Student' LIMIT 1;
  IF v_ar_student IS NULL THEN
    INSERT INTO "AuthorityRole" ("AuthorityName", "AuthorityLevel") VALUES ('Student', 0) RETURNING "AuthorityRoleKey" INTO v_ar_student;
  END IF;
  SELECT "AuthorityRoleKey" INTO v_ar_staff FROM "AuthorityRole" WHERE "AuthorityName" = 'Lab staff' LIMIT 1;
  IF v_ar_staff IS NULL THEN
    INSERT INTO "AuthorityRole" ("AuthorityName", "AuthorityLevel") VALUES ('Lab staff', 2) RETURNING "AuthorityRoleKey" INTO v_ar_staff;
  END IF;

  FOR i IN 0..3 LOOP
    SELECT "BorrowRuleKey" INTO v_tier FROM "BorrowRule" WHERE upper(trim("RuleName")) = 'T' || i LIMIT 1;
    IF v_tier IS NULL THEN RAISE EXCEPTION 'Borrow rule T% is missing', i; END IF;
    v_t[i + 1] := v_tier;
  END LOOP;

  -- 3. People. Each belongs to one department; one student is in two.
  FOR i IN 1..6 LOOP
    INSERT INTO "AccountInfo" ("Email", "HashedPassword", "UserID", "UserFName", "UserLName", "UserCredit", "RoleKey", "FacultyKey")
    VALUES (v_lab[i][3] || '@ku.th', v_hash, v_lab[i][3], v_lab[i][1], v_lab[i][2], 100,
      CASE WHEN i <= 3 THEN v_staff_role ELSE v_super_role END, v_faculty)
    RETURNING "AccountKey" INTO v_acc;
    IF i <= 3 THEN v_staffs := v_staffs || v_acc; ELSE v_supers := v_supers || v_acc; END IF;
  END LOOP;

  FOR i IN 1..20 LOOP
    INSERT INTO "AccountInfo" ("Email", "HashedPassword", "UserID", "UserFName", "UserLName", "UserCredit", "RoleKey", "FacultyKey")
    VALUES (v_people[i][3] || '@ku.th', v_hash, v_people[i][3], v_people[i][1], v_people[i][2], 100, v_student_role, v_faculty)
    RETURNING "AccountKey" INTO v_acc;
    v_students := v_students || v_acc;
  END LOOP;

  -- Students take turns CPE, EE, CS; staff and supervisors by their slot;
  -- kept accounts (admins, team) in CPE. Student 7 is also in CS.
  INSERT INTO "Authority" ("AccountKey", "ManageGroupKey", "AuthorityRoleKey")
  SELECT a."AccountKey",
    CASE WHEN s.n IS NOT NULL THEN (ARRAY[v_cpe, v_ee, v_cs])[1 + (s.n - 1) % 3]
         WHEN l.n IS NOT NULL THEN (ARRAY[v_cpe, v_ee, v_cs])[1 + (l.n - 1) % 3]
         ELSE v_cpe END,
    CASE WHEN lower(trim(r."RoleName")) IN ('student', 'borrower') THEN v_ar_student ELSE v_ar_staff END
  FROM "AccountInfo" a
  JOIN "RoleInfo" r ON r."RoleKey" = a."RoleKey"
  LEFT JOIN unnest(v_students) WITH ORDINALITY s(k, n) ON s.k = a."AccountKey"
  LEFT JOIN unnest(v_staffs || v_supers) WITH ORDINALITY l(k, n) ON l.k = a."AccountKey";
  INSERT INTO "Authority" ("AccountKey", "ManageGroupKey", "AuthorityRoleKey")
  VALUES (v_students[7], v_cs, v_ar_student);

  -- The rooms' own staff member, in ส่วนกลาง only.
  INSERT INTO "AccountInfo" ("Email", "HashedPassword", "UserID", "UserFName", "UserLName", "UserCredit", "RoleKey", "FacultyKey")
  VALUES ('kanokwan.p@ku.th', v_hash, 'kanokwan.p', 'กนกวรรณ', 'พรมดี', 100, v_staff_role, v_faculty)
  RETURNING "AccountKey" INTO v_acc;
  INSERT INTO "Authority" ("AccountKey", "ManageGroupKey", "AuthorityRoleKey")
  VALUES (v_acc, v_central, v_ar_staff);

  -- 4. Equipment: 20 types, each with its units, open to students and staff.
  FOR i IN 1..array_length(v_items, 1) LOOP
    INSERT INTO "ItemInfo" ("ItemName", "ItemDesc", "CreditWeight")
    VALUES (v_items[i][1], v_items[i][2], v_items[i][3]::float)
    RETURNING "ItemKey" INTO v_item;
    v_group := CASE v_items[i][5] WHEN '1' THEN v_cpe WHEN '2' THEN v_ee ELSE v_cs END;
    FOR j IN 1..v_items[i][7]::int LOOP
      INSERT INTO "ResourceInfo" ("ManagedBy", "BorrowRule", "ResourceStatus", "ResourceType", "BufferTime", "AllowBorrow")
      VALUES (v_group, v_t[v_items[i][4]::int + 1], 'InStorage', 'Item', 0, true)
      RETURNING "ResourceKey" INTO v_res;
      INSERT INTO "ItemIndiv" ("ResourceKey", "ItemKey", "ItemID")
      VALUES (v_res, v_item, v_items[i][6] || '-' || lpad(j::text, 3, '0'));
      INSERT INTO "Eligibility" ("ResourceKey", "GroupKey", "RoleKey")
      SELECT v_res, g, ar FROM unnest(ARRAY[v_cpe, v_ee, v_cs]) g, unnest(ARRAY[v_ar_student, v_ar_staff]) ar;
    END LOOP;
  END LOOP;

  -- 5. Rooms E11-301 to E11-903: floors 3-9, three rooms each.
  FOR i IN 3..9 LOOP
    FOR j IN 1..3 LOOP
      v_group := v_central;
      INSERT INTO "ResourceInfo" ("ManagedBy", "BorrowRule", "ResourceStatus", "ResourceType", "BufferTime", "AllowBorrow")
      VALUES (v_group, v_t[4], 'InStorage', 'Room', 0, true)
      RETURNING "ResourceKey" INTO v_res;
      INSERT INTO "RoomInfo" ("ResourceKey", "RoomName", "RoomDesc", "RoomLocation", "CreditWeight", "Capacity", "OpenTime", "CloseTime", "BreakStart", "BreakEnd")
      VALUES (v_res, 'E11-' || i || '0' || j,
        (ARRAY['ห้องบรรยาย', 'ห้องปฏิบัติการคอมพิวเตอร์', 'ห้องประชุมกลุ่มย่อย'])[j],
        'อาคาร 11 (E11) ชั้น ' || i, 0, (ARRAY[60, 40, 12])[j], 480, 1020, 720, 780);
      INSERT INTO "Eligibility" ("ResourceKey", "GroupKey", "RoleKey")
      SELECT v_res, g, ar FROM unnest(ARRAY[v_cpe, v_ee, v_cs]) g, unnest(ARRAY[v_ar_student, v_ar_staff]) ar;
    END LOOP;
  END LOOP;

  -- 6. Placeholder photos for every pickup, return and damage record.
  INSERT INTO "MediaFile" ("Key", "ContentType", "Bytes") VALUES
    ('inspection/demo/before.png', 'image/png', decode('iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAAMW0lEQVR42u3dWXLsNgyFYa0oa8mGsr472neep8zZRm65ZbdapkiQBEnA/KvwbPvlq3ZLwDnLp/9+JOfjxXxf51+d+XAx39b5R23en+frOn+rzbvzfDnPXzrz9mI+r/Onzry5mE/r/KEzry/m4zq/68yri/mwzg+deXkx79f5rjMvLubdOt+qZkEvetHrVG8aMHrRi16zehOA0Yte9FrWGwOMXvSi17je6yPA6EUveu3rDQNGL3rR60JvADB60YteL3r3gNGLXvQ60nv97e2CXvSi16neM2D0ohe97vSugNGLXvR61Hv99e2CXvSi16neHWD0ohe9nvRuAaMXveh1pvcOMHrRi15/ek+A0Yte9LrUuwGMXvSi15veW8DoRS96Heq9AYxe9KLXp141wOhFL3r769UBjF70oneIXgXA6EUvekfprQWMXvSid6DeKsDoRS96x+otB4xe9KJ3uN5CwOhFL3ot6C0BjF70oteI3mzA6EUveu3ozQOMXvSi15TeDMDoRS96remVAkYvetFrUK8IMHrRi16betOA0Yte9JrVmwCMXvSi17LeGGD0ohe9xvUeAkYvetFrX+9VEDB60YteF3oDgNGLXvR60bsHjF70oteR3quvbxb0ohe9TvWeAaMXveh1p3cFjF70otej3qsvbxb0ohe9TvXuAKMXvej1pHcLGL3oRa8zvXeA0Yte9PrTewKMXvSi16XeDWD0ohe93vTeAkYvetHrUO8NYPSiF70+9WoCRi960dtZrxpg9KIXvf316gBGL3rRO0SvAmD0ohe9o/TWAkYvetE7UG8VYPSiF71j9ZYDRi960TtcbyFg9KIXvRb0lgBGL3rRa0RvNmD0ohe9dvTmAUYvetFrSm8GYPSiF73W9EoBoxe96DWoVwQYvehFr029acDoRS96zepNAEYvetFrWW8MMHrRi17jep8fAUYvetFrX28YMHrRi14XegOA0Yte9HrR+/zL6wW96EWvU70XgNGLXvT60nsGjF70oted3hUwetGLXo96n39+vaAXveh1qncLGL3oRa8zvXeA0WtL7y+//dpu0Ptg9J4Ao9fcZ681wOi1qXcDGL2W/nM2BRi9ZvXeAkavse+9dgCj17LeG8DotffUautN5alVGWD0GterCRi9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L3rRa0FvCWD0ohe9RvRmA0YvetFrR28eYPSiF72m9GYARi960WtNrxQwetGLXoN6RYDRi1702tSbBoxe9KLXrN4EYPSiF72W9cYAoxe96DWu9/ERYPSiF7329YYBoxe96HWhNwAYvehFrxe9e8DoRS96Hel9/OF6QS960etU7xkwetGLXnd6V8DoRS96Pep9/P56QS960etU7w4wetGLXk96t4DRi170OtN7Bxi96EWvP70nwOhFL3pd6t0ARi960etN7y1g9KIXvQ713gBGL3rR61OvGmD0ohe9/fXqAEYvetE7RK8CYPSiF72j9NYCRi960TtQbxVg9KIXvWP1lgNGL3rRO1xvIWD0ohe9FvSWAEYvetFrRG82YPSiF7129OYBRi960WtKbwZg9KIXvdb0SgGjF73oNahXBBi96EWvTb1pwOhFL3rN6k0ARi960WtZbwwwetGLXuN6Hx0BRi960WtfbxgwetGLXhd6A4DRi170etG7B4xe9KLXkd5H768W9KIXvU71ngGjF73odad3BYxe9KLXo95H764W9KIXvU717gCjF73o9aR3Cxi96EWvM713gNGLXvT603sCjF70otel3g1g9KIXvd703gJGL3rR61DvDWD0ohe9PvWqAUYvetHbX68OYPSiF71D9P6c/wHfRkeLPfGmYAAAAABJRU5ErkJggg==', 'base64')),
    ('inspection/demo/after.png', 'image/png', decode('iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAAMhklEQVR42u3dW3bcxhUFUA4qU8rMMhjLDz0sS5Ydy+8kznMMMckW1Y1GAVWoKnRdY691v0n+7NVs4N5z7r795X/J+Xk630znv9vnp+m8m85/ts+P0/l6Ov+umh8u5u10/lU131/Mm+n8s2reX8xX0/mtar67mNfT+UfV/HU6X07n79vn2+m8ms7fts8303k5nV83zx299NIbVO/LdynA9NJL7/B6E4DppZfeCHrnANNLL71B9F4BppdeeuPovQRML730htJ7BpheeumNpvfFCTC99NIbUO8DYHrppTem3hnA9NJLbxS9U8D00ktvIL0XgOmll95Yel+8++WOXnrpDar3BJheeumNqPceML300htU7zVgeumlN4zeCWB66aU3kt5zwPTSS28wvU+A6aWX3nh6HwHTSy+9IfXWAaaXXnpvqrcCML300ntrvVsB00svvQPo3QSYXnrpHUNvOWB66aV3GL2FgOmll96R9JYAppdeegfTmw2YXnrpHU9vHmB66aV3SL0ZgOmll95R9a4BppdeegfWuwiYXnrpHVvvi69TgOmll97h9SYA00svvRH0zgGml156g+i9AkwvvfTG0XsJmF566Q2l9wwwvfTSG03v8xNgeumlN6DeB8D00ktvTL0zgOmll94oeqeA6aWX3kB6LwDTSy+9sfQ+//rnO3rppTeo3hNgeumlN6Lee8D00ktvUL3XgOmll94weieA6aWX3kh6zwHTSy+9wfQ+AaaXXnrj6X0ETC+99IbUWweYXnrpvaneCsD00kvvrfVuBUwvvfQOoHcTYHrppXcMveWA6aWX3mH0FgKml156R9JbApheeukdTG82YHrppXc8vXmA6aWX3iH1ZgCml156R9W7BpheeukdWO8iYHrppXdsvWnA9NJL7/B6n7+dBUwvvfRG0DsHmF566Q2i9wowvfTSG0fvJWB66aU3lN4zwPTSS280vV+cANNLL70B9T4AppdeemPqnQFML730RtE7BUwvvfQG0nsBmF566Y2l94u3P93RSy+9QfWeANNLL70R9d4DpndAvX/681/6Db1/GL3XgOkd4rN3FMD0jq13ApjeUf5zHgIwvcPrPQdM70Dfe28PmN4Iep8A0zvWU6tzb02eWpUBpjeI3kfA9A73zHkF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l96QeqsB00svvbfTWweYXnrpvaneCsD00kvvrfVuBUwvvfQOoHcTYHrppXcMveWA6aWX3mH0FgKml156R9JbApheeukdTG82YHrppXc8vXmA6aWX3iH1ZgCml156R9W7BpheeukdWO8iYHrppXdsvZ9+mQJML730Dq83AZheeumNoHcOML300htE7xVgeumlN47eS8D00ktvKL1ngOmll95oep+dANNLL70B9T4AppdeemPqnQKml156A+m9AEwvvfTG0vsRML300htO77Mv39/RSy+9QfXeA6aXXnqD6r0GTC+99IbROwFML730RtJ7DpheeukNpvcJML300htP7yNgeumlN6TeasD00kvv7fTWAaaXXnpvqrcCML300ntrvVsB00svvQPo3QSYXnrpHUNvOWB66aV3GL2FgOmll96R9JYAppdeegfTmw2YXnrpHU9vHmB66aV3SL0ZgOmll95R9a4BppdeegfWuwiYXnrpHVvvs1cpwPTSS+/wehOA6aWX3gh65wDTSy+9QfReAaaXXnrj6L0ETC+99IbSewaYXnrpjab3kxNgeumlN6DeB8D00ktvTL0zgOmll94oeqeA6aWX3kB6LwDTSy+9sfR+8uq7O3rppTeo3hNgeumlN6Lee8D00ktvUL3XgOmll94weieA6aWX3kh6zwHTSy+9wfQ+AaaXXnrj6X0ETC+99IbUWweYXnrpvane3+f/h1x+uzG9y6kAAAAASUVORK5CYII=', 'base64')),
    ('inspection/demo/damage.png', 'image/png', decode('iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAAMZElEQVR42u3d2XLcNhCFYT5J3jRv56zOvtiJndW7s28PEJeG0nAoEGgADaBb+Kv6WtLNV6Mhu89Z/nv5IDn/XszX67zQmX8u5qt1nqvN3+f5cp1navPXeb44z1Od+fNiPl/nic78cTGfrfOzzvx+MZ+u85PO/HYxn6zzo878ejEfr/ODzvxyMR+t833VLOhFL3qd6k0DRi960WtWbwIwetGLXst6Y4DRi170Gtf7+ggwetGLXvt6w4DRi170utAbAIxe9KLXi949YPSiF72O9L7+/v6CXvSi16neM2D0ohe97vSugNGLXvR61Pv6u/sLetGLXqd6d4DRi170etK7BYxe9KLXmd4bwOhFL3r96T0BRi960etS7wYwetGLXm96rwGjF73odaj3CjB60Yten3rVAKMXvejtr1cHMHrRi94hehUAoxe96B2ltxYwetGL3oF6qwCjF73oHau3HDB60Yve4XoLAaMXvei1oLcEMHrRi14jerMBoxe96LWjNw8wetGLXlN6MwCjF73otaZXChi96EWvQb0iwOhFL3pt6k0DRi960WtWbwIwetGLXst6Y4DRi170Gtd7CBi96EWvfb2vgoDRi170utAbAIxe9KLXi949YPSiF72O9L767sMFvehFr1O9Z8DoRS963eldAaMXvej1qPfV4w8X9KIXvU717gCjF73o9aR3Cxi96EWvM703gNGLXvT603sCjF70otel3g1g9KIXvd70XgNGL3rR61DvFWD0ohe9PvVqAkYvetHbWa8aYPSiF7399eoARi960TtErwJg9KIXvaP01gJGL3rRO1BvFWD0ohe9Y/WWA0YvetE7XG8hYPSiF70W9JYARi960WtEbzZg9KIXvXb05gFGL3rRa0pvBmD0ohe91vRKAaMXveg1qFcEGL3oRa9NvWnA6EUves3qTQBGL3rRa1lvDDB60Yte43pfHgFGL3rRa19vGDB60YteF3oDgNGLXvR60fvy8QcLetGLXqd6LwCjF73o9aX3DBi96EWvO70rYPSiF70e9b589MGCXvSi16neLWD0ohe9zvTeAEavLb333n6r3aD3zug9AUavuc9ea4DRa1PvBjB6Lf3nbAowes3qvQaMXmPfe+0ARq9lvVeA0WvvqdXWm8pTqzLA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L3rRO1xvIWD0ohe9FvSWAEYvetFrRG82YPSiF7129OYBRi960WtKbwZg9KIXvdb0SgGjF73oNahXBBi96EWvTb1pwOhFL3rN6k0ARi960WtZbwwwetGLXuN6nx4BRi960WtfbxgwetGLXhd6A4DRi170etG7B4xe9KLXkd6nD99Z0Ite9DrVewaMXvSi153eFTB60Ytej3qfPnhnQS960etU7w4wetGLXk96t4DRi170OtN7Axi96EWvP70nwOhFL3pd6t0ARi960etN7zVg9KIXvQ71XgFGL3rR61OvGmD0ohe9/fXqAEYvetE7RK8CYPSiF72j9NYCRi960TtQbxVg9KIXvWP1lgNGL3rRO1xvIWD0ohe9FvSWAEYvetFrRG82YPSiF7129OYBRi960WtKbwZg9KIXvdb0SgGjF73oNahXBBi96EWvTb1pwOhFL3rN6k0ARi960WtZbwwwetGLXuN6nxwBRi960WtfbxgwetGLXhd6A4DRi170etG7B4xe9KLXkd4nD+4t6EUvep3qPQNGL3rR607vChi96EWvR71Pvr63oBe96HWqdwcYvehFrye9W8DoRS96nem9AYxe9KLXn94TYPSiF70u9W4Aoxe96PWm9xowetGLXod6rwCjF73o9alXDTB60Yve/np1AKMXvegdovfN/A+PgtwPGH8RqQAAAABJRU5ErkJggg==', 'base64'));

  -- 7. Loans, spread over the last six weeks.
  FOR i IN 1..20 LOOP
    v_tier := v_items[i][4]::int;
    -- Out now: picked up 1-9 days ago; three of them overdue.
    PERFORM pg_temp.make_loan(pg_temp.unit(i, 1), v_students[i],
      pg_temp.bkk(-(1 + i % 9), 9 + i % 4),
      CASE WHEN i IN (3, 9, 15) THEN pg_temp.bkk(-(1 + i % 3), 17) ELSE pg_temp.bkk(i % 7, 17) END,
      NULL, 'Normal', true, v_staffs[v_items[i][5]::int], v_supers[v_items[i][5]::int], v_tier = 2, v_reasons[1 + i % 7], v_items[i][3]::float);
    -- Earlier loan, 20-39 days ago: some late, some scratched.
    v_start := pg_temp.bkk(-(39 - i), 9 + i % 5);
    v_due := pg_temp.bkk(-(39 - i) + 3, 17);
    PERFORM pg_temp.make_loan(pg_temp.unit(i, 2), v_students[1 + (i + 6) % 20], v_start, v_due,
      CASE WHEN i % 5 = 0 THEN v_due + interval '2 days' - interval '3 hours' ELSE v_due - interval '2 hours' - (i % 3) * interval '1 day' END,
      CASE WHEN i % 7 = 0 THEN 'MinorDamage' ELSE 'Normal' END, true,
      v_staffs[v_items[i][5]::int], v_supers[v_items[i][5]::int], v_tier = 2, v_reasons[1 + (i + 2) % 7], v_items[i][3]::float);
    -- Recent loan, 6-10 days ago: some late, one broken.
    v_start := pg_temp.bkk(-(10 - i % 5), 10 + i % 4);
    v_due := pg_temp.bkk(-(10 - i % 5) + 2, 17);
    PERFORM pg_temp.make_loan(pg_temp.unit(i, 2), v_students[1 + (i + 12) % 20], v_start, v_due,
      CASE WHEN i % 4 = 0 THEN v_due + interval '1 day' ELSE v_due - interval '3 hours' END,
      CASE WHEN i = 6 THEN 'MajorDamage' WHEN i % 9 = 0 THEN 'MinorDamage' ELSE 'Normal' END, true,
      v_staffs[v_items[i][5]::int], v_supers[v_items[i][5]::int], v_tier = 2, v_reasons[1 + (i + 4) % 7], v_items[i][3]::float);
  END LOOP;

  -- Back yesterday, not inspected yet.
  FOR i IN 1..2 LOOP
    j := (ARRAY[7, 20])[i];
    PERFORM pg_temp.make_loan(pg_temp.unit(j, 4), v_students[5 + i],
      pg_temp.bkk(-4, 10), pg_temp.bkk(0, 17), pg_temp.bkk(-1, 14), 'Normal', false,
      v_staffs[v_items[j][5]::int], v_supers[v_items[j][5]::int], false, v_reasons[i], v_items[j][3]::float);
  END LOOP;

  -- The borrower of the broken unit appeals the damage penalty.
  INSERT INTO "AppealInfo" ("OriginalPenalty", "FiledBy", "AppealReason", "ApproveStatus", "ActionTime")
  SELECT p."PenaltyKey", p."AccountKey",
    'ชิ้นส่วนหลวมตั้งแต่ตอนรับของ ดูได้จากรูปตอนรับ ขอให้พิจารณาลดโทษ', 'Pending', p."ActionTime" + interval '1 day'
  FROM "PenaltyInfo" p WHERE p."Reason" LIKE 'DamagedItem: ชิ้นส่วนแตกหัก%' LIMIT 1;
  UPDATE "PenaltyInfo" SET "Appealed" = true WHERE "PenaltyKey" IN (SELECT "OriginalPenalty" FROM "AppealInfo");
  UPDATE "Inspection" i SET "AppealKey" = a."AppealKey" FROM "AppealInfo" a WHERE i."PenaltyKey" = a."OriginalPenalty";

  -- 8. Requests that did not become loans: rejected, cancelled, not collected.
  FOR i IN 1..8 LOOP
    j := (ARRAY[5, 9, 11, 14, 16, 17, 2, 10])[i];
    INSERT INTO "Reservations" ("ResourceKey", "ReservedBy", "Reason", "DecisionNote", "StartTime", "EndTime", "ApproveStatus",
      "ApprovedBy", "AutoApproved", "ReservationExpiration", "ActionTime", "ResolvedAt")
    VALUES (pg_temp.unit(j, 3), v_students[1 + (i * 3) % 20], v_reasons[1 + i % 7],
      (ARRAY['ช่วงเวลาดังกล่าวเครื่องถูกจองใช้ในรายวิชาแล้ว', 'โปรดระบุรายละเอียดโปรเจกต์ให้ชัดเจนกว่านี้',
             'อุปกรณ์อยู่ระหว่างสอบเทียบ', 'ระยะเวลายืมนานเกินความจำเป็นของงาน'])[1 + i % 4],
      pg_temp.bkk(-(3 + 4 * i), 10), pg_temp.bkk(-(3 + 4 * i) + 2, 17), 'Rejected',
      v_supers[v_items[j][5]::int], false, pg_temp.bkk(-(3 + 4 * i) + 2, 17), pg_temp.bkk(-(5 + 4 * i), 9), pg_temp.bkk(-(4 + 4 * i), 11));
  END LOOP;
  FOR i IN 1..5 LOOP
    j := (ARRAY[1, 3, 6, 12, 19])[i];
    INSERT INTO "Reservations" ("ResourceKey", "ReservedBy", "Reason", "DecisionNote", "StartTime", "EndTime", "ApproveStatus",
      "AutoApproved", "ApprovedAt", "ReservationExpiration", "ActionTime", "ResolvedAt")
    VALUES (pg_temp.unit(j, 3), v_students[1 + (i * 5) % 20], v_reasons[1 + i % 7],
      (ARRAY['เปลี่ยนแผนการทดลอง', 'อาจารย์เลื่อนกำหนดส่งงาน', 'ยืมจากเพื่อนในกลุ่มแล้ว'])[1 + i % 3],
      pg_temp.bkk(-(2 + 6 * i), 10), pg_temp.bkk(-(2 + 6 * i) + 2, 17), 'Canceled',
      true, pg_temp.bkk(-(4 + 6 * i), 9), pg_temp.bkk(-(1 + 6 * i), 10), pg_temp.bkk(-(4 + 6 * i), 9), pg_temp.bkk(-(3 + 6 * i), 15));
  END LOOP;
  FOR i IN 1..3 LOOP
    j := (ARRAY[4, 13, 18])[i];
    INSERT INTO "Reservations" ("ResourceKey", "ReservedBy", "Reason", "DecisionNote", "StartTime", "EndTime", "ApproveStatus",
      "AutoApproved", "ApprovedAt", "ReservationExpiration", "ActionTime", "ResolvedAt")
    VALUES (pg_temp.unit(j, 3), v_students[1 + (i * 7) % 20], v_reasons[1 + i % 7], 'ไม่มารับภายในเวลาที่กำหนด',
      pg_temp.bkk(-(5 + 9 * i), 10), pg_temp.bkk(-(5 + 9 * i) + 2, 17), 'Canceled',
      true, pg_temp.bkk(-(6 + 9 * i), 9), pg_temp.bkk(-(4 + 9 * i), 10), pg_temp.bkk(-(6 + 9 * i), 9), pg_temp.bkk(-(4 + 9 * i), 10));
  END LOOP;

  -- 9. Waiting at the counter: approved for tomorrow (two already prepared),
  --    and T2 requests waiting for a supervisor.
  FOR i IN 1..7 LOOP
    j := (ARRAY[1, 2, 8, 10, 5, 9, 14])[i];
    v_res_key := pg_temp.unit(j, 3);
    v_start := pg_temp.bkk(CASE WHEN i <= 4 THEN 1 ELSE 2 END, 10);
    v_due := pg_temp.bkk(CASE WHEN i <= 4 THEN 3 ELSE 4 END, 17);
    INSERT INTO "Reservations" ("ResourceKey", "ReservedBy", "Reason", "StartTime", "EndTime", "ApproveStatus",
      "AutoApproved", "ApprovedAt", "ReservationExpiration", "ActionTime")
    VALUES (v_res_key, v_students[3 * i % 20 + 1], v_reasons[1 + i % 7], v_start, v_due,
      CASE WHEN i <= 4 THEN 'Approved' ELSE 'Pending' END::"ApproveStatus",
      i <= 4, CASE WHEN i <= 4 THEN now() END,
      CASE WHEN i <= 4 THEN v_start + interval '1 day' ELSE v_due END, now())
    RETURNING "ReservationKey" INTO k;
    IF i <= 2 THEN
      INSERT INTO "ConditionLog" ("ResourceKey", "LoggedBy", "Condition", "LoggedAt")
      VALUES (v_res_key, v_staffs[v_items[j][5]::int], 'Normal', now()) RETURNING "ConditionKey" INTO v_cl;
      INSERT INTO "UsageLog" ("ReservationKey", "AccountKey", "ResourceKey", "CurrentStatus", "DueTime", "CheckoutTime", "CheckoutCondition")
      VALUES (k, v_students[3 * i % 20 + 1], v_res_key, 'Prepared', v_due, v_start, v_cl);
    END IF;
  END LOOP;

  -- Credit follows the penalties still in force.
  UPDATE "AccountInfo" a SET "UserCredit" = greatest(0, 100 - coalesce((
    SELECT sum(p."CreditDeducted") FROM "PenaltyInfo" p
    WHERE p."AccountKey" = a."AccountKey" AND p."InEffect" AND p."ExpirationTime" > now()), 0));

  -- Presentation day open for every department.
  INSERT INTO "SystemSetting" ("Key", "Value", "UpdatedAt")
  VALUES ('openDays', '{"days":[{"date":"2026-10-31","groupKeys":[]}]}', now());

  RAISE NOTICE 'Done: % equipment types, % rooms, % accounts, % loans (% out now), % requests',
    (SELECT count(*) FROM "ItemInfo"), (SELECT count(*) FROM "RoomInfo"), (SELECT count(*) FROM "AccountInfo"),
    (SELECT count(*) FROM "UsageLog"), (SELECT count(*) FROM "UsageLog" WHERE "CurrentStatus" = 'Lended'),
    (SELECT count(*) FROM "Reservations");
END $$;

COMMIT;
