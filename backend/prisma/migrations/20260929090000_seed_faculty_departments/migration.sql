BEGIN;

DO $$
DECLARE
  item record;
  faculty_id integer;
  faculty_count bigint;
  group_id integer;
  branch_count bigint;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      ('คณะวิศวกรรมศาสตร์', 'ภาควิชาวิศวกรรมคอมพิวเตอร์'),
      ('คณะวิศวกรรมศาสตร์', 'ภาควิชาวิศวกรรมไฟฟ้า'),
      ('คณะวิทยาศาสตร์', 'ภาควิชาวิทยาการคอมพิวเตอร์')
    ) AS units(faculty_name, branch_name)
  LOOP
    SELECT count(*), min("FacultyKey")
      INTO faculty_count, faculty_id
      FROM "FacultyInfo"
      WHERE "FacultyName" = item.faculty_name;

    IF faculty_count > 1 THEN
      RAISE EXCEPTION 'Duplicate faculty name: %', item.faculty_name;
    ELSIF faculty_count = 0 THEN
      INSERT INTO "FacultyInfo" ("FacultyName")
        VALUES (item.faculty_name)
        RETURNING "FacultyKey" INTO faculty_id;
    END IF;

    SELECT count(*), min("ManageGroupKey")
      INTO branch_count, group_id
      FROM "BranchInfo"
      WHERE "BranchName" = item.branch_name
        AND "FacultyKey" = faculty_id;

    IF branch_count > 1 THEN
      RAISE EXCEPTION 'Duplicate branch % under faculty %',
        item.branch_name, item.faculty_name;
    ELSIF branch_count = 0 THEN
      INSERT INTO "ManagementGroup" ("GroupType")
        VALUES ('Faculty')
        RETURNING "ManageGroupKey" INTO group_id;

      INSERT INTO "BranchInfo" ("BranchName", "FacultyKey", "ManageGroupKey")
        VALUES (item.branch_name, faculty_id, group_id);
    END IF;
  END LOOP;
END $$;

COMMIT;
