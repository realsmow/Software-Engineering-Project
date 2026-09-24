"""Fill a freshly seeded ULMs database with a busy, varied, believable history.

`npm run seed` leaves 4 accounts, 2 departments and 15 units — every screen
works but every table has one or two rows, which makes a live demo look like a
toy. This script builds what a faculty would look like after six weeks of use:

  base      6 departments, ~20 equipment types, ~90 units, 6 rooms   (SQL)
  people    30 students, 6 staff, 3 supervisors, 1 extra admin       (tRPC)
  history   ~110 finished loans spread over the last 6 weeks         (tRPC, then backdated)
  live      something waiting in every queue a presenter will open   (tRPC)

Two kinds of write, on purpose:

* Base data goes in with SQL. Departments and Authority rows (a user's place
  in a department) have no procedure at all. Item types and units do
  (item.createType / item.createUnit); they are inserted here only for
  convenience, in the same pass as the departments they belong to. The rows mirror backend/src/seed.ts
  field for field, so the backend reads them exactly as it reads its own seed.
* Everything that *happens* — requests, approvals, pickups, returns,
  inspections, penalties, appeals, extensions, repairs, bookings — goes through
  the real tRPC API as the right role, so every row is one the system itself
  produced. History is then moved into the past: each loan is run to completion
  now, one phase at a time, and every timestamp written during a phase is
  shifted to that phase's target date. Order and content stay exactly what the
  code wrote; only the calendar moves.

Run against a database that was just migrated and seeded, with the backend up:

    DEMO_DB=ulms_demo5 python3 docs/demo/seed_rich_demo.py

Deterministic (fixed random seed), so two runs build the same demo.
"""

from __future__ import annotations

import json
import os
import random
import subprocess
import sys
import time
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

API = os.environ.get("DEMO_API", "http://localhost:3000/trpc")
DB = os.environ.get("DEMO_DB", "ulms_demo5")
PG = os.environ.get("PG_CONTAINER", "postgres")
HERE = Path(__file__).resolve().parent
PHOTOS = HERE / "photos"
STATE = HERE / "rich-demo-state.json"
PASSWORD = "demo1234"          # every generated account; the four test_* keep theirs
UTC = timezone.utc
BKK = timezone(timedelta(hours=7))
rng = random.Random(2569)


# ════════════════════════════════════════════════════════════════ plumbing
@dataclass
class Call:
    ok: bool
    status: int
    data: Any = None
    error: Any = None


class Client:
    """One logged-in session. Cookie lives in the requests.Session."""

    def __init__(self, username: str, password: str):
        self.name = username
        self.http = requests.Session()
        r = self.m("auth.login", {"username": username, "password": password})
        if not r.ok:
            sys.exit(f"login {username} failed: {r.error}")

    def _wrap(self, resp) -> Call:
        try:
            body = resp.json()
        except ValueError:
            body = {"raw": resp.text[:300]}
        ok = resp.ok and "result" in body
        err = None
        if not ok:
            e = body.get("error", {})
            err = e.get("message", body) if isinstance(e, dict) else e
        return Call(ok, resp.status_code, body.get("result", {}).get("data") if ok else None, err)

    def q(self, proc, payload=None) -> Call:
        url = f"{API}/{proc}"
        if payload is not None:
            url += "?input=" + urllib.parse.quote(json.dumps(payload))
        return self._wrap(self.http.get(url, timeout=30))

    def m(self, proc, payload=None) -> Call:
        return self._wrap(self.http.post(f"{API}/{proc}", json=payload or {}, timeout=30))

    def must(self, proc, payload=None) -> Any:
        r = self.m(proc, payload)
        if not r.ok:
            raise RuntimeError(f"{self.name} {proc} -> {r.status} {r.error} | {payload}")
        return r.data


def sql(query: str) -> list[list[str]]:
    out = subprocess.run(["docker", "exec", "-i", PG, "psql", "-U", "postgres", "-d", DB,
                          "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1"],
                         input=query, check=True, capture_output=True, text=True).stdout
    return [line.split("\t") for line in out.strip().splitlines() if line]


def one(query: str) -> str:
    return sql(query)[0][0]


def lit(s: str | None) -> str:
    return "NULL" if s is None else "'" + s.replace("'", "''") + "'"


def iso(t: datetime) -> str:
    return t.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def now() -> datetime:
    return datetime.now(UTC)


# ════════════════════════════════════════════════════════════════ backdating
# Every column that records *when something happened*. Values written during a
# phase all fall inside that phase's wall-clock window, so shifting "everything
# in the window" moves exactly that phase and nothing else. Loans are processed
# strictly one at a time and nothing else talks to the server, which is what
# makes the window a reliable key.
EVENT_COLUMNS = [
    ("Reservations", "ActionTime"), ("Reservations", "ApprovedAt"), ("Reservations", "ResolvedAt"),
    ("UsageLog", "CheckoutTime"), ("UsageLog", "CheckInTime"),
    ("Inspection", "ActionTime"), ("Images", "ActionTime"),
    ("ConditionLog", "LoggedAt"), ("Notification", "CreatedAt"), ("Notification", "ReadAt"),
    ("AuditLog", "At"), ("AppealInfo", "ActionTime"), ("AppealInfo", "ResolvedAt"),
    ("ExtensionRequest", "RequestedAt"), ("ExtensionRequest", "ResolvedAt"),
    ("RepairLog", "BeginRepairDate"), ("RepairLog", "EndRepairDate"),
]


