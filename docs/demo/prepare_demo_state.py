"""Put the demo database into the state a live presentation starts from.

`npm run seed` creates accounts, two departments and fifteen units of
equipment — everything the system needs to *work*, and nothing that has
happened yet. Every queue is therefore empty on a freshly seeded database, so
the first five minutes of a demo are spent creating rows in front of the
audience before anything can be shown.

This script drives the real backend over tRPC as the four seeded accounts and
leaves one row in every queue, so each role opens on a populated screen and the
presenter can walk the flow instead of building it:

  L1  active loan            caliper, picked up, due in 3 days
  L2  waiting for approval   oscilloscope T2 -> supervisor's queue
  L3  approved, to prepare   DSLR T1 -> staff "to prepare"
  L4  set aside, to hand over jumper wires -> staff "to hand over"
  L5  returned, to inspect   caliper -> inspection backlog
  L6  inspected with damage  B1 penalty -> credit history + a pending appeal
  R1  room booking           a T3 room and one booking tomorrow
  X1  extension request      pending on L1

Nothing here is a fixture file: every row is created through the same
procedures the UI calls, so a state this script can reach is a state the system
can actually produce. The one exception is the room's Eligibility, which no
procedure can write (item.setEligibility is keyed by item type, not resource) —
that one write goes through psql and is labelled as a workaround below.

Run it once, against a database that has just been migrated and seeded:

    DEMO_DB=ulms_demo3 python3 docs/demo/prepare_demo_state.py

It refuses to run twice unless --force, because a second run would double every
queue rather than update it.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import os
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

API = os.environ.get("DEMO_API", "http://localhost:3000/trpc")
DEMO_DB = os.environ.get("DEMO_DB", "ulms_demo3")
PG_CONTAINER = os.environ.get("PG_CONTAINER", "postgres")
BKK = timezone(timedelta(hours=7))
OUT = Path(__file__).resolve().parent / "demo-state.json"

ACCOUNTS = {
    "borrower": ("test_borrower", "borrower1234"),
    "staff": ("test_staff", "staff1234"),
    "supervisor": ("test_supervisor", "supervisor1234"),
    "admin": ("test_admin", "admin1234"),
}

# Seeded catalogue entries this script borrows from (src/seed.ts).
CALIPER = "เวอร์เนียคาลิปเปอร์ดิจิทัล"
JUMPERS = "สายจัมเปอร์ชุดใหญ่"
SCOPE = "ออสซิลโลสโคป 100MHz"
CAMERA = "กล้องถ่ายภาพ DSLR"

ROOM_NAME = "ห้องปฏิบัติการคอมพิวเตอร์ 7603"

state: dict[str, Any] = {"created_at": datetime.now(BKK).isoformat(timespec="seconds"), "steps": {}}


# ── tRPC plumbing ───────────────────────────────────────────────────────────


@dataclass
class Call:
    ok: bool
    status: int
    data: Any = None
    error: Any = None


class Client:
    """One logged-in session per role; the cookie lives in requests.Session."""

    def __init__(self, role: str):
        self.role = role
        self.http = requests.Session()
        user, password = ACCOUNTS[role]
        login = self.mutate("auth.login", {"username": user, "password": password})
        if not login.ok:
            fail(f"login {role} failed: {login.error}")

    def _wrap(self, resp: requests.Response) -> Call:
        try:
            body = resp.json()
        except ValueError:
            body = {"raw": resp.text[:300]}
        ok = resp.ok and "result" in body
        return Call(
            ok=ok,
            status=resp.status_code,
            data=body.get("result", {}).get("data") if ok else None,
            error=None if ok else slim(body),
        )

    def query(self, proc: str, payload: Any = None) -> Call:
        url = f"{API}/{proc}"
        if payload is not None:
            url += "?input=" + urllib.parse.quote(json.dumps(payload))
        return self._wrap(self.http.get(url, timeout=30))

    def mutate(self, proc: str, payload: Any) -> Call:
        return self._wrap(self.http.post(f"{API}/{proc}", json=payload, timeout=30))


def slim(body: dict[str, Any]) -> Any:
    err = body.get("error", body)
    if not isinstance(err, dict):
        return err
    data = err.get("data") or {}
    return {"message": err.get("message"), "code": data.get("code")}


def rows(data: Any) -> list[Any]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("items", "data", "rows", "results"):
            if isinstance(data.get(key), list):
                return data[key]
    return []


def bkk(day_offset: int, hour: int, minute: int = 0) -> str:
    """ISO instant for a Bangkok wall-clock time, day_offset days from today."""
    base = datetime.now(BKK).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return (base + timedelta(days=day_offset)).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def soon(hours: float) -> str:
    """ISO instant `hours` from now, rounded up to the next half hour.

    Every window has to start in the future: `assertWindowShape` refuses a
    request whose start time has already passed, so "today at 09:00" only works
    before nine in the morning and the script would fail in the afternoon.
    """
    now = datetime.now(BKK).replace(second=0, microsecond=0)
    now += timedelta(minutes=(30 - now.minute % 30) % 30)
    return (now + timedelta(hours=hours)).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def fail(message: str) -> None:
    print(f"  ! {message}")


def note(step: str, value: Any) -> None:
    state["steps"][step] = value
    print(f"  {step}: {value}")


# ── shared helpers ──────────────────────────────────────────────────────────


def catalogue(borrower: Client) -> dict[str, int]:
    """itemKey per seeded item name."""
    listed = borrower.query("item.list", {"limit": 100})
    return {row["name"]: row["id"] for row in rows(listed.data) if row.get("name")}


def units_of(staff: Client, item_key: int) -> list[dict[str, Any]]:
    """Every physical unit of a type, newest last, as the staff screen sees them."""
    listed = staff.query("item.listUnits", {"id": item_key, "limit": 50})
    return rows(listed.data)


def request_loan(borrower: Client, resource_key: int, start: str, end: str) -> dict[str, Any] | None:
    """One loan request for one unit. Returns the created reservation, if any."""
    call = borrower.mutate("loan.create", {"startTime": start, "endTime": end, "lines": [{"resourceKey": resource_key}]})
    created = (call.data or {}).get("created") or []
    if created:
        return created[0]
    rejected = (call.data or {}).get("rejected") or []
    fail(f"loan.create refused: {rejected or call.error}")
    return None


def approve(supervisor: Client, reservation_key: int) -> None:
    call = supervisor.mutate("approval.decide", {"reservationKey": reservation_key, "decision": "approve"})
    if not call.ok:
        fail(f"approval.decide: {call.error}")


def allocate(staff: Client, reservation_key: int) -> int | None:
    call = staff.mutate("loan.allocate", {"reservationKey": reservation_key})
    if not call.ok:
        fail(f"loan.allocate: {call.error}")
        return None
    return (call.data or {}).get("usageKey")


# ── the eight steps ─────────────────────────────────────────────────────────


def l1_active_loan(borrower: Client, staff: Client, supervisor: Client, units: list[dict]) -> int | None:
    """Picked up and out with the borrower — the loan the extension hangs off."""
    r = request_loan(borrower, units[0]["resourceKey"], soon(1), bkk(3, 17))
    if not r:
        return None
    if r.get("status") == "pending":
        approve(supervisor, r["reservationKey"])
    usage = allocate(staff, r["reservationKey"])
    if usage:
        staff.mutate("loan.confirmPickup", {"usageKey": usage})
    note("L1 active loan", {"reservationKey": r["reservationKey"], "usageKey": usage, "unit": units[0].get("serialNo")})
    return usage


def l2_awaiting_approval(borrower: Client, scope_units: list[dict]) -> None:
    """A T2 request left pending, so the supervisor's queue has one to decide live."""
    r = request_loan(borrower, scope_units[0]["resourceKey"], bkk(1, 9), bkk(3, 17))
    note("L2 awaiting approval", {"reservationKey": (r or {}).get("reservationKey"), "status": (r or {}).get("status")})


