import { TRPCError } from '@trpc/server';

/**
 * Business error codes and the tRPC code each one travels as (ว-06).
 *
 * Two layers on purpose:
 *   - the tRPC code is what HTTP/tooling understands (401, 403, 409 …)
 *   - the business code is what the frontend switches on to pick a Thai
 *     message. It rides in `message`, never as Thai text - backend does not
 *     own user-facing wording.
 *
 * Extra context goes in `cause` so the frontend can fill in the blanks
 * ("ยืมได้สูงสุด {maxDays} วัน") without parsing the message string.
 */
export const BUSINESS_ERROR_CODES = {
  // --- session / permission (ว-03, ว-05) ---
  NOT_AUTHENTICATED: 'UNAUTHORIZED',
  ROLE_NOT_ALLOWED: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'UNAUTHORIZED',
  /** Correct password, but the account may not sign in. Distinct from a borrowing ban. */
  ACCOUNT_DISABLED: 'FORBIDDEN',
  /** Too many failed logins. `cause.retryAfterSeconds` says how long to wait. */
  TOO_MANY_ATTEMPTS: 'TOO_MANY_REQUESTS',

  // --- accounts (admin domain) ---
  USER_NOT_FOUND: 'NOT_FOUND',
  AUDIT_EVENT_NOT_FOUND: 'NOT_FOUND',
  EMAIL_ALREADY_IN_USE: 'CONFLICT',
  USER_ID_ALREADY_IN_USE: 'CONFLICT',
  /** RoleInfo has no row for the requested role - seed data problem, not user error */
  ROLE_NOT_CONFIGURED: 'PRECONDITION_FAILED',
  /** An admin may not strip their own admin role or ban themselves */
  CANNOT_MODIFY_SELF: 'FORBIDDEN',
  /**
   * The demotion would leave a department with nobody able to act in it.
   *
   * A role change does not touch Authority rows, so the demoted account still
   * looks attached to its ManagementGroup while failing StaffMiddleware. If it
   * was the last holder, that group's approvals, handovers, inspections and
   * repairs have no owner and nothing in the system says so.
   *
   * `cause.groups` names each affected group, the cover level it loses
   * ('staff' or 'supervisor'), and how much open work is sitting in it, so the
   * admin is told what to reassign rather than just refused.
   */
  ROLE_CHANGE_WOULD_ORPHAN_GROUP: 'CONFLICT',
  /**
   * Same hazard as above reached through a different button: a disabled
   * account cannot sign in, so disabling the last staff or supervisor of a
   * department empties it exactly the way demoting them would. `cause.groups`
   * has the same shape.
   */
  DISABLE_WOULD_ORPHAN_GROUP: 'CONFLICT',
  /** Forged, already spent, or expired. One code for all three on purpose. */
  RESET_TOKEN_INVALID: 'BAD_REQUEST',
  /** Same three cases, for the link that confirms a self-registered address. */
  VERIFICATION_TOKEN_INVALID: 'BAD_REQUEST',
  /**
   * The current password given on a self-service change did not match.
   *
   * Deliberately not INVALID_CREDENTIALS: that maps to UNAUTHORIZED, and a
   * client which treats 401 as "session expired" would sign the user out for
   * mistyping a field on a form they are already authenticated for.
   */
  CURRENT_PASSWORD_INCORRECT: 'FORBIDDEN',
  /** A new password identical to the old one - the change would be a no-op. */
  PASSWORD_UNCHANGED: 'BAD_REQUEST',
  /** No CreditTier row covers this score - CreditMin/CreditMax leave a gap */
  CREDIT_TIER_NOT_CONFIGURED: 'PRECONDITION_FAILED',

  // --- lending settings ---
  BORROW_RULE_NOT_FOUND: 'NOT_FOUND',

  // --- catalogue ---
  ITEM_NOT_FOUND: 'NOT_FOUND',
  ROOM_NOT_FOUND: 'NOT_FOUND',

  // --- departmental authority (staff domain) ---
  /** Staff role granted but the account holds no Authority row — nothing to manage */
  NO_MANAGEMENT_SCOPE: 'PRECONDITION_FAILED',
  /** The resource belongs to a department the caller has no authority in (§5.1) */
  OUT_OF_MANAGEMENT_SCOPE: 'FORBIDDEN',

  // --- catalogue (staff domain) ---
  RESOURCE_NOT_FOUND: 'NOT_FOUND',
  ITEM_TYPE_NOT_FOUND: 'NOT_FOUND',
  /** Two units of the same type cannot carry the same ItemID (serial) */
  SERIAL_ALREADY_IN_USE: 'CONFLICT',
  /** T1/T2 units must carry a serial; T0 must not pretend to have one */
  SERIAL_REQUIRED_FOR_TIER: 'BAD_REQUEST',
  /**
   * T2 binds one real serial to one unit, so a batch cannot be registered from
   * a single serial — the suffixed serials would match nothing on the shelf
   */
  BULK_NOT_ALLOWED_FOR_TIER: 'BAD_REQUEST',
  /** BorrowRule has no row named T0..T3 — seed data problem, not user error */
  TIER_NOT_CONFIGURED: 'PRECONDITION_FAILED',
  /** Cannot take a unit out of the pool while somebody is holding it */
  RESOURCE_IN_USE: 'CONFLICT',

  // --- handover desk (staff domain) ---
  RESERVATION_NOT_FOUND: 'NOT_FOUND',
  LOAN_NOT_FOUND: 'NOT_FOUND',
  /** The request has not been approved (by the system or a supervisor) yet */
  NOT_APPROVED_YET: 'CONFLICT',
  /** The loan is not at the step this action expects — `cause` names both */
  WRONG_LOAN_STATE: 'CONFLICT',
  /** Borrower confirmation requires their before-pickup evidence photo. */
  PICKUP_PHOTO_REQUIRED: 'PRECONDITION_FAILED',
  /** The chosen unit is a different type, or a different department, than the request */
  UNIT_DOES_NOT_MATCH_REQUEST: 'BAD_REQUEST',
  EXTENSION_NOT_FOUND: 'NOT_FOUND',
  /** Already holding a room; `cause.limit` says how many may be held at once. */
  ROOM_BOOKING_LIMIT_REACHED: 'CONFLICT',
  /** T2 extensions are the supervisor's call, not the counter's (§5.4) */
  EXTENSION_NEEDS_SUPERVISOR: 'FORBIDDEN',
  /**
   * One extension request may be open per loan.
   *
   * Not ALREADY_DECIDED: nothing has been decided, and the borrower's next move
   * is to wait or to withdraw the one they have. `cause.extensionKey` names it
   * so the screen can offer exactly that.
   */
  EXTENSION_ALREADY_PENDING: 'CONFLICT',
  /**
   * The requested new due date is not one this loan can be moved to — earlier
   * than the current one, in the past, or past what the borrower's band allows.
   * `cause.reason` says which.
   */
  INVALID_EXTENSION_WINDOW: 'BAD_REQUEST',
  /** Only T1 units may be swapped at pickup (§5.4) */
  UNIT_SWAP_NOT_ALLOWED: 'FORBIDDEN',
  /** Not yet two weeks overdue, so it is still late rather than lost (§5.7) */
  NOT_YET_LOST: 'CONFLICT',

  // --- file upload (CONTRACT.md §3) ---
  /** The upload URL is forged, malformed, or past its ten minutes */
  UPLOAD_TICKET_INVALID: 'FORBIDDEN',
  /** Bytes arrived with a different Content-Type than the ticket was issued for */
  UPLOAD_TYPE_MISMATCH: 'BAD_REQUEST',
  /** Larger than the size the ticket was issued for, or than the global cap */
  UPLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UPLOAD_EMPTY: 'BAD_REQUEST',
  /** The ticket was already used — a replay, not a retry. The file stays as it was. */
  UPLOAD_ALREADY_STORED: 'CONFLICT',
  /** Declared an image type but the bytes do not begin like one */
  UPLOAD_NOT_AN_IMAGE: 'BAD_REQUEST',
  /** Catch-all for a write refused before it happened — see cause */
  UPLOAD_REJECTED: 'BAD_REQUEST',
  /** No such `Images` row */
  IMAGE_NOT_FOUND: 'NOT_FOUND',
  /** Removing a photo somebody else filed — evidence is not editable by third parties */
  NOT_YOUR_PHOTO: 'FORBIDDEN',
  /** One stage of one loan is capped; `cause` carries the numbers */
  TOO_MANY_PHOTOS: 'BAD_REQUEST',

  // --- notifications (the topbar bell) ---
  /**
   * No such notification for this account.
   *
   * Deliberately the same answer for "does not exist" and "belongs to someone
   * else", so the bell cannot be used to enumerate notification ids.
   */
  NOTIFICATION_NOT_FOUND: 'NOT_FOUND',

  // --- inspection (staff domain) ---
  INSPECTION_NOT_FOUND: 'NOT_FOUND',
  /** This return has already been graded; corrections go through an appeal */
  ALREADY_INSPECTED: 'CONFLICT',
  /**
   * §5.9 / FR-RTN-04: for T2, whoever grades the return may not be the person
   * who prepared the unit ("Staff A ≠ Staff B"). Sibling of
   * CANNOT_APPROVE_OWN_REQUEST — the same "no marking your own work" rule, one
   * desk over.
   */
  CANNOT_INSPECT_OWN_PREPARATION: 'FORBIDDEN',

  // --- room slots (T3) ---
  /** A slot index the day does not have. See common/booking/room-slots.ts. */
  ROOM_SLOT_OUT_OF_RANGE: 'BAD_REQUEST',
  /** More than MAX_ROOM_BOOKING_SLOTS in one booking — `cause` carries both numbers */
  ROOM_SLOT_LIMIT_EXCEEDED: 'BAD_REQUEST',
  /**
   * The chosen slots are not one unbroken run.
   *
   * Includes a pair that only the lunch break separates: 11:30 and 13:00 are
   * neighbours in the list and an hour apart on the clock, and joining them
   * would hold the room over a period nobody can use.
   */
  ROOM_SLOTS_NOT_CONTIGUOUS: 'BAD_REQUEST',
  /** The slot has already been and gone today. Sibling of INVALID_BORROW_WINDOW. */
  ROOM_SLOT_IN_THE_PAST: 'BAD_REQUEST',

  // --- appeals (§5.8 "ขออุทธรณ์") ---
  PENALTY_NOT_FOUND: 'NOT_FOUND',
  APPEAL_NOT_FOUND: 'NOT_FOUND',
  /** One appeal per penalty — AppealInfo.OriginalPenalty is unique */
  ALREADY_APPEALED: 'CONFLICT',
  /** Appealing somebody else's penalty. Same answer as "no such penalty" would leak less, but the borrower reaches this only from their own list. */
  NOT_YOUR_PENALTY: 'FORBIDDEN',
  /** A lifted penalty has nothing left to appeal */
  PENALTY_NOT_IN_EFFECT: 'CONFLICT',
  /**
   * The appeal has already been approved or rejected.
   *
   * Distinct from ALREADY_DECIDED, which is the borrowing queue's: the screens
   * differ and so does what the caller should do next.
   */
  APPEAL_ALREADY_RESOLVED: 'CONFLICT',
  /** Deciding your own appeal — the appeals-desk sibling of CANNOT_APPROVE_OWN_REQUEST */
  CANNOT_DECIDE_OWN_APPEAL: 'FORBIDDEN',
  /**
   * §5.8: "คนตรวจสอบต้องไม่ใช่คนเดิม" — the person who graded the return that
   * produced the penalty may not be the one who rules on the appeal.
   *
   * `cause.inspectorKey` names who is blocked, so the desk can hand it on
   * rather than guess why it refused.
   */
  CANNOT_DECIDE_OWN_INSPECTION: 'FORBIDDEN',
  /**
   * An approval that reduces the penalty to the same amount or more.
   *
   * An appeal is not a route to a larger penalty, and one that leaves the
   * borrower exactly where they were is a rejection with extra rows.
   */
  INVALID_APPEAL_REDUCTION: 'BAD_REQUEST',

  // --- borrowing requests (borrower slice) ---
  /**
   * Credit too low to open a request at all.
   *
   * CONTRACT.md says no such rule exists - credit only shortens the borrow
   * window. The team decided otherwise: `CREDIT_BAND_POLICY` in
   * frontend/src/constants/index.ts marks D3 `blocked: true` ("D3 cannot open
   * a new request until outstanding items are cleared"), and the screens are
   * built around it. This code is the backend half of that decision; the
   * contract table has been corrected to match.
   */
  /**
   * An administrative borrowing ban is in force (admin.setUserBan).
   *
   * Separate from CREDIT_TOO_LOW: that one is the credit system doing its job,
   * this one is a person having decided. `cause` carries the reason the staff
   * member gave and when it lifts, so the borrower is told both.
   */
  BORROWING_SUSPENDED: 'FORBIDDEN',
  CREDIT_TOO_LOW: 'FORBIDDEN',
  /** The requested window is backwards, in the past, or longer than the tier allows */
  INVALID_BORROW_WINDOW: 'BAD_REQUEST',
  /** Somebody else's request already holds this unit for part of the window */
  WINDOW_NOT_AVAILABLE: 'CONFLICT',
  /**
   * Serializable kept refusing the write because other people are booking the
   * same unit right now. `cause.attempts` says how many times it was retried.
   */
  TRANSACTION_CONFLICT: 'CONFLICT',
  /** Cancelling something that is already approved-and-prepared, or already over */
  CANNOT_CANCEL: 'CONFLICT',

  // --- approval queue (supervisor slice) ---
  /** A request cleared by the system needs no decision */
  ALREADY_AUTO_APPROVED: 'CONFLICT',
  /** §5.9: the approver may not be the person who asked */
  CANNOT_APPROVE_OWN_REQUEST: 'FORBIDDEN',
  /** This request is above the caller's pay grade - T2 belongs to a supervisor */
  APPROVAL_NEEDS_SUPERVISOR: 'FORBIDDEN',

  // --- borrowing (declared here so other domains reuse the same table) ---
  NOT_ELIGIBLE: 'FORBIDDEN',
  ITEM_UNAVAILABLE: 'CONFLICT',
  SLOT_TAKEN: 'CONFLICT',
  LOAN_PERIOD_EXCEEDS_LIMIT: 'BAD_REQUEST',
  EXTENSION_QUOTA_EXCEEDED: 'FORBIDDEN',
  ALREADY_DECIDED: 'CONFLICT',
  APPEAL_WINDOW_CLOSED: 'FORBIDDEN',

  /**
   * The procedure exists in the contract but the database cannot back it yet.
   * `cause.missing` names the columns/tables required - see
   * docs/auth-admin.md. Never use this for "not written yet"; only for
   * "cannot be written until the schema grows".
   */
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
} as const;