class Phase:
    """`with Phase(target):` — everything written inside lands at `target`."""

    def __init__(self, target: datetime):
        self.target = target

    def __enter__(self):
        time.sleep(0.02)
        self.t0 = now()
        return self

    def __exit__(self, *exc):
        if exc[0]:
            return False
        self.t1 = now() + timedelta(milliseconds=5)
        time.sleep(0.02)
        d = f"interval '{(self.target - self.t0).total_seconds():.3f} seconds'"
        w = f"between '{self.t0.isoformat()}' and '{self.t1.isoformat()}'"
        stmts = [
            # Derived deadlines first, while their anchor column still has the old value.
            f'update "PenaltyInfo" set "ExpirationTime" = "ExpirationTime" + {d}, '
            f'"ActionTime" = "ActionTime" + {d} where "ActionTime" {w};',
            f'update "Reservations" set "ReservationExpiration" = "ReservationExpiration" + {d} '
            f'where "ActionTime" {w};',
        ]
        stmts += [f'update "{t}" set "{c}" = "{c}" + {d} where "{c}" {w};' for t, c in EVENT_COLUMNS]
        sql("\n".join(stmts))
        return False


def move_window(reservation: int, start: datetime, end: datetime) -> None:
    """Put a reservation's booked window (and its loan's due time) on real dates."""
    sql(f'update "Reservations" set "StartTime" = \'{start.isoformat()}\', '
        f'"EndTime" = \'{end.isoformat()}\' where "ReservationKey" = {reservation};'
        f'update "UsageLog" set "DueTime" = \'{end.isoformat()}\' '
        f'where "ReservationKey" = {reservation};')


def counter(day: datetime, hour: int, minute: int = 0) -> datetime:
    """A Bangkok wall-clock time on the day of `day`."""
    local = day.astimezone(BKK)
    return local.replace(hour=hour, minute=minute, second=0, microsecond=0)


def tomorrow_at(hour: int, days: int = 1) -> datetime:
    return counter(now() + timedelta(days=days), hour)


# ════════════════════════════════════════════════════════════════ base data (SQL)
FACULTY = "คณะวิศวกรรมศาสตร์"
DEPARTMENTS = {  # code -> name; cpe/ee already exist from npm run seed
    "cpe": "ภาควิชาวิศวกรรมคอมพิวเตอร์",
    "ee": "ภาควิชาวิศวกรรมไฟฟ้า",
    "me": "ภาควิชาวิศวกรรมเครื่องกล",
    "ce": "ภาควิชาวิศวกรรมโยธา",
    "che": "ภาควิชาวิศวกรรมเคมี",
    "ie": "ภาควิชาวิศวกรรมอุตสาหการ",
}

# name, description, credit weight, tier, dept, serial prefix, units, photo
CATALOG = [
    ("บอร์ด Raspberry Pi 5 ชุดพัฒนา", "RAM 8GB พร้อม microSD 64GB อะแดปเตอร์ และเคส", 3, "T1", "cpe", "CPE-RPI", 8, "board"),
    ("บอร์ด Arduino Uno R4 WiFi", "พร้อมสาย USB-C และชุดเซนเซอร์พื้นฐาน 12 ชิ้น", 1, "T0", "cpe", "CPE-ARD", 10, "board"),
    ("โน้ตบุ๊ก Dell Latitude 5450", "Core Ultra 7 RAM 16GB สำหรับงานโครงงาน", 5, "T2", "cpe", "CPE-NB", 4, "laptop"),
    ("แว่น VR Meta Quest 3", "128GB พร้อมคอนโทรลเลอร์สองข้าง", 5, "T2", "cpe", "CPE-VR", 2, "tablet"),
    ("มัลติมิเตอร์ดิจิทัล Fluke 117", "วัดแรงดัน กระแส ความต้านทาน พร้อมสายวัด", 1, "T0", "ee", "EE-DMM", 8, "meter"),
    ("แหล่งจ่ายไฟ DC 0-30V 5A", "ปรับแรงดันและกระแสได้ สองช่อง", 2, "T1", "ee", "EE-PSU", 4, "meter"),
    ("เครื่องกำเนิดสัญญาณ 25MHz", "Function generator สองช่อง", 4, "T2", "ee", "EE-FGN", 2, "scope"),
    ("สว่านไขควงไร้สาย 18V", "พร้อมแบต 2 ก้อนและดอกสว่านชุด 30 ชิ้น", 2, "T1", "me", "ME-DRL", 4, "tool"),
    ("เครื่องพิมพ์ 3 มิติ Prusa MK4", "พร้อมเส้น PLA 1 ม้วน ใช้ในห้อง Maker Space", 5, "T2", "me", "ME-3DP", 2, "tool"),
    ("ไมโครมิเตอร์ 0-25 มม.", "ความละเอียด 0.001 มม. พร้อมกล่อง", 1, "T0", "me", "ME-MIC", 5, "tool"),
    ("กล้องระดับอัตโนมัติ", "Auto level 32x พร้อมขาตั้งและไม้สตาฟ", 3, "T1", "ce", "CE-LVL", 3, "survey"),
    ("เลเซอร์วัดระยะ 60 ม.", "Laser distance meter พร้อมซองใส่", 1, "T0", "ce", "CE-LSR", 5, "survey"),
    ("เครื่องวัด pH แบบพกพา", "พร้อมบัฟเฟอร์สอบเทียบ pH 4 7 10", 2, "T1", "che", "CHE-PH", 4, "lab"),
    ("ตาชั่งดิจิทัล 0.01 กรัม", "รับน้ำหนักสูงสุด 500 กรัม", 1, "T0", "che", "CHE-BAL", 4, "lab"),
    ("แท็บเล็ต iPad 10.9 นิ้ว", "สำหรับเก็บข้อมูลภาคสนามและจับเวลางาน", 3, "T1", "ie", "IE-TAB", 4, "tablet"),
    ("นาฬิกาจับเวลาดิจิทัล", "ละเอียด 1/100 วินาที สำหรับศึกษาการทำงาน", 1, "T0", "ie", "IE-STW", 6, "tool"),
]
# photos for the four types npm run seed creates
SEED_PHOTO = {"เวอร์เนียคาลิปเปอร์ดิจิทัล": "caliper", "สายจัมเปอร์ชุดใหญ่": "jumper",
              "ออสซิลโลสโคป 100MHz": "scope", "กล้องถ่ายภาพ DSLR": "camera"}