def l3_to_prepare(borrower: Client, supervisor: Client, camera_units: list[dict]) -> None:
    """Approved but nothing set aside yet — the staff "to prepare" bucket."""
    r = request_loan(borrower, camera_units[0]["resourceKey"], bkk(1, 10), bkk(4, 17))
    if not r:
        return
    if r.get("status") == "pending":
        approve(supervisor, r["reservationKey"])
    note("L3 to prepare", {"reservationKey": r["reservationKey"]})


def l4_to_handover(borrower: Client, staff: Client, supervisor: Client, jumper_units: list[dict]) -> None:
    """Set aside, waiting for the borrower to walk in."""
    r = request_loan(borrower, jumper_units[0]["resourceKey"], soon(2), bkk(2, 17))
    if not r:
        return
    if r.get("status") == "pending":
        approve(supervisor, r["reservationKey"])
    usage = allocate(staff, r["reservationKey"])
    note("L4 to hand over", {"reservationKey": r["reservationKey"], "usageKey": usage})


def l5_to_inspect(borrower: Client, staff: Client, supervisor: Client, units: list[dict]) -> None:
    """Back on the shelf, not yet graded — the inspection backlog."""
    r = request_loan(borrower, units[1]["resourceKey"], soon(1), soon(4))
    if not r:
        return
    if r.get("status") == "pending":
        approve(supervisor, r["reservationKey"])
    usage = allocate(staff, r["reservationKey"])
    if usage:
        staff.mutate("loan.confirmPickup", {"usageKey": usage})
        staff.mutate("loan.recordReturn", {"usageKey": usage})
    note("L5 to inspect", {"reservationKey": r["reservationKey"], "usageKey": usage})


