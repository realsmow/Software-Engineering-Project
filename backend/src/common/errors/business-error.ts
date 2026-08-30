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
  /** Too many failed logins. `cause.retryAfterSeconds` says how long to wait. */
  TOO_MANY_ATTEMPTS: 'TOO_MANY_REQUESTS',

  // --- accounts (admin domain) ---
  USER_NOT_FOUND: 'NOT_FOUND',
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