ROOMS = [  # name, dept, capacity, location
    ("ห้องปฏิบัติการคอมพิวเตอร์ 7603", "cpe", 30, "อาคาร 7 ชั้น 6"),
    ("ห้องประชุมกลุ่มย่อย EE-204", "ee", 10, "อาคารไฟฟ้า ชั้น 2"),
    ("Maker Space ME-110", "me", 20, "อาคารเครื่องกล ชั้น 1"),
    ("ห้องบรรยาย CE-301", "ce", 60, "อาคารโยธา ชั้น 3"),
    ("ห้องปฏิบัติการเคมี CHE-215", "che", 24, "อาคารเคมี ชั้น 2"),
    ("ห้องประชุมโครงงาน IE-402", "ie", 8, "อาคารอุตสาหการ ชั้น 4"),
]


@dataclass
class Unit:
    resource: int
    serial: str
    item: str
    tier: str
    dept: str
    weight: float
    photo: str


def build_base() -> tuple[dict[str, int], list[Unit], dict[str, int]]:
    faculty = one(f'select "FacultyKey" from "FacultyInfo" where "FacultyName" = {lit(FACULTY)}')
    groups: dict[str, int] = {}
    for code, name in DEPARTMENTS.items():
        found = sql(f'select "ManageGroupKey" from "BranchInfo" where "BranchName" = {lit(name)}')
        if found:
            groups[code] = int(found[0][0])
            continue
        # Same two-row shape seed.ts writes: a nameless group, then the branch naming it.
        g = one('insert into "ManagementGroup" ("GroupType") values (\'Faculty\') returning "ManageGroupKey"')
        sql(f'insert into "BranchInfo" ("BranchName", "FacultyKey", "ManageGroupKey") '
            f'values ({lit(name)}, {faculty}, {g})')
        groups[code] = int(g)

    rules = {r: int(k) for k, r in sql('select "BorrowRuleKey", "RuleName" from "BorrowRule"')}
    roles = {n: int(k) for k, n in sql('select "AuthorityRoleKey", "AuthorityName" from "AuthorityRole"')}

    for name, desc, weight, tier, dept, prefix, count, _ in CATALOG:
        item = one(f'insert into "ItemInfo" ("ItemName", "ItemDesc", "CreditWeight") '
                   f'values ({lit(name)}, {lit(desc)}, {weight}) returning "ItemKey"')
        for i in range(count):
            res = one(f'insert into "ResourceInfo" ("ManagedBy", "BorrowRule", "ResourceStatus", '
                      f'"ResourceType", "BufferTime", "AllowBorrow") values ({groups[dept]}, '
                      f'{rules[tier]}, \'InStorage\', \'Item\', 0, true) returning "ResourceKey"')
            sql(f'insert into "ItemIndiv" ("ResourceKey", "ItemKey", "ItemID") '
                f'values ({res}, {item}, {lit(f"{prefix}-{i + 1:03d}")})')

    dept_of_group = {v: k for k, v in groups.items()}
    units = [Unit(int(r), s, n, t, dept_of_group[int(g)], float(w), "")
             for r, s, n, t, g, w in sql(
                 'select r."ResourceKey", ii."ItemID", i."ItemName", b."RuleName", r."ManagedBy", '
                 'i."CreditWeight" from "ItemIndiv" ii join "ResourceInfo" r using ("ResourceKey") '
                 'join "ItemInfo" i using ("ItemKey") join "BorrowRule" b on b."BorrowRuleKey" = r."BorrowRule" '
                 'order by r."ResourceKey"')]
    photo_of = {c[0]: c[7] for c in CATALOG} | SEED_PHOTO
    for u in units:
        u.photo = photo_of.get(u.item, "tool")

    # Who may borrow what: T0/T1 open to every department's students, T2 only
    # to the owning department — the pattern the proposal describes for
    # expensive items. Both authority roles, like seed.ts.
    rows = []
    for u in units:
        for code, g in groups.items():
            if u.tier in ("T0", "T1") or code == u.dept:
                for role in roles.values():
                    rows.append(f"({g}, {u.resource}, {role})")
    sql('insert into "Eligibility" ("GroupKey", "ResourceKey", "RoleKey") values '
        + ", ".join(rows) + " on conflict do nothing")

    # The four presenter accounts see every department, so one login shows it all.
    for uid in ("test_borrower", "test_staff", "test_supervisor", "test_admin"):
        role = roles["Student"] if uid == "test_borrower" else roles["Lab staff"]
        acc = one(f'select "AccountKey" from "AccountInfo" where "UserID" = {lit(uid)}')
        sql('insert into "Authority" ("AccountKey", "ManageGroupKey", "AuthorityRoleKey") values '
            + ", ".join(f"({acc}, {g}, {role})" for g in groups.values()) + " on conflict do nothing")
    print(f"  base: {len(groups)} departments, {len(units)} units, "
          f"{len(set(u.item for u in units))} item types, {len(rows)} eligibility rows")
    return groups, units, roles


# ════════════════════════════════════════════════════════════════ people
FIRST = ["ณัฐวุฒิ", "พิมพ์ชนก", "ธนกฤต", "กมลชนก", "ภูริณัฐ", "ศิริกาญจน์", "วรเมธ", "ชนิดาภา",
         "ปัณณวิชญ์", "อรปรียา", "ธีรภัทร", "ณิชาภัทร", "กิตติพัศ", "สุพิชชา", "จิรายุ", "เบญญาภา",
         "พีรพล", "ปวีณ์ธิดา", "อชิตะ", "มนัสนันท์", "ศุภวิชญ์", "ญาณิศา", "ธนภัทร", "วริศรา",
         "ภาคิน", "ชญานิศ", "รัชชานนท์", "กัญญาณัฐ", "นนทพัทธ์", "ปาริชาติ"]