def l6_penalty_and_appeal(borrower: Client, staff: Client, supervisor: Client, admin: Client, units: list[dict]) -> None:
    """A finished loan graded B1, the credit it cost, and an appeal awaiting a ruling.

    The inspector is the supervisor, not the staff member who prepared it:
    FR-RTN-04 refuses a T2 preparer inspecting their own preparation, and using
    a second person here keeps the demo path identical for every tier.
    """
    r = request_loan(borrower, units[2]["resourceKey"], soon(1), soon(3))
    if not r:
        return
    if r.get("status") == "pending":
        approve(supervisor, r["reservationKey"])
    usage = allocate(staff, r["reservationKey"])
    if not usage:
        return
    staff.mutate("loan.confirmPickup", {"usageKey": usage})
    staff.mutate("loan.recordReturn", {"usageKey": usage})
    graded = supervisor.mutate(
        "inspection.create",
        {"usageKey": usage, "level": "B1", "note": "มีรอยขีดข่วนที่ปากวัด ใช้งานได้ปกติ"},
    )
    if not graded.ok:
        fail(f"inspection.create: {graded.error}")

    credit = borrower.query("credit.me")
    appealable = borrower.query("appeal.appealable", {"limit": 10})
    penalties = rows(appealable.data)
    appeal_key = None
    if penalties:
        filed = borrower.mutate(
            "appeal.create",
            {
                "penaltyKey": penalties[0]["penaltyKey"],
                "appealReason": "รอยขีดข่วนมีอยู่ก่อนรับของ มีภาพตอนรับยืนยัน ขอให้ทบทวนการหักเครดิต",
            },
        )
        if filed.ok:
            appeal_key = (filed.data or {}).get("appealKey")
        else:
            fail(f"appeal.create: {filed.error}")
    else:
        fail("no appealable penalty after B1 — inspection may not have deducted credit")

    note(
        "L6 penalty + appeal",
        {
            "usageKey": usage,
            "creditNow": (credit.data or {}).get("creditScore") or (credit.data or {}).get("score"),
            "appealKey": appeal_key,
        },
    )


