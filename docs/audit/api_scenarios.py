"""Evidence collector for the ULMs web audit (docs/web-audit.tex).

Drives the real backend over HTTP (tRPC, no batching) as the four seeded test
accounts and records every call - input, HTTP status, result or error - so each
finding in the audit document can point at a measured response rather than at
a reading of the code.

Scenarios (IDs match section 3 of the audit plan):

* S1 availability counters - walk one T1 loan through every state and read the
  three places that report "available units" after each step (F04).
* S2 overlapping windows - one-unit item, a second borrower asking for the same,
  adjacent and disjoint windows (F04, F09).
* S3 T3 rooms - on-grid, off-grid, too long, cross-day and clashing bookings
  (F02, F03, F10).
* S4 handover and photos - T2 loan: allocate a different serial than approved,
  swap a T2, borrower calling staff actions, photo counts at inspection,
  preparer inspecting their own preparation (F05, F12, F13).
* S5 registration - createUnit with and without serials per tier (F06).

Every number quoted in the audit document comes from results/*.json. Run it on
a freshly seeded database; re-running on the same database creates new item
types (names carry a run id) so it does not collide, but counts of rows that
already exist will differ.

Run (backend on :3000, see the document's appendix for the database reset):
    python3 docs/audit/api_scenarios.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

API = "http://localhost:3000/trpc"
# Only S3 touches the database directly: no procedure can open a room for
# borrowing (item.setEligibility is keyed by item type), so the slot rules are
# unreachable without it. Every such write is recorded as a "DB workaround" call.
AUDIT_DB = os.environ.get("AUDIT_DB", "ulms_audit")
PG_CONTAINER = os.environ.get("PG_CONTAINER", "postgres")
RESULTS = Path(__file__).resolve().parent / "results"
BKK = timezone(timedelta(hours=7))
RUN_ID = datetime.now(BKK).strftime("%m%d%H%M")

ACCOUNTS = {
    "borrower": ("test_borrower", "borrower1234"),
    "staff": ("test_staff", "staff1234"),
    "supervisor": ("test_supervisor", "supervisor1234"),
    "admin": ("test_admin", "admin1234"),
}


@dataclass
class Call:
    step: str
    actor: str
    procedure: str
    input: Any
    status: int
    ok: bool
    data: Any = None
    error: Any = None


@dataclass
class Recorder:
    """Collects calls for one scenario and writes them to results/<name>.json."""

    name: str
    calls: list[Call] = field(default_factory=list)
    notes: dict[str, Any] = field(default_factory=dict)

    def save(self) -> None:
        RESULTS.mkdir(parents=True, exist_ok=True)
        out = {
            "scenario": self.name,
            "run_id": RUN_ID,
            "recorded_at": datetime.now(BKK).isoformat(timespec="seconds"),
            "notes": self.notes,
            "calls": [c.__dict__ for c in self.calls],
        }
        path = RESULTS / f"{self.name}.json"
        path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  wrote {path.relative_to(RESULTS.parent.parent)} ({len(self.calls)} calls)")


class Client:
    """One logged-in session per role; the session cookie lives in requests.Session."""

    def __init__(self, role: str, rec: Recorder | None = None):
        self.role = role
        self.http = requests.Session()
        self.rec = rec
        user, password = ACCOUNTS[role]
        self.mutate("auth.login", {"username": user, "password": password}, step="login")

    def _record(self, step: str, proc: str, payload: Any, resp: requests.Response) -> Call:
        try:
            body = resp.json()
        except ValueError:
            body = {"raw": resp.text[:500]}
        ok = resp.ok and "result" in body
        call = Call(
            step=step,
            actor=self.role,
            procedure=proc,
            input=payload,
            status=resp.status_code,
            ok=ok,
            data=body.get("result", {}).get("data") if ok else None,
            # Keep only what identifies the failure; stack traces bloat the evidence.
            error=None if ok else _slim_error(body),
        )
        if self.rec is not None and step != "login":
            self.rec.calls.append(call)
        return call

    def query(self, proc: str, payload: Any = None, step: str = "") -> Call:
        url = f"{API}/{proc}"
        if payload is not None:
            url += "?input=" + urllib.parse.quote(json.dumps(payload))
        return self._record(step or proc, proc, payload, self.http.get(url, timeout=30))

    def mutate(self, proc: str, payload: Any, step: str = "") -> Call:
        resp = self.http.post(f"{API}/{proc}", json=payload, timeout=30)
        return self._record(step or proc, proc, payload, resp)


def _slim_error(body: dict[str, Any]) -> Any:
    err = body.get("error", body)
    if not isinstance(err, dict):
        return err
    data = err.get("data") or {}
    return {
        "message": err.get("message"),
        "code": data.get("code"),
        "httpStatus": data.get("httpStatus"),
        # Domain codes (ITEM_UNAVAILABLE, ...) travel in different keys depending
        # on the thrower, so keep every small field the server sent.
        "detail": {k: v for k, v in data.items() if k not in ("stack", "path", "code", "httpStatus")},
    }


def rows(data: Any) -> list[Any]:
    """Unwrap a paginated result regardless of the envelope key."""
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


# ── shared setup ────────────────────────────────────────────────────────────


def first_group(staff: Client) -> int:
    groups = staff.query("item.listManagementGroups", step="setup: groups").data or []
    g = groups[0]
    return g.get("id") or g.get("manageGroupKey") or g.get("ManageGroupKey")


def register_type(staff: Client, name: str, weight: float, tier: str, qty: int, serial: str | None) -> tuple[int, list[int]]:
    t = staff.mutate("item.createType", {"name": name, "creditWeight": weight}, step=f"setup: createType {name}")
    item_key = t.data["id"] if t.data and "id" in t.data else t.data.get("itemKey")
    payload: dict[str, Any] = {"itemKey": item_key, "manageGroupKey": first_group(staff), "tier": tier, "quantity": qty}
    if serial:
        payload["serialNo"] = serial
    u = staff.mutate("item.createUnit", payload, step=f"setup: createUnit {name} x{qty}")
    open_type(staff, item_key, name)
    return item_key, [unit["resourceKey"] for unit in (u.data or [])]


def open_type(staff: Client, item_key: int, name: str) -> Call:
    """Allow every (group, authority role) pair to borrow a type - what the seed does for its items.

    A freshly registered type answers NOT_ELIGIBLE / NO_RULES_CONFIGURED to
    every request until this runs, so registration is really three calls.
    """
    groups = staff.query("item.listManagementGroups", step="setup: groups").data or []
    roles = staff.query("item.listAuthorityRoles", step="setup: authority roles").data or []
    rules = [{"groupKey": g["id"], "authorityRoleKey": r["authorityRoleKey"]} for g in groups for r in roles]
    return staff.mutate("item.setEligibility", {"itemKey": item_key, "rules": rules}, step=f"setup: setEligibility {name}")


def db_open_room(resource_key: int, rec: Recorder) -> None:
    """DB workaround: write the eligibility rows no procedure can write for a room."""
    sql = (
        'INSERT INTO "Eligibility" ("GroupKey","ResourceKey","RoleKey") '
        'SELECT g."ManageGroupKey", %d, r."AuthorityRoleKey" FROM "ManagementGroup" g CROSS JOIN "AuthorityRole" r '
        "ON CONFLICT DO NOTHING;" % resource_key
    )
    out = subprocess.run(
        ["docker", "exec", "-i", PG_CONTAINER, "psql", "-U", "postgres", "-d", AUDIT_DB, "-tAc", sql],
        capture_output=True, text=True,
    )
    rec.calls.append(Call(step="DB workaround: insert room eligibility", actor="sql", procedure="psql",
                          input=sql, status=0 if out.returncode == 0 else 1, ok=out.returncode == 0,
                          data=out.stdout.strip(), error=out.stderr.strip() or None))


def counters(label: str, item_key: int, borrower: Client, staff: Client, rec: Recorder) -> dict[str, Any]:
    """Read every place that reports available units for one item type."""
    avail = borrower.query("item.getAvailability", {"id": item_key}, step=f"{label}: getAvailability")
    listed = borrower.query("item.list", {"limit": 50}, step=f"{label}: item.list")
    managed = staff.query("item.listManaged", {"limit": 50}, step=f"{label}: item.listManaged")

    def pick(data: Any) -> int | None:
        for row in rows(data):
            if row.get("id") == item_key or row.get("itemKey") == item_key:
                return row.get("availableUnits")
        return None

    snap = {
        "step": label,
        "borrower_getAvailability": (avail.data or {}).get("availableUnits"),
        "borrower_item_list": pick(listed.data),
        "staff_listManaged": pick(managed.data),
        "total": (avail.data or {}).get("totalUnits"),
    }
    rec.notes.setdefault("counter_table", []).append(snap)
    return snap


def created_request(call: Call) -> dict[str, Any] | None:
    created = (call.data or {}).get("created") or []
    return created[0] if created else None


def usage_for(staff: Client, reservation_key: int, bucket: str, step: str) -> int | None:
    q = staff.query("loan.staffQueue", {"bucket": bucket, "limit": 50}, step=step)
    for row in rows(q.data):
        if row.get("reservationKey") == reservation_key:
            return row.get("usageKey")
    return None


# ── scenarios ───────────────────────────────────────────────────────────────


def s1_counters() -> None:
    rec = Recorder("s1_counters")
    borrower, staff = Client("borrower", rec), Client("staff", rec)
    item_key, units = register_type(staff, f"AUDIT-S1 กล้อง T1 {RUN_ID}", 5, "T1", 3, f"S1-{RUN_ID}")
    rec.notes.update(item_key=item_key, units=units)
    counters("0 registered", item_key, borrower, staff, rec)

    # A request for next week must not move today's counters.
    future = borrower.mutate(
        "loan.create",
        {"startTime": bkk(7, 8), "endTime": bkk(9, 17), "lines": [{"resourceKey": units[2]}]},
        step="future request (next week)",
    )
    rec.notes["future_request"] = created_request(future)
    counters("0b future request placed", item_key, borrower, staff, rec)

    req = borrower.mutate(
        "loan.create",
        {"startTime": bkk(0, 13), "endTime": bkk(2, 17), "lines": [{"resourceKey": units[0]}]},
        step="request (today, 2 days)",
    )
    r = created_request(req)
    rec.notes["request"] = r or (req.data or req.error)
    counters("1 requested", item_key, borrower, staff, rec)
    if not r:
        rec.save()
        return
    res_key = r.get("reservationKey") or r.get("id")
    if r.get("status") == "pending":
        Client("supervisor", rec).mutate("approval.decide", {"reservationKey": res_key, "decision": "approve"}, step="approve")
    counters("2 approved", item_key, borrower, staff, rec)

    alloc = staff.mutate("loan.allocate", {"reservationKey": res_key}, step="allocate (prepare)")
    usage = (alloc.data or {}).get("usageKey")
    counters("3 prepared", item_key, borrower, staff, rec)
    if usage:
        staff.mutate("loan.confirmPickup", {"usageKey": usage}, step="confirmPickup (handover)")
        counters("4 handed over", item_key, borrower, staff, rec)
        staff.mutate("loan.recordReturn", {"usageKey": usage}, step="recordReturn")
        counters("5 returned", item_key, borrower, staff, rec)
        subject = staff.query("inspection.getById", {"usageKey": usage}, step="inspection subject (photo counts)")
        rec.notes["inspection_subject"] = subject.data or subject.error
        # The borrower-side page offers no return photo; the staff call takes none.
        staff.mutate("inspection.create", {"usageKey": usage, "level": "B0"}, step="inspection.create B0")
        counters("6 inspected", item_key, borrower, staff, rec)
    rec.save()


def s2_overlap() -> None:
    rec = Recorder("s2_overlap")
    borrower, staff = Client("borrower", rec), Client("staff", rec)
    item_key, units = register_type(staff, f"AUDIT-S2 ของชิ้นเดียว T1 {RUN_ID}", 5, "T1", 1, f"S2-{RUN_ID}")
    unit = units[0]
    rec.notes.update(item_key=item_key, unit=unit)

    first = borrower.mutate(
        "loan.create", {"startTime": bkk(3, 8), "endTime": bkk(5, 17), "lines": [{"resourceKey": unit}]},
        step="A: borrower day+3..day+5",
    )
    rec.notes["A"] = created_request(first) or first.data or first.error
    counters("after A (future window)", item_key, borrower, staff, rec)

    # staff can borrow too (FR-AUTH-04), so it plays the second borrower.
    cases = {
        "B same window": (bkk(3, 8), bkk(5, 17)),
        "C overlaps last day": (bkk(5, 8), bkk(7, 17)),
        "D starts day after A ends": (bkk(6, 8), bkk(8, 17)),
        "E a week later": (bkk(12, 8), bkk(14, 17)),
    }
    outcome = {}
    for label, (start, end) in cases.items():
        c = staff.mutate("loan.create", {"startTime": start, "endTime": end, "lines": [{"resourceKey": unit}]}, step=label)
        made = created_request(c)
        rejected = (c.data or {}).get("rejected") or []
        outcome[label] = made.get("status") if made else (rejected[0]["code"] if rejected else (c.error or {}).get("message"))
    rec.notes["outcome"] = outcome
    rec.save()


def s3_rooms() -> None:
    rec = Recorder("s3_rooms")
    borrower, staff = Client("borrower", rec), Client("staff", rec)
    room = staff.mutate(
        "item.createRoom",
        {"manageGroupKey": first_group(staff), "name": f"AUDIT ห้อง 7603 {RUN_ID}", "location": "ตึก 7"},
        step="setup: createRoom",
    )
    rk = (room.data or {}).get("resourceKey")
    rec.notes["room"] = room.data or room.error
    rec.notes["room_fields"] = sorted((room.data or {}).keys())
    listed = borrower.query("item.listRooms", {"limit": 50}, step="borrower listRooms")
    rec.notes["listRooms_fields"] = sorted(rows(listed.data)[0].keys()) if rows(listed.data) else None

    before = borrower.mutate(
        "loan.create", {"startTime": bkk(1, 8), "endTime": bkk(1, 8, 30), "lines": [{"resourceKey": rk}]},
        step="R0 book a freshly registered room (no API can open it)",
    )
    rejected = (before.data or {}).get("rejected") or []
    rec.notes["R0_fresh_room"] = rejected[0] if rejected else (created_request(before) or before.error)
    db_open_room(rk, rec)

    cases = {
        "R1 tomorrow 09:00-09:30 (1 slot)": (bkk(1, 9), bkk(1, 9, 30)),
        "R2 tomorrow 09:15-09:45 (off grid, overlaps R1)": (bkk(1, 9, 15), bkk(1, 9, 45)),
        "R3 tomorrow 13:10-13:40 (off grid)": (bkk(1, 13, 10), bkk(1, 13, 40)),
        # Clear of R1/R3 so a refusal can only come from the length rule.
        "R4 tomorrow 14:00-17:30 (7 slots)": (bkk(1, 14), bkk(1, 17, 30)),
        "R4b in 2 days 09:00-12:00 (6 slots, the agreed maximum)": (bkk(2, 9), bkk(2, 12)),
        "R5 tomorrow 22:00 to day after 01:00 (cross-day)": (bkk(1, 22), bkk(2, 1)),
        "R6 in 5 days 09:00-10:00 (advance booking)": (bkk(5, 9), bkk(5, 10)),
        "R7 tomorrow 09:00-09:30 again (clash with R1)": (bkk(1, 9), bkk(1, 9, 30)),
    }
    outcome = {}
    for label, (start, end) in cases.items():
        actor = staff if label.startswith("R7") else borrower
        c = actor.mutate("loan.create", {"startTime": start, "endTime": end, "lines": [{"resourceKey": rk}]}, step=label)
        made = created_request(c)
        rejected = (c.data or {}).get("rejected") or []
        outcome[label] = made.get("status") if made else (rejected[0]["code"] if rejected else (c.error or {}).get("message"))
    rec.notes["outcome"] = outcome
    rec.save()


def s4_handover() -> None:
    rec = Recorder("s4_handover")
    borrower, staff = Client("borrower", rec), Client("staff", rec)
    supervisor, admin = Client("supervisor", rec), Client("admin", rec)
    item_key, units = register_type(staff, f"AUDIT-S4 ออสซิลโลสโคป T2 {RUN_ID}", 10, "T2", 1, f"S4A-{RUN_ID}")
    t2 = staff.mutate(
        "item.createUnit",
        {"itemKey": item_key, "manageGroupKey": first_group(staff), "tier": "T2", "serialNo": f"S4B-{RUN_ID}"},
        step="setup: second T2 serial",
    )
    units += [u["resourceKey"] for u in (t2.data or [])]
    rec.notes.update(item_key=item_key, units=units)

    req = borrower.mutate(
        "loan.create", {"startTime": bkk(0, 13), "endTime": bkk(2, 17), "lines": [{"resourceKey": units[0]}]},
        step="borrower requests serial A",
    )
    r = created_request(req)
    rec.notes["request"] = r or req.data or req.error
    if not r:
        rec.save()
        return
    res_key = r.get("reservationKey") or r.get("id")
    staff.mutate("approval.decide", {"reservationKey": res_key, "decision": "approve"}, step="staff approves T2 (expect 403)")
    supervisor.mutate("approval.decide", {"reservationKey": res_key, "decision": "approve"}, step="supervisor approves serial A")

    borrower.mutate("image.requestUpload", {"purpose": "inspection", "contentType": "image/jpeg", "sizeBytes": 1000},
                    step="borrower asks for photo upload (expect 403)")
    alloc = staff.mutate("loan.allocate", {"reservationKey": res_key, "resourceKey": units[1]},
                         step="allocate with serial B instead of approved A")
    usage = (alloc.data or {}).get("usageKey")
    rec.notes["allocated_serial"] = (alloc.data or {}).get("serialNo")
    if usage:
        staff.mutate("loan.swapUnit", {"usageKey": usage, "resourceKey": units[0]}, step="swapUnit on T2 (expect refused)")
        borrower.mutate("loan.confirmPickup", {"usageKey": usage}, step="borrower confirmPickup (expect 403)")
        staff.mutate("loan.confirmPickup", {"usageKey": usage}, step="staff confirmPickup")
        staff.mutate("loan.recordReturn", {"usageKey": usage}, step="staff recordReturn (no photo field)")
        subject = staff.query("inspection.getById", {"usageKey": usage}, step="inspection subject")
        rec.notes["inspection_subject"] = subject.data or subject.error
        staff.mutate("inspection.create", {"usageKey": usage, "level": "B0"}, step="preparer inspects own T2 (expect refused)")
        admin.mutate("inspection.create", {"usageKey": usage, "level": "B0"}, step="admin inspects")
    rec.save()


def s5_registration() -> None:
    rec = Recorder("s5_registration")
    staff = Client("staff", rec)
    group = first_group(staff)
    for tier, qty, serial in [("T0", 5, None), ("T1", 5, None), ("T1", 5, "S5-T1"), ("T2", 2, "S5-T2"), ("T2", 1, "S5-T2B")]:
        name = f"AUDIT-S5 {tier} qty{qty} {'serial' if serial else 'noserial'} {RUN_ID}"
        t = staff.mutate("item.createType", {"name": name, "creditWeight": 5}, step=f"createType {name}")
        key = (t.data or {}).get("id")
        payload: dict[str, Any] = {"itemKey": key, "manageGroupKey": group, "tier": tier, "quantity": qty}
        if serial:
            payload["serialNo"] = f"{serial}-{RUN_ID}"
        u = staff.mutate("item.createUnit", payload, step=f"createUnit {tier} x{qty} serial={bool(serial)}")
        rec.notes.setdefault("outcome", {})[f"{tier} x{qty} serial={bool(serial)}"] = (
            [x["serialNo"] for x in u.data] if u.ok else (u.error or {}).get("message")
        )
    borrower = Client("borrower", rec)

    # "เพิ่มจำนวนชิ้น": units added after eligibility was set - do they inherit it?
    name = f"AUDIT-S5 T0 top-up {RUN_ID}"
    t = staff.mutate("item.createType", {"name": name, "creditWeight": 0}, step=f"createType {name}")
    key = (t.data or {}).get("id")
    staff.mutate("item.createUnit", {"itemKey": key, "manageGroupKey": group, "tier": "T0", "quantity": 2}, step="createUnit T0 x2")
    open_type(staff, key, name)
    extra = staff.mutate("item.createUnit", {"itemKey": key, "manageGroupKey": group, "tier": "T0", "quantity": 3},
                         step="top-up: createUnit T0 x3 after eligibility")
    rec.notes["topup_T0"] = [x["serialNo"] for x in extra.data] if extra.ok else (extra.error or {}).get("message")

    # Same question for T1, where the caller can pick a fresh serial base.
    name = f"AUDIT-S5 T1 top-up {RUN_ID}"
    t = staff.mutate("item.createType", {"name": name, "creditWeight": 5}, step=f"createType {name}")
    key = (t.data or {}).get("id")
    staff.mutate("item.createUnit", {"itemKey": key, "manageGroupKey": group, "tier": "T1", "quantity": 2,
                                     "serialNo": f"TOP-A-{RUN_ID}"}, step="createUnit T1 x2 (base A)")
    open_type(staff, key, name)
    extra = staff.mutate("item.createUnit", {"itemKey": key, "manageGroupKey": group, "tier": "T1", "quantity": 3,
                                             "serialNo": f"TOP-B-{RUN_ID}"}, step="top-up: createUnit T1 x3 (base B) after eligibility")
    new_unit = (extra.data or [{}])[0].get("resourceKey") if extra.ok else None
    if new_unit:
        c = borrower.mutate("loan.create", {"startTime": bkk(1, 8), "endTime": bkk(2, 17), "lines": [{"resourceKey": new_unit}]},
                            step="borrow a topped-up T1 unit")
        made, rej = created_request(c), (c.data or {}).get("rejected") or []
        rec.notes["topup_T1_unit_borrow"] = made.get("status") if made else (rej[0] if rej else c.error)

    borrower.mutate("item.createType", {"name": f"AUDIT-S5 by borrower {RUN_ID}", "creditWeight": 0},
                    step="borrower createType (expect 403)")
    rec.save()


SCENARIOS = {"s1": s1_counters, "s2": s2_overlap, "s3": s3_rooms, "s4": s4_handover, "s5": s5_registration}

if __name__ == "__main__":
    chosen = sys.argv[1:] or list(SCENARIOS)
    for key in chosen:
        print(f"[{key}] {SCENARIOS[key].__name__}")
        started = time.time()
        SCENARIOS[key]()
        print(f"  {time.time() - started:.1f}s")
