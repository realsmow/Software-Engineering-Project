import { z } from 'zod';
import { userOutput } from '../common/schemas/user.schema';

/**
 * Sign-in input.
 *
 * The frontend offers two sign-in methods (a KU email for students and staff
 * with one, a local account for department staff without) but they are one
 * procedure, not two: the difference is which column the identifier matches,
 * and that is the server's business.
 *
 * `username` therefore accepts either AccountInfo.Email or AccountInfo.UserID.
 * The field keeps the name the frontend contract already uses so no client
 * code has to change.
 */
export const loginInput = z.object({
  username: z.string().trim().min(1).max(254),
  // Not `.min(8)` — that is a rule for *choosing* a password. Applying it at
  // login would reject an existing short password with a validation error
  // instead of a clean INVALID_CREDENTIALS, and would leak the rule's history.
  password: z.string().min(1).max(200),
});

export type LoginInput = z.infer<typeof loginInput>;

/**
 * Login returns the full profile so the client can render the shell
 * immediately, without a second round trip to auth.me.
 */
export const loginOutput = z.object({ user: userOutput });