def r1_room(borrower: Client, staff: Client) -> None:
    """A T3 room plus one booking tomorrow.

    The Eligibility write is the known gap: no procedure opens a room for
    borrowing, so a freshly registered room answers NOT_ELIGIBLE to every
    booking until the rows are written directly (docs/web-audit.tex F03).
    """
    group = staff.query("item.listManagementGroups")
    group_key = rows(group.data)[0]["id"]
    room = staff.mutate(
        "item.createRoom",
        {
            "manageGroupKey": group_key,
            "name": ROOM_NAME,
            "location": "อาคาร 7 ชั้น 6",
            "description": "ห้องปฏิบัติการ 30 ที่นั่ง พร้อมโปรเจกเตอร์",
            "capacity": 30,
        },
    )
    if not room.ok:
        fail(f"item.createRoom: {room.error}")
        return
    resource_key = (room.data or {}).get("resourceKey")
    open_room_in_db(resource_key)

    # Two different keys are in play: the Eligibility rows above hang off
    # ResourceKey, while every room procedure takes RoomInfo.RoomKey — which is
    # what `item.listRooms` returns as `id`, and the only place to read it from.
    listed = borrower.query("item.listRooms", {"limit": 50})
    room_key = next((r["id"] for r in rows(listed.data) if r.get("name") == ROOM_NAME), None)
    if room_key is None:
        fail("room registered but not listed — cannot book it")
        return

    # Ask the server which chips exist rather than assuming 07:00 + n*30min:
    # the lunch break makes 11:30 and 13:00 neighbours in the list.
    day = (datetime.now(BKK) + timedelta(days=1)).strftime("%Y-%m-%d")
    grid = borrower.query("item.roomAvailability", {"roomKey": room_key, "date": day})
    slots = rows(grid.data) or (grid.data or {}).get("slots") or []
    wanted = [s["index"] for s in slots if str(s.get("start", "")) in ("10:00", "10:30")]
    if not wanted:
        wanted = [6, 7]
    booking = borrower.mutate(
        "loan.createRoomBooking",
        {"roomKey": room_key, "date": day, "slots": wanted, "reason": "ประชุมกลุ่มโครงงาน"},
    )
    if not booking.ok:
        fail(f"loan.createRoomBooking: {booking.error}")
    note("R1 room", {"roomKey": room_key, "resourceKey": resource_key, "date": day, "slots": wanted, "booked": booking.ok})