LAST = ["ศรีสุข", "วงศ์ทอง", "แก้วประเสริฐ", "จันทร์เพ็ญ", "บุญมา", "ทองดี", "สายสุวรรณ", "พรหมวงศ์",
        "รุ่งเรือง", "ชัยมงคล", "ประเสริฐศักดิ์", "อินทร์แก้ว", "มณีรัตน์", "สมบูรณ์ชัย", "ศักดิ์ดี",
        "นาคประเสริฐ", "เพชรรัตน์", "วัฒนากุล", "ธรรมรักษ์", "สุวรรณภูมิ", "กาญจนวงศ์", "เจริญผล",
        "อุดมสุข", "พึ่งทอง", "ใจดี", "คงสวัสดิ์", "ศรีวงศ์", "บุญญาศิริ", "มีสุข", "ทรัพย์สมบูรณ์"]
STAFF = [("สมศักดิ์", "ใจเย็น", "cpe"), ("วิภาวรรณ", "ตั้งมั่น", "ee"), ("ประยุทธ", "ช่างคิด", "me"),
         ("สุนทร", "แม่นยำ", "ce"), ("จันทร์จิรา", "สะอาดดี", "che"), ("อนุชา", "เป็นระบบ", "ie")]
SUPERVISORS = [("ผศ.ดร.กฤษดา", "วิเศษศักดิ์", "cpe"), ("รศ.ดร.นภาพร", "แสงทอง", "ee"),
               ("อ.ดร.ชัยวัฒน์", "พลังงาน", "me")]


@dataclass
class Person:
    uid: str
    first: str
    last: str
    dept: str
    role: str
    account: int = 0
    client: Client | None = field(default=None, repr=False)


def build_people(admin: Client, groups: dict[str, int], roles: dict[str, int]) -> dict[str, list[Person]]:
    depts = list(DEPARTMENTS)
    people: dict[str, list[Person]] = {"student": [], "staff": [], "supervisor": []}
    for i, (f, l) in enumerate(zip(FIRST, LAST)):
        dept = depts[i % len(depts)]
        people["student"].append(Person(f"66105{i + 1:05d}", f, l, dept, "borrower"))
    for f, l, dept in STAFF:
        people["staff"].append(Person(f"staff.{dept}", f, l, dept, "staff"))
    for f, l, dept in SUPERVISORS:
        people["supervisor"].append(Person(f"sup.{dept}", f, l, dept, "supervisor"))
    extra_admin = Person("admin.it", "ธนวัฒน์", "ระบบดี", "cpe", "admin")

    for p in [*people["student"], *people["staff"], *people["supervisor"], extra_admin]:
        credit = rng.choice([100, 100, 100, 98, 96, 95, 93]) if p.role == "borrower" else 100
        admin.must("admin.createUser", {
            "email": f"{p.uid.replace('.', '_')}@ku.th", "studentId": p.uid, "firstName": p.first,
            "lastName": p.last, "role": p.role, "password": PASSWORD, "initialCredit": credit})
        p.account = int(one(f'select "AccountKey" from "AccountInfo" where "UserID" = {lit(p.uid)}'))
        # createUser leaves the account in no department; without an Authority row
        # a student can borrow nothing and a staff member manages nothing.
        role = roles["Student"] if p.role == "borrower" else roles["Lab staff"]
        sql(f'insert into "Authority" ("AccountKey", "ManageGroupKey", "AuthorityRoleKey") '
            f'values ({p.account}, {groups[p.dept]}, {role})')
        p.client = Client(p.uid, PASSWORD)
    print(f"  people: {len(people['student'])} students, {len(people['staff'])} staff, "
          f"{len(people['supervisor'])} supervisors, 1 admin (password {PASSWORD})")
    return people


# ════════════════════════════════════════════════════════════════ one loan, end to end
class Desk:
    """The presenter-independent actors: who approves, prepares and inspects."""

    def __init__(self, people, staff_all: Client, sup_all: Client, admin: Client):
        self.staff = {p.dept: p.client for p in people["staff"]}
        self.sups = {p.dept: p.client for p in people["supervisor"]}
        self.staff_all, self.sup_all, self.admin = staff_all, sup_all, admin

    def as_staff(self, dept, proc, payload):
        """Department staff first; fall back to the all-department account if out of scope."""
        r = self.staff[dept].m(proc, payload)
        if r.ok:
            return r.data
        return self.staff_all.must(proc, payload)

    def approve(self, dept, reservation, decision="approve", reason=None):
        body = {"reservationKey": reservation, "decision": decision}
        if reason:
            body["reason"] = reason
        c = self.sups.get(dept, self.sup_all)
        r = c.m("approval.decide", body)
        return r.data if r.ok else self.sup_all.must("approval.decide", body)


def upload(client: Client, usage: int, stage: str, photo: str) -> None:
    data = (PHOTOS / f"{photo}-{'before' if stage == 'before' else 'after'}.jpg").read_bytes()
    t = client.must("image.requestUsagePhotoUpload",
                    {"usageKey": usage, "contentType": "image/jpeg", "sizeBytes": len(data)})
    put = client.http.put(t["uploadUrl"], data=data, headers={"Content-Type": "image/jpeg"})
    if put.status_code >= 300:
        raise RuntimeError(f"upload {put.status_code}")
    client.must("image.attachUsagePhotos", {"usageKey": usage, "stage": stage, "imageUrls": [t["imageUrl"]]})


