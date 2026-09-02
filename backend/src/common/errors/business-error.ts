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
  /** The chosen unit is a different type, or a different department, than the request */
  UNIT_DOES_NOT_MATCH_REQUEST: 'BAD_REQUEST',
  EXTENSION_NOT_FOUND: 'NOT_FOUND',
  /** T2 extensions are the supervisor's call, not the counter's (§5.4) */
  EXTENSION_NEEDS_SUPERVISOR: 'FORBIDDEN',
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

  // --- inspection (staff domain) ---
  INSPECTION_NOT_FOUND: 'NOT_FOUND',
  /** This return has already been graded; corrections go through an appeal */
  ALREADY_INSPECTED: 'CONFLICT',

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
  CREDIT_TOO_LOW: 'FORBIDDEN',
  /** The requested window is backwards, in the past, or longer than the tier allows */
  INVALID_BORROW_WINDOW: 'BAD_REQUEST',
  /** Somebody else's request already holds this unit for part of the window */
  WINDOW_NOT_AVAILABLE: 'CONFLICT',
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

  constructor(code: BusinessErrorCode, details?: Record<string, unknown>) {
    super({
      code: BUSINESS_ERROR_CODES[code],
      message: code,
      cause: details,
    });
    this.businessCode = code;
  }
}

/** Shorthand for the NOT_IMPLEMENTED case, so every use spells out what is missing. */
export function notImplemented(missing: string[], note: string): never {
  throw new BusinessError('NOT_IMPLEMENTED', { missing, note });
}
