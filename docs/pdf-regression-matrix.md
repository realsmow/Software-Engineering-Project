# PDF problem-to-test map

Source: the 20-page review PDF `เพิ่มหัวเรื่อง.pdf`, dated 19 September 2026. Pages 1, 14 and 19 are section headings. This map accounts for every problem described on the remaining pages. The PDF's suggested solutions are review proposals; the user's confirmed policy allows **partial acceptance** of a basket.

No application `src` files were changed. A regression test can prove a working behavior or reproduce an outstanding defect; adding tests does not itself fix that defect.

## Status

- **Verified**: passing assertions against application modules, database transactions or browser layout.
- **Known defect**: an executable Vitest `it.fails` or Playwright `test.fail` test checks the desired behavior and currently reproduces the defect. These cases run; they are not skipped. When the behavior is fixed, the runner reports an unexpected pass so the annotation must be removed.
- **Removed UI**: the obsolete control or sample-only presentation is absent and an assertion protects that outcome.

## Review coverage

| PDF page | Problem | Status | Automated evidence |
| --- | --- | --- | --- |
| 2 | Remaining loan days were not calculated | Verified | [borrower home/server actions](../frontend/tests/borrower/server-actions.test.tsx) checks Bangkok calendar days against the server due date. |
| 2 | Home text overflows its container | Verified | [browser layout](../tests/e2e/documents/pdf-layout.spec.ts) checks real viewport geometry with long Thai text at 390px and 1280px. |
| 3 | Notification rows overflow; long lists need scrolling | Verified | [browser layout](../tests/e2e/documents/pdf-layout.spec.ts) asserts no horizontal overflow, vertical scroll capacity and visibility of the final row. |
| 4 | Stock must describe the selected borrowing period | Verified | [catalog UI](../frontend/tests/equipment/catalog-and-inventory.test.tsx), [request window selection](../frontend/tests/borrower/request-window.test.tsx), and [backend window mapper](../backend/src/common/mappers/item.mapper.spec.ts). |
| 4 | “Most popular” actually sorts by unit count | Known defect | [catalog UI](../frontend/tests/equipment/catalog-and-inventory.test.tsx) swaps only inventory totals between two real-schema items and expects popularity order to remain unchanged. No unsupported `borrowingCount` field is invented; this proves stock totals affect the comparator, not the correctness of a missing borrowing-count API. |
| 4 | Search by a physical unit's code does not find its type | Known defect | [live catalogue browser](../tests/e2e/equipment/equipment.spec.ts) reads the type and its unit asset tag from the real backend, verifies the item is initially visible, searches that tag and reproduces the lost result. Type summaries do not carry unit asset tags. |
| 4 | Search loses typing focus | Verified | [catalog UI](../frontend/tests/equipment/catalog-and-inventory.test.tsx) asserts the same search input retains focus after its results change. |
| 4 | Quantity cannot be reduced from the catalog | Verified | [catalog UI](../frontend/tests/equipment/catalog-and-inventory.test.tsx) decreases quantity and removes the final unit. |
| 5 | Availability in detail differs from the selected dates | Verified | [equipment detail](../frontend/tests/equipment/detail-regressions.test.tsx) reads the shared request window. |
| 5 | Credit-weight wording is unclear | Verified | [equipment detail](../frontend/tests/equipment/detail-regressions.test.tsx) checks the explicit credit-weight label. |
| 5 | Confusing calibration/constant 14-day strip | Removed UI | [equipment detail](../frontend/tests/equipment/detail-regressions.test.tsx) checks that calibration text is absent and the current borrow limit comes from the borrower's data. A daily availability calendar is tracked separately below. |
| 5 | Quantity cannot be reduced from detail | Verified | [equipment detail](../frontend/tests/equipment/detail-regressions.test.tsx) reduces the cart to zero directly from detail. |
| 6 | T1 registration still demands manual serial entry | Verified | [generated serials](../backend/src/item/item.create-units.spec.ts) proves a T1 batch needs no supplied serial and avoids collisions. [equipment management](../backend/tests/item/equipment-management.spec.ts) covers batch writes and T2 serial requirements. |
| 6 | “Register serial” is unclear | Removed UI / uncovered defect | The reviewed registration control is not on the current inventory page. The visible registration entry point is not covered by an executable test; no replacement wording is claimed to exist. |
| 7 | Some basket items succeed while others fail | Verified policy | The user confirmed partial acceptance. [request page](../frontend/tests/borrower/request-page-regressions.test.tsx) asserts success/rejection counts and preserves rejected units for retry. It does not require all-or-nothing acceptance. |
| 7–8 | Green stock check contradicts a red date-window rejection | Known defect | [request page](../frontend/tests/borrower/request-page-regressions.test.tsx) reproduces a green stock check remaining after `WINDOW_NOT_AVAILABLE`. |
| 7 | Draft survives logout/login; Save draft has no purpose | Known defect / Removed UI | [request page and auth store](../frontend/tests/borrower/request-page-regressions.test.tsx) reproduces the cart surviving logout and protects the removal of the pretend Save draft action. |
| 8 | No calendar shows fully booked dates before selection | Uncovered defect | The request page has date inputs but no availability calendar. The expected-failure test was removed at the user's request. |
| 8 | Empty basket still passes pre-submit checks | Verified | [request page](../frontend/tests/borrower/request-page-regressions.test.tsx) checks all three idle checks and a disabled submit button. |
| 8 | Unit selection uses today's stock, ignoring the requested period and alternate units | Verified | [request window hook](../frontend/tests/borrower/request-window.test.tsx) asserts start/end parameters, alternate free-unit selection and refusal without a free unit. |
| 9 | Room list is sample data and booking exists only in browser state | Verified | [room API hooks](../frontend/tests/borrower/room-and-pickup-api.test.tsx) read only API rooms and call `loan.createRoomBooking`. [real database lifecycle](../backend/tests/item/room-booking-persistence.spec.ts) creates an isolated room, stores its reservation, reads it from a new service, checks held slots, cancels it, checks released slots and cleans up all fixtures. [Live browser room journey](../tests/e2e/lending/lending-lifecycle.spec.ts) also submits a real booking and records check-in, before/after photos and staff return. |
| 9–10 | Held-room banner names an absent room / unclear “old request” wording | Verified | [T3 page](../frontend/tests/equipment/t3-facilities.test.tsx) names the actual held booking and explains cancellation/completion, including when that room is outside the current list. |
| 11 | Borrower collection returns 403 | Verified in browser and modules | [live T2 borrower collection](../tests/e2e/lending/lending-lifecycle.spec.ts), [pickup page/photo guards](../frontend/tests/borrower/pickup-and-room-use.test.tsx), [pickup API hooks](../frontend/tests/borrower/room-and-pickup-api.test.tsx) call the borrower photo-ticket and `loan.confirmMyPickup` endpoints, upload bytes and stop on refusal. [pickup service](../backend/src/loan/loan.request.service.spec.ts) checks ownership/photo requirements and the successful transition. The browser uploads a real PNG, calls the borrower confirmation endpoint and verifies the stored request becomes `inUse`. |
| 12 | Pending room progress goes past confirmation while still awaiting approval | Verified | [borrower request card](../frontend/tests/borrower/server-actions.test.tsx) asserts the pending badge, highlighted confirmation stage, inactive photo stage and staff-approval explanation. |
| 12 | Room card shows an equipment serial placeholder | Uncovered defect | The shared loan card may render `- ·` metadata for a room booking. The expected-failure test was removed at the user's request. |
| 13, 15 | Borrower/staff stock counters disagree during preparation | Verified for the same stock/time | [cross-service stock parity](../backend/tests/item/catalog-availability.spec.ts) checks both actual services and the polled badge for Pending, Prepared, Lended and Returned loans, including the SQL select filters. Staff scope and a borrower-selected future period can legitimately produce different counts; those are different queries. |
| 13 | Next available is always a dash | Verified | [cross-service stock tests](../backend/tests/item/catalog-availability.spec.ts) prove due-date-plus-preparation output when all units are held; returned/ungraded stock has no invented date. [detail UI](../frontend/tests/equipment/detail-regressions.test.tsx) renders the returned date. |
| 15 | Staff have no equipment registration entry point | Uncovered defect | The explicit registration-entry assertion was removed at the user's request. Existing inventory dialog tests exercise registration; this removed check is not counted as current defect evidence. |
| 16 | Handover is a placeholder; breadcrumb contradicts page title | Verified | [handover page](../frontend/tests/staff/handover-page.test.tsx) renders actual loan details, checks the dynamic route title and sends a T1 swap; T2 cannot swap. |
| 17 | Report export is a placeholder | Verified | [report export](../frontend/tests/staff/report-export.test.tsx) reads the downloaded Blob, checks UTF-8 CSV data/escaping/scope and disables empty exports. |
| 18 | Credit deductions are labeled as borrowing bans | Verified | [staff user pages](../frontend/tests/staff/user-status.test.tsx) check the labels and available actions. [backend user mapper](../backend/src/common/mappers/admin-user.mapper.spec.ts) distinguishes deductions from active bans. |
| 20 | Supervisor appeals show sample rows instead of server appeals | Verified | [appeal page](../frontend/tests/supervisor/appeals-page.test.tsx) renders API-shaped appeals and sends decisions; [API hooks](../frontend/tests/borrower/room-and-pickup-api.test.tsx) assert `appeal.list` and an empty response without invented rows. |
| 20 | Before/after photos return 404 | Verified for stored uploads | [appeal UI](../frontend/tests/supervisor/appeals-page.test.tsx) renders the evidence URLs. [HTTP evidence test](../backend/tests/image/appeal-photos-http.spec.ts) stores valid PNG files, lists both evidence stages and GETs their URLs through the production `configureApp` media mount, asserting 200, image type and identical bytes. Historical missing files cannot be recovered by these tests. |