export type BusinessErrorCode = keyof typeof BUSINESS_ERROR_CODES;

/**
 * The only error type a service should throw.
 *
 * Anything else that escapes becomes INTERNAL_SERVER_ERROR with its message
 * stripped by tRPC in production - which is the correct outcome for a genuine
 * bug, and the wrong outcome for an expected business rule. Hence: expected
 * rules get a code here, bugs stay uncaught.
 */
export class BusinessError extends TRPCError {
  readonly businessCode: BusinessErrorCode;

  /**
   * The context object this error was constructed with, unwrapped.
   *
   * `cause` is NOT this object: TRPCError's constructor wraps any non-Error
   * cause in an internal `UnknownCauseError`, so `error.cause as
   * Record<string, unknown>` is a cast that compiles and then lies. It shipped
   * an `UnknownCauseError` into `loan.create`'s `rejected[].detail`, where the
   * output schema rejected it and turned one refused basket line into a 500.
   *
   * Reading `details` is therefore the only supported way to get it back.
   */
  readonly details: Record<string, unknown> | null;

  constructor(code: BusinessErrorCode, details?: Record<string, unknown>) {
    super({
      code: BUSINESS_ERROR_CODES[code],
      message: code,
      cause: details,
    });
    this.businessCode = code;
    this.details = details ?? null;
  }
}

/** Shorthand for the NOT_IMPLEMENTED case, so every use spells out what is missing. */
export function notImplemented(missing: string[], note: string): never {
  throw new BusinessError('NOT_IMPLEMENTED', { missing, note });
}