def request(student: Person, unit: Unit, start: datetime, end: datetime, reason=None) -> dict:
    line = {"resourceKey": unit.resource}
    if reason:
        line["reason"] = reason
    out = student.client.must("loan.create", {"startTime": iso(start), "endTime": iso(end), "lines": [line]})
    if not out["created"]:
        raise RuntimeError(f"rejected {unit.serial} for {student.uid}: {out['rejected']}")
    return out["created"][0]


def prepare(desk: Desk, unit: Unit, reservation: int) -> int:
    a = desk.as_staff(unit.dept, "loan.allocate", {"reservationKey": reservation})
    return a.get("usageKey") or a["loan"]["usageKey"]


def hand_over(desk: Desk, student: Person, unit: Unit, usage: int, self_pickup: bool) -> None:
    if self_pickup:  # borrower's own pickup screen requires a photo per item
        upload(student.client, usage, "before", unit.photo)
        student.client.must("loan.confirmMyPickup", {"usageKey": usage})
    else:
        desk.as_staff(unit.dept, "loan.confirmPickup", {"usageKey": usage})


def take_back(desk: Desk, unit: Unit, usage: int) -> dict:
    staff = desk.staff[unit.dept]
    try:
        upload(staff, usage, "after", unit.photo)
    except RuntimeError:
        upload(desk.staff_all, usage, "after", unit.photo)
    return desk.as_staff(unit.dept, "loan.recordReturn", {"usageKey": usage})


def inspect(desk: Desk, unit: Unit, usage: int, level: str, note=None) -> dict:
    body = {"usageKey": usage, "level": level}
    if note:
        body["note"] = note
    # T2 must be inspected by someone other than who prepared it (FR-RTN-04);
    # the admin never prepares, so route every T2 through the admin.
    if unit.tier == "T2":
        return desk.admin.must("inspection.create", body)
    return desk.as_staff(unit.dept, "inspection.create", body)


DAMAGE_NOTES = {"B1": "มีรอยขีดข่วนที่ตัวเครื่องเพิ่มขึ้น", "B2": "ขาตั้งหักหนึ่งข้าง ยังใช้งานได้",
                "B3": "เปิดไม่ติด ต้องส่งซ่อม"}
REASONS = ["ใช้ทำโครงงานวิชา Senior Project", "ทดลองในวิชาปฏิบัติการ", "เก็บข้อมูลภาคสนาม",
           "เตรียมสาธิตในงาน Open House", "ใช้ในการแข่งขันระดับมหาวิทยาลัย", "ทำการบ้านวิชาเครื่องมือวัด"]


def finished_loan(desk, student, unit, start, days, returned_at, level, late_days=0) -> dict:
    """One loan from request to inspection, then moved to the given dates."""
    s0 = tomorrow_at(8)
    e0 = counter(s0 + timedelta(days=days), 16)
    with Phase(start - timedelta(days=rng.uniform(0.5, 3))):
        r = request(student, unit, s0, e0, rng.choice(REASONS))
    rk = r["reservationKey"]
    if r["status"] == "pending":
        with Phase(start - timedelta(hours=rng.uniform(3, 10))):
            desk.approve(unit.dept, rk)
    with Phase(start + timedelta(minutes=rng.randint(5, 90))):
        usage = prepare(desk, unit, rk)
        hand_over(desk, student, unit, usage, self_pickup=rng.random() < 0.6)
    if late_days:
        # recordReturn prices lateness from DueTime to *now*; put the due time
        # that many days behind now so the penalty is the real computed one.
        sql(f'update "UsageLog" set "DueTime" = now() - interval \'{late_days} days\' '
            f'where "UsageKey" = {usage}')
    with Phase(returned_at):
        ret = take_back(desk, unit, usage)
    with Phase(returned_at + timedelta(hours=rng.uniform(1, 18))):
        insp = inspect(desk, unit, usage, level, DAMAGE_NOTES.get(level))
    end = counter(start + timedelta(days=days), 16)
    move_window(rk, counter(start, 8), end)
    return {"reservation": rk, "usage": usage, "penalty": ((insp or {}).get("penalty") or {}).get("penaltyKey"),
            "late": (ret or {}).get("latePenalty")}


# ════════════════════════════════════════════════════════════════ history
def build_history(desk: Desk, students: list[Person], units: list[Unit], borrower: Person) -> list[dict]:
    today = now()
    busy: dict[int, list[tuple[datetime, datetime]]] = {}

    def free_unit(pool, start, days):
        """A unit not already out during [start, start+days+1] — no double lending."""
        end = start + timedelta(days=days + 1)
        for u in rng.sample(pool, len(pool)):
            if all(end <= s0 or start >= e0 for s0, e0 in busy.get(u.resource, [])):
                busy.setdefault(u.resource, []).append((start, end))
                return u
        return None

    plan = []
    # Everything ends at least 3 days ago, so history never collides with the
    # loans that are live today.
    wanted = [(rng.choice(students), today - timedelta(days=rng.uniform(9, 44))) for _ in range(104)]
    wanted += [(borrower, today - timedelta(days=d)) for d in (40, 31, 23, 16, 9)]
    for st, start in wanted:
        pool = [u for u in units if u.tier in ("T0", "T1") or (u.dept == st.dept and st is not borrower)]
        days = rng.randint(1, 5)
        unit = free_unit(pool, start, days)
        if unit:
            plan.append((st, unit, start, days if unit.tier != "T2" else min(days, 3)))
    plan.sort(key=lambda p: p[2])

    done = []
    for i, (st, unit, start, days) in enumerate(plan):
        roll = rng.random()
        late = rng.randint(1, 2) if roll < 0.07 else 0
        level = "B0" if roll < 0.82 else "B1" if roll < 0.93 else "B2" if roll < 0.98 else "B3"
        end = counter(start + timedelta(days=days), 16)
        returned = end + timedelta(days=late) if late else end - timedelta(hours=rng.uniform(1, 30))
        returned = max(returned, start + timedelta(hours=3))
        try:
            done.append({"student": st.uid, "serial": unit.serial, "level": level, "late": late,
                         **finished_loan(desk, st, unit, start, days, returned, level, late)})
        except RuntimeError as e:
            print(f"    skip history {i}: {e}")
        if (i + 1) % 20 == 0:
            print(f"    history {i + 1}/{len(plan)}")
    print(f"  history: {len(done)} finished loans over the last 6 weeks")
    return done