## Four outstanding defects with executable regression tests

| # | PDF page | Exact expected-failure test | Assertion that fails and the product behavior it exposes |
| --- | --- | --- | --- |
| 1 | 4 | `frontend/tests/equipment/catalog-and-inventory.test.tsx` — `does not change popularity order when only inventory totals change` | Builds two item-summary responses through the real schema and adapter, selects Most popular, swaps only `totalUnits` and expects the same item order. The current comparator reverses order. This demonstrates improper dependence on inventory; it cannot rank by a borrowing-count field absent from the API. |
| 2 | 4 | `tests/e2e/equipment/equipment.spec.ts` — `finds a seeded equipment type by a real unit asset tag` | Calls real `item.list` and `item.getById`, takes an actual unit asset tag, verifies the type is visible and searches the tag. `test.fail` is enabled only after setup succeeds; the desired visible-row assertion then fails because frontend summary search loses the unit tag. |
| 3 | 7–8 | `frontend/tests/borrower/request-page-regressions.test.tsx` — `does not keep a green stock check after a backend date clash` | Simulates `WINDOW_NOT_AVAILABLE`, waits for the rejection alert, then expects the `PC stock OK` indicator to disappear. It remains visible because the checklist continues to use the earlier availability result after the server rejects that date window. |
| 4 | 7 | `frontend/tests/borrower/request-page-regressions.test.tsx` — `clears the previous borrower cart when they log out` | Adds a line, invokes the auth store's `logout()`, and expects request-draft lines to be empty. They remain in memory, so a later account can inherit the previous borrower's cart. |

