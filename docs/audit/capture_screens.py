"""Screenshots for the ULMs web audit (docs/web-audit.tex).

Sets up the data each screen needs through the real API (a T1 loan waiting at
the counter, a returned loan waiting for inspection, a T2 request waiting for a
supervisor), then signs in as each role in Firefox and captures the pages the
audit findings talk about. Elements a finding points at are outlined in orange
before the shot, so the figure shows the exact control under discussion.

Output: docs/figures/audit/<name>.jpg plus docs/audit/results/screens.json
(what was captured, which outline selectors matched, any page that failed).

Run (backend :3000 and frontend :5173 up, after api_scenarios.py):
    python3 docs/audit/capture_screens.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, Page, sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from api_scenarios import ACCOUNTS, BKK, Client, bkk, created_request, rows  # noqa: E402

WEB = "http://localhost:5173"
OUT = Path(__file__).resolve().parent.parent / "figures" / "audit"
RESULTS = Path(__file__).resolve().parent / "results"
OUTLINE = "#D55E00"  # Okabe-Ito vermillion, the audit document's "problem" colour


def setup_data() -> dict[str, Any]:
    """Put one row in every queue the screenshots need. Uses the seeded catalogue."""
    borrower, staff = Client("borrower"), Client("staff")
    items = rows(borrower.query("item.list", {"limit": 50}).data)
    by_tier = {row.get("tier"): row for row in items if not str(row.get("name", "")).startswith("AUDIT")}
    info: dict[str, Any] = {"items": {t: r["id"] for t, r in by_tier.items() if t}}

    info["names"] = {t: r["name"] for t, r in by_tier.items() if t}

    def free_unit(item_id: int) -> int | None:
        # item.listUnits calls the unit's resource key `id` (item.createUnit calls it `resourceKey`).
        units = borrower.query("item.listUnits", {"id": item_id}).data or []
        for unit in units:
            if unit.get("status") == "InStorage" and unit.get("allowBorrow"):
                return unit.get("id")
        return None

    # T1 at the counter: approved automatically, prepared by staff, not yet collected.
    if "T1" in by_tier:
        made = created_request(borrower.mutate("loan.create", {
            "startTime": bkk(0, 16), "endTime": bkk(2, 17), "lines": [{"resourceKey": free_unit(by_tier["T1"]["id"])}]}))
        if made:
            alloc = staff.mutate("loan.allocate", {"reservationKey": made["reservationKey"]})
            info["t1_ready_usage"] = (alloc.data or {}).get("usageKey")

    # T0 returned, waiting for inspection.
    if "T0" in by_tier:
        made = created_request(borrower.mutate("loan.create", {
            "startTime": bkk(0, 16), "endTime": bkk(1, 17), "lines": [{"resourceKey": free_unit(by_tier["T0"]["id"])}]}))
        if made:
            usage = (staff.mutate("loan.allocate", {"reservationKey": made["reservationKey"]}).data or {}).get("usageKey")
            if usage:
                staff.mutate("loan.confirmPickup", {"usageKey": usage})
                staff.mutate("loan.recordReturn", {"usageKey": usage})
                info["t0_returned_usage"] = usage

    # T2 waiting for the supervisor.
    if "T2" in by_tier:
        made = created_request(borrower.mutate("loan.create", {
            "startTime": bkk(1, 8), "endTime": bkk(3, 17), "lines": [{"resourceKey": free_unit(by_tier["T2"]["id"])}]}))
        info["t2_pending_reservation"] = (made or {}).get("reservationKey")
    return info


def login(browser: Browser, role: str, width: int = 1440) -> Page:
    ctx = browser.new_context(viewport={"width": width, "height": 900}, locale="th-TH")
    page = ctx.new_page()
    page.goto(f"{WEB}/login")
    user, password = ACCOUNTS[role]
    page.locator("#m-local > button").first.click()
    page.fill("#loc-user", user)
    page.fill("#loc-pass", password)
    page.locator("#m-local button[type=submit]").click()
    page.wait_for_url(lambda url: "/login" not in url, timeout=15000)
    return page


def shot(page: Page, name: str, path: str, outline: list[str] | None = None,
         before: Any = None, log: list[dict[str, Any]] | None = None) -> None:
    entry: dict[str, Any] = {"name": name, "path": path, "outlined": {}}
    try:
        page.goto(f"{WEB}{path}")
        page.wait_for_load_state("networkidle", timeout=15000)
        if before:
            before(page)
            page.wait_for_timeout(600)
        for sel in outline or []:
            count = page.locator(sel).count()
            entry["outlined"][sel] = count
            if count:
                page.locator(sel).evaluate_all(
                    "(els, c) => els.forEach(e => { e.style.outline = `4px solid ${c}`; e.style.outlineOffset = '3px'; })",
                    OUTLINE,
                )
        page.screenshot(path=str(OUT / f"{name}.jpg"), type="jpeg", quality=82, full_page=True)
        entry["ok"] = True
    except Exception as exc:  # keep going; the log says which screen is missing
        entry["ok"], entry["error"] = False, str(exc)[:300]
    (log if log is not None else []).append(entry)
    print(f"  {'ok ' if entry.get('ok') else 'ERR'} {name} {entry.get('error', '')}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    info = setup_data()
    log: list[dict[str, Any]] = []
    with sync_playwright() as pw:
        browser = pw.firefox.launch()

        page = login(browser, "borrower")
        t1 = info["items"].get("T1")
        shot(page, "b-catalog", "/catalog", [":text-matches('ว่าง|available', 'i')"], log=log)
        if t1:
            shot(page, "b-detail-t1", f"/catalog/{t1}", [":text-matches('ว่าง|พร้อม', 'i')"], log=log)
        shot(page, "b-request", "/request", ["input[type=date]"], log=log)
        shot(page, "b-rooms", "/rooms", [":text-matches('ที่นั่ง|seats|ความจุ', 'i')"], log=log)
        # Rooms are mock data in the frontend; ids come from mock-data.ts `room()`.
        shot(page, "b-room-booking", "/rooms/room-fac-cad2/book", [":text-matches('ที่นั่ง|seats', 'i')"], log=log)
        shot(page, "b-pickup", "/pickup", [":text-matches('เปลี่ยน', 'i')", "input[type=file]"], log=log)
        shot(page, "b-my-loans", "/my/loans", log=log)
        page.context.close()

        mobile = login(browser, "borrower", width=400)
        shot(mobile, "b-request-mobile", "/request", log=log)
        mobile.context.close()

        page = login(browser, "staff")
        shot(page, "s-queue", "/staff", log=log)
        shot(page, "s-inventory", "/staff/inventory", log=log)
        t0_name = info.get("names", {}).get("T0", "")
        shot(page, "s-inspection", "/staff/inspection",
             before=lambda p: p.locator("section > button", has_text=t0_name).first.click(), log=log)
        shot(page, "s-handover-placeholder", "/staff/handover", log=log)
        page.context.close()

        page = login(browser, "supervisor")
        shot(page, "v-approvals", "/supervisor/approvals", log=log)
        shot(page, "v-appeals-mock", "/supervisor/appeals", log=log)
        shot(page, "v-export-placeholder", "/reports/export", log=log)
        page.context.close()

        page = login(browser, "admin")
        shot(page, "a-audit", "/admin/audit", log=log)
        page.context.close()
        browser.close()

    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "screens.json").write_text(
        json.dumps({"setup": info, "screens": log}, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