# ════════════════════════════════════════════════════════════════ live queues
def build_live(desk, people, units, borrower, stage) -> dict:
    """Something in every queue, dated around today. Returns what the script-md names."""
    students = people["student"]
    used: set[int] = set()
    out: dict[str, Any] = {}

    def free(pred) -> Unit:
        # random rather than first-match, so loans spread over every item type
        u = rng.choice([u for u in units if pred(u) and u.resource not in used
                        and u.resource not in stage["damaged"]])
        used.add(u.resource)
        return u

    def who(i) -> Person:
        return students[i % len(students)]

    t2_depts = {u.dept for u in units if u.tier == "T2"}
    t2_students = [p for p in students if p.dept in t2_depts]

    def who_t2(i) -> Person:
        return t2_students[i % len(t2_students)]

    # Reserve the presenter's pickup items first: there are only 3 DSLRs, and the
    # random loans below would otherwise take them.
    mine = [free(lambda u: u.item == "กล้องถ่ายภาพ DSLR"), free(lambda u: u.item == "สายจัมเปอร์ชุดใหญ่")]
    swap_from = free(lambda u: u.item.startswith("บอร์ด Raspberry"))
    swap_to = free(lambda u: u.item.startswith("บอร์ด Raspberry"))
    t0 = free(lambda u: u.tier == "T0" and u.dept == "ee")
    t2 = free(lambda u: u.tier == "T2" and u.item.startswith("ออสซิล"))

    # ---- on loan now (some overdue), picked up 1–6 days ago
    on_loan = []
    for i in range(16):
        st = who(i + 3)
        u = free(lambda u, st=st: u.tier in ("T0", "T1") or u.dept == st.dept)
        picked = now() - timedelta(days=rng.uniform(1, 6))
        due_in = rng.choice([-3, -2, -1, 1, 1, 2, 3, 4, 6, 8]) if i < 10 else rng.randint(2, 7)
        with Phase(picked - timedelta(days=1)):
            r = request(st, u, tomorrow_at(8), tomorrow_at(16, 1 + max(1, due_in)))
        if r["status"] == "pending":
            with Phase(picked - timedelta(hours=5)):
                desk.approve(u.dept, r["reservationKey"])
        with Phase(picked):
            usage = prepare(desk, u, r["reservationKey"])
            hand_over(desk, st, u, usage, self_pickup=i % 2 == 0)
        move_window(r["reservationKey"], counter(picked, 8), counter(now() + timedelta(days=due_in), 16))
        on_loan.append({"student": st.uid, "serial": u.serial, "due_in_days": due_in})
    out["on_loan"] = on_loan

    # ---- the presenter's borrower: two things in hand for the extension demo
    for u, label in ((t0, "extend_instant"), (t2, "extend_to_supervisor")):
        picked = now() - timedelta(days=2)
        with Phase(picked - timedelta(days=1)):
            r = request(borrower, u, tomorrow_at(8), tomorrow_at(16, 3))
        if r["status"] == "pending":
            with Phase(picked - timedelta(hours=4)):
                desk.approve(u.dept, r["reservationKey"])
        with Phase(picked):
            usage = prepare(desk, u, r["reservationKey"])
            hand_over(desk, borrower, u, usage, self_pickup=True)
        move_window(r["reservationKey"], counter(picked, 8), counter(now() + timedelta(days=2), 16))
        out[label] = u.serial

    # ---- returned today, waiting for inspection (one T2 prepared by test_staff: SoD demo)
    to_inspect = []
    for i in range(4):
        st = who_t2(i) if i == 0 else who(i + 20)
        u = free(lambda u, st=st, i=i: (u.tier == "T2" and u.dept == st.dept) if i == 0
                 else u.tier in ("T0", "T1"))
        with Phase(now() - timedelta(days=3)):
            r = request(st, u, tomorrow_at(8), tomorrow_at(16, 2))
        if r["status"] == "pending":
            with Phase(now() - timedelta(days=2, hours=20)):
                desk.approve(u.dept, r["reservationKey"])
        with Phase(now() - timedelta(days=2, hours=3)):
            # prepared by test_staff on purpose: that account then may not inspect the T2
            usage = desk.staff_all.must("loan.allocate", {"reservationKey": r["reservationKey"]})
            usage = usage.get("usageKey") or usage["loan"]["usageKey"]
            desk.staff_all.must("loan.confirmPickup", {"usageKey": usage})
        with Phase(now() - timedelta(hours=rng.uniform(1, 5))):
            take_back(desk, u, usage)
        move_window(r["reservationKey"], counter(now() - timedelta(days=2), 8), counter(now(), 16))
        to_inspect.append({"student": st.uid, "serial": u.serial, "tier": u.tier})
    out["to_inspect"] = to_inspect

    # ---- prepared, waiting at the counter (incl. the presenter's own pickup)
    to_hand = []
    for u in mine:
        r = request(borrower, u, tomorrow_at(8, 0) + timedelta(hours=0), tomorrow_at(16, 3))
        if r["status"] == "pending":
            desk.approve(u.dept, r["reservationKey"])
        prepare(desk, u, r["reservationKey"])
        to_hand.append({"student": borrower.uid, "serial": u.serial, "tier": u.tier})
    st = who(1)
    r = request(st, swap_from, tomorrow_at(8), tomorrow_at(16, 3))
    prepare(desk, swap_from, r["reservationKey"])
    to_hand.append({"student": st.uid, "serial": swap_from.serial, "tier": "T1",
                    "swap_to_serial": swap_to.serial, "swap_to_resource_key": swap_to.resource})
    # swap_to stays in `used` and is never requested, so the swap on stage finds it free
    for i in range(2):
        st = who(i + 9)
        u = free(lambda u: u.tier in ("T0", "T1"))
        r = request(st, u, tomorrow_at(8), tomorrow_at(16, 2))
        prepare(desk, u, r["reservationKey"])
        to_hand.append({"student": st.uid, "serial": u.serial, "tier": u.tier})
    out["to_hand_over"] = to_hand

    # ---- approved, not yet prepared (pickups over the next few days)
    to_prep = []
    for i in range(7):
        st = who(i + 12)
        u = free(lambda u: u.tier in ("T0", "T1"))
        r = request(st, u, tomorrow_at(8, 1 + i % 3), tomorrow_at(16, 3 + i % 3), rng.choice(REASONS))
        to_prep.append({"student": st.uid, "serial": u.serial})
    out["to_prepare"] = to_prep

    # ---- waiting for a supervisor (T2), plus one already rejected with a note
    pending = []
    for i in range(5):
        st = who_t2(i * 2 + 1)
        u = free(lambda u, st=st: u.tier == "T2" and u.dept == st.dept)
        r = request(st, u, tomorrow_at(8, 2 + i), tomorrow_at(16, 3 + i), rng.choice(REASONS))
        pending.append({"student": st.uid, "serial": u.serial, "reservation": r["reservationKey"]})
    out["pending_approval"] = pending
    st = who_t2(3)
    u = free(lambda u, st=st: u.tier == "T2" and u.dept == st.dept)
    r = request(st, u, tomorrow_at(8, 4), tomorrow_at(16, 6), "ขอยืมไปใช้ที่บ้าน")
    desk.approve(u.dept, r["reservationKey"], "reject",
                 "อุปกรณ์ระดับ T2 ต้องใช้ในห้องปฏิบัติการเท่านั้น ขอให้ยื่นใหม่พร้อมระบุห้อง")

    # ---- extension requests waiting for a supervisor
    ext = []
    for item in on_loan:
        if len(ext) == 3:
            break
        st = next(p for p in students if p.uid == item["student"])
        usage = next(x for x in st.client.q("loan.list", {}).data["items"]
                     if x["resource"]["serialNo"] == item["serial"])["usageKey"]
        opt = st.client.q("loan.extensionOptions", {"usageKey": usage}).data
        if opt and opt["canRequest"] and opt["route"] != "auto":
            st.client.must("loan.requestExtension", {"usageKey": usage,
                           "requestedDueAt": opt["maxRequestedDueAt"], "reason": "งานทดลองยังไม่เสร็จ ขอต่ออีกสองสามวัน"})
            ext.append(item["serial"])
    out["pending_extensions"] = ext
    stage["used"] = used
    return out