### What “expected defect failure” means

Three cases use Vitest `it.fails`; the asset-tag case uses Playwright `test.fail` immediately before its desired search assertion. These cases execute and reproduce failures; they are not ordinary passing behavior checks and are not skipped. If the product is fixed, the expected-failure marker causes an unexpected pass and must be removed. Setup, real API schemas and required fixtures are checked before the Playwright marker.

Three other expected-failure tests remain removed at the user's request: the registration-entry assertion, room serial placeholder and pre-selection availability calendar. They are not restored or claimed to be covered by a replacement assertion.

A separate [lifecycle expected failure](../tests/e2e/lending/lending-lifecycle.spec.ts) proves that damage inspection deducts credit but sends no credit-deduction notification. This is an SRS notification gap, not one of the PDF's four executable defects.

## Boundaries

The four layout cases use controlled API responses and the real Chromium layout engine. Room/pickup/appeal browser journeys use real APIs and a fresh database. Unit tests use actual schemas/adapters with mocked API boundaries. Media tests use temporary real PNG files, signed URLs and the actual HTTP bootstrap; deployed host configuration and recovery of missing historical files remain outside this evidence.

## Latest verified measurements (26 September 2026)

| Check | Result |
| --- | --- |
| Full frontend Vitest | 41 files, 196 outcomes: 193 ordinary passes and 3 expected defect failures; lines 72.05%, branches 73.22%, functions 67.83% |
| Full backend Jest | 86 suites, 750 ordinary passes; lines 80.94%, branches 70.43%, functions 72.02% |
| Complete Playwright suite | 13 files, 39 outcomes: 37 ordinary passes, 2 reproduced expected defects (asset-tag search and damage-credit alert), 0 skipped |
| Frontend typecheck and browser test typecheck | Passed |
| SRS traceability | 112 requirement IDs mapped once with existing evidence links |

Coverage measures application source including unvisited files. E2E is not instrumented for source-line coverage. Normal CI records browser reports; developers generate coverage reports themselves using the commands in `tests/README.md`.