def open_room_in_db(resource_key: int) -> None:
    """DB workaround: the Eligibility rows no procedure can write for a room."""
    sql = (
        'INSERT INTO "Eligibility" ("GroupKey","ResourceKey","RoleKey") '
        'SELECT g."ManageGroupKey", %d, r."AuthorityRoleKey" '
        'FROM "ManagementGroup" g CROSS JOIN "AuthorityRole" r ON CONFLICT DO NOTHING;' % resource_key
    )
    out = subprocess.run(
        ["docker", "exec", "-i", PG_CONTAINER, "psql", "-U", "postgres", "-d", DEMO_DB, "-tAc", sql],
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        fail(f"room eligibility workaround failed: {out.stderr.strip()}")



def x2_t2_loan_and_extension(borrower: Client, staff: Client, supervisor: Client, scope_units: list[dict]) -> None:
    """A T2 loan out with the borrower, and an extension on it awaiting a decision.

    The T0 extension in x1 is auto-approved — a D0 borrower on a T0 item gets
    it without asking anyone, which is the rule working, but it leaves the
    extension desk empty. T2 routes to a person, so this is the one that puts
    a row on the screen that reviews extensions.
    """
    r = request_loan(borrower, scope_units[1]["resourceKey"], soon(1), bkk(3, 17))
    if not r:
        return
    if r.get("status") == "pending":
        approve(supervisor, r["reservationKey"])
    usage = allocate(staff, r["reservationKey"])
    if not usage:
        return
    staff.mutate("loan.confirmPickup", {"usageKey": usage})

    options = borrower.query("loan.extensionOptions", {"usageKey": usage})
    data = options.data or {}
    if not data.get("canRequest"):
        note("X2 T2 extension", {"usageKey": usage, "skipped": data.get("blockedBy") or options.error})
        return
    current = datetime.fromisoformat(data["currentDueAt"].replace("Z", "+00:00"))
    requested = min(current + timedelta(days=2),
                    datetime.fromisoformat(data["maxRequestedDueAt"].replace("Z", "+00:00")))
    asked = borrower.mutate(
        "loan.requestExtension",
        {
            "usageKey": usage,
            "requestedDueAt": requested.isoformat().replace("+00:00", "Z"),
            "reason": "ต้องใช้วัดสัญญาณต่ออีกสองวัน ยังทดลองไม่จบ",
        },
    )
    status = None
    if asked.ok:
        mine = borrower.query("loan.myExtensions", {"limit": 10})
        for row in rows(mine.data):
            if row.get("usageKey") == usage:
                status = {"status": row.get("status"), "route": row.get("route")}
    else:
        fail(f"loan.requestExtension (T2): {asked.error}")
    note("X2 T2 loan + extension", {"usageKey": usage, "extension": status})


def x1_extension(borrower: Client, usage_key: int | None) -> None:
    """An extension request waiting on a desk, asked for the way the UI asks."""
    if not usage_key:
        return
    options = borrower.query("loan.extensionOptions", {"usageKey": usage_key})
    data = options.data or {}
    if not data.get("canRequest"):
        note("X1 extension", {"skipped": data.get("blockedBy") or options.error})
        return
    # Three days rather than the band's maximum: the reason on screen says
    # three days, and a request for the longest extension the rules allow makes
    # the demo look like a stress test instead of an ordinary one.
    current = datetime.fromisoformat(data["currentDueAt"].replace("Z", "+00:00"))
    requested = min(current + timedelta(days=3),
                    datetime.fromisoformat(data["maxRequestedDueAt"].replace("Z", "+00:00")))
    requested_iso = requested.isoformat().replace("+00:00", "Z")
    asked = borrower.mutate(
        "loan.requestExtension",
        {
            "usageKey": usage_key,
            "requestedDueAt": requested_iso,
            "reason": "งานทดลองเลื่อนไปสัปดาห์หน้า ขอยืมต่ออีก 3 วัน",
        },
    )
    if not asked.ok:
        fail(f"loan.requestExtension: {asked.error}")
    outcome = None
    if asked.ok:
        mine = borrower.query("loan.myExtensions", {"limit": 10})
        for row in rows(mine.data):
            if row.get("usageKey") == usage_key:
                outcome = {"status": row.get("status"), "route": row.get("route"), "dueAt": row.get("dueAt")}
    note("X1 extension", {"usageKey": usage_key, "requestedDueAt": requested_iso, "outcome": outcome})


# ── entry point ─────────────────────────────────────────────────────────────


def already_prepared(borrower: Client) -> bool:
    listed = borrower.query("loan.list", {"limit": 5})
    return bool(rows(listed.data))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="run even if the database already has loans")
    args = parser.parse_args()

    print(f"backend  : {API}")
    print(f"database : {DEMO_DB}")

    borrower = Client("borrower")
    staff = Client("staff")
    supervisor = Client("supervisor")
    admin = Client("admin")

    if already_prepared(borrower) and not args.force:
        print("\nThis database already has loans. A second run doubles every queue "
              "instead of updating it — reset and seed first, or pass --force.")
        return 1

    items = catalogue(borrower)
    missing = [name for name in (CALIPER, JUMPERS, SCOPE, CAMERA) if name not in items]
    if missing:
        print(f"\nSeeded catalogue is incomplete, missing: {missing}. Run `npm run seed` first.")
        return 1

    calipers = units_of(staff, items[CALIPER])
    jumpers = units_of(staff, items[JUMPERS])
    scopes = units_of(staff, items[SCOPE])
    cameras = units_of(staff, items[CAMERA])
    if len(calipers) < 3:
        print(f"\nExpected at least 3 caliper units from the seed, found {len(calipers)}.")
        return 1

    print("\npreparing demo state")
    active_usage = l1_active_loan(borrower, staff, supervisor, calipers)
    l2_awaiting_approval(borrower, scopes)
    l3_to_prepare(borrower, supervisor, cameras)
    l4_to_handover(borrower, staff, supervisor, jumpers)
    l5_to_inspect(borrower, staff, supervisor, calipers)
    l6_penalty_and_appeal(borrower, staff, supervisor, admin, calipers)
    r1_room(borrower, staff)
    x1_extension(borrower, active_usage)
    x2_t2_loan_and_extension(borrower, staff, supervisor, scopes)

    counts = staff.query("loan.queueCounts")
    approvals = supervisor.query("approval.counts")
    state["queues"] = {"staff": counts.data, "approval": approvals.data}
    OUT.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\nqueues now")
    print(f"  staff    : {counts.data}")
    print(f"  approval : {approvals.data}")
    print(f"\nwrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