# ════════════════════════════════════════════════════════════════ appeals, repairs, rooms, bans
def build_side(desk, people, units, history, borrower, stage) -> dict:
    out: dict[str, Any] = {}
    by_uid = {p.uid: p for p in [*people["student"], borrower]}

    # Appeals need a penalty younger than 7 days. Make fresh ones where history has none.
    spare = iter([u for u in units if u.tier == "T1" and u.resource not in stage["damaged"]
                  and u.resource not in stage["used"]])

    def recent_penalty(st: Person, level: str) -> int:
        unit = next(spare)
        start = now() - timedelta(days=4)
        loan = finished_loan(desk, st, unit, start, 2, now() - timedelta(days=2), level)
        return loan["penalty"]

    presenter_penalty = recent_penalty(borrower, "B1")
    out["borrower_appealable_penalty"] = presenter_penalty

    appeals = []
    texts = ["รอยนี้มีอยู่ตั้งแต่ตอนรับ ดูได้จากรูปตอนรับของ",
             "อุปกรณ์เสื่อมตามอายุการใช้งาน ไม่ได้เกิดจากการใช้ผิดวิธี",
             "คืนช้าเพราะเจ้าหน้าที่ไม่อยู่ที่เคาน์เตอร์ในวันกำหนดคืน",
             "ขาตั้งหลวมอยู่ก่อนแล้ว แจ้งเจ้าหน้าที่ด้วยวาจาตอนรับ",
             "ใช้งานตามปกติ ขอให้ตรวจสอบกับรูปตอนคืนอีกครั้ง"]
    for i, st in enumerate(people["student"][2:7]):
        pen = recent_penalty(st, "B1" if i % 2 else "B2")
        with Phase(now() - timedelta(days=1, hours=i * 3)):
            a = st.client.must("appeal.create", {"penaltyKey": pen, "appealReason": texts[i]})
        appeals.append({"student": st.uid, "appeal": a["appealKey"]})
    # two already decided: one reduced, one upheld
    sup = desk.sup_all
    with Phase(now() - timedelta(hours=20)):
        sup.must("appeal.decide", {"appealKey": appeals[0]["appeal"], "decision": "approve",
                                   "reducedCreditDeducted": 1, "note": "รูปตอนรับยืนยันว่ามีรอยเดิม ลดโทษเหลือ 1 คะแนน"})
    with Phase(now() - timedelta(hours=16)):
        sup.must("appeal.decide", {"appealKey": appeals[1]["appeal"], "decision": "reject",
                                   "note": "รูปตอนรับไม่มีรอยนี้ คงโทษเดิม"})
    out["appeals_pending"] = len(appeals) - 2

    # Repairs: units that came back B2/B3 go to the workshop; two finished already.
    damaged = [u for u in units if u.resource in stage["damaged"]] or units[:4]
    repairs = []
    for i, u in enumerate(damaged[:5]):
        with Phase(now() - timedelta(days=6 - i)):
            rep = desk.as_staff(u.dept, "inspection.startRepair",
                                {"resourceKey": u.resource, "note": rng.choice(list(DAMAGE_NOTES.values()))})
        repairs.append((u, rep))
    for u, rep in repairs[:2]:
        key = rep.get("repairKey") or rep.get("id")
        with Phase(now() - timedelta(days=1)):
            desk.as_staff(u.dept, "inspection.finishRepair",
                          {"repairKey": key, "condition": "Normal", "note": "เปลี่ยนอะไหล่และทดสอบแล้ว"})
    out["repairs_open"] = len(repairs) - 2

    # Rooms: registered by the admin (no staff screen exists yet), opened to every
    # department's students, then a few bookings for today.
    groups = {k: int(one(f'select "ManageGroupKey" from "BranchInfo" where "BranchName" = {lit(v)}'))
              for k, v in DEPARTMENTS.items()}
    student_role = int(one('select "AuthorityRoleKey" from "AuthorityRole" where "AuthorityName" = \'Student\''))
    rooms = []
    for name, dept, cap, loc in ROOMS:
        r = desk.admin.must("item.createRoom", {"manageGroupKey": groups[dept], "name": name,
                                                "location": loc, "capacity": cap})
        rooms.append((r["roomKey"], r["resourceKey"], dept))
        sql('insert into "Eligibility" ("GroupKey", "ResourceKey", "RoleKey") values '
            + ", ".join(f"({g}, {r['resourceKey']}, {student_role})" for g in groups.values())
            + " on conflict do nothing")
    today = now().astimezone(BKK).date().isoformat()
    booked = []
    # afternoon slots (index 10 = 13:00) so they are still ahead during a 13:00 demo
    for i, st in enumerate(people["student"][8:14]):
        room_key, _, dept = rooms[i % len(rooms)]
        first = 10 + (i * 2) % 8
        r = st.client.must("loan.createRoomBooking", {"roomKey": room_key, "date": today,
                                                      "slots": [first, first + 1],
                                                      "reason": rng.choice(["ประชุมกลุ่มโครงงาน", "ติวสอบกลางภาค",
                                                                            "ซ้อมนำเสนอ", "ทำแล็บชดเชย"])})
        if r["created"]:
            key = r["created"][0]["reservationKey"]
            booked.append(key)
            if i % 2 == 0:
                desk.as_staff(dept, "approval.decide", {"reservationKey": key, "decision": "approve"})
    out["room_bookings_today"] = len(booked)

    # One suspended student, so the permissions page has a real case.
    banned = people["student"][29]
    desk.staff_all.must("admin.setUserBan", {"id": banned.account, "banned": True, "days": 14,
                                             "reason": "ค้างคืนอุปกรณ์เกินกำหนดหลายครั้ง"})
    out["suspended"] = banned.uid
    return out


# ════════════════════════════════════════════════════════════════ main
def main() -> int:
    if one('select count(*) from "Reservations"') != "0":
        sys.exit("this database already has loans; reset it first (bash docs/demo/reset_rich_demo.sh)")
    t_start = time.time()
    admin = Client("test_admin", "admin1234")
    staff_all = Client("test_staff", "staff1234")
    sup_all = Client("test_supervisor", "supervisor1234")

    print("== base data")
    groups, units, roles = build_base()
    print("== people")
    people = build_people(admin, groups, roles)
    borrower = Person("test_borrower", "Natthawut", "Srisuwan", "cpe", "borrower",
                      int(one('select "AccountKey" from "AccountInfo" where "UserID" = \'test_borrower\'')),
                      Client("test_borrower", "borrower1234"))
    desk = Desk(people, staff_all, sup_all, admin)

    print("== history (backdated)")
    history = build_history(desk, people["student"], units, borrower)
    # A unit that came back damaged is taken out of lending by the inspection
    # itself; read the flag rather than guessing from the grade.
    stage = {"damaged": {int(r) for (r,) in sql(
        'select "ResourceKey" from "ResourceInfo" where "ResourceType" = \'Item\' '
        'and ("AllowBorrow" = false or "ResourceStatus" <> \'InStorage\')')}}

    print("== live queues")
    live = build_live(desk, people, units, borrower, stage)
    print("== appeals, repairs, rooms, suspension")
    side = build_side(desk, people, units, history, borrower, stage)

    print("== scheduled jobs (as the server would have run them)")
    for job in ("expireDemerits", "markOverdue", "dueSoonReminder", "openT3InspectionRounds"):
        r = admin.m("admin.runCronJob", {"job": job})
        print(f"    {job}: {r.data if r.ok else r.error}")

    # A spread of credit bands so the user list shows D0–D3, not 30 identical rows.
    # Deliberately set, not earned — say so if asked.
    bands = {people["student"][24].uid: 84, people["student"][25].uid: 72,
             people["student"][26].uid: 61, people["student"][27].uid: 44}
    for uid, credit in bands.items():
        sql(f'update "AccountInfo" set "UserCredit" = {credit} where "UserID" = {lit(uid)}')

    counts = staff_all.q("loan.queueCounts", {}).data
    state = {"created_at": now().astimezone(BKK).isoformat(timespec="seconds"),
             "database": DB, "password_for_generated_accounts": PASSWORD,
             "queue_counts": counts, "live": live, "side": side,
             "credit_bands_set_by_script": bands,
             "history_loans": len(history),
             "accounts": {k: [{"user": p.uid, "name": f"{p.first} {p.last}", "dept": p.dept} for p in v]
                          for k, v in people.items()}}
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=1))
    print(f"== done in {time.time() - t_start:.0f}s  queue counts {counts}")
    print(f"   details: {STATE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
