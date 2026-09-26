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
  // Not `.min(8)` - that is a rule for *choosing* a password. Applying it at
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

/**
 * Changing your own password.
 *
 * `currentPassword` is required even though the caller is already
 * authenticated: a session that has been taken over would otherwise be enough
 * to lock the real owner out of their own account.
 */
export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordInput = z.infer<typeof changePasswordInput>;

export const changePasswordOutput = z.object({
  ok: z.literal(true),
  /** Sessions cut off by the change, not counting the one that made it. */
  otherSessionsRevoked: z.number().int().min(0),
});

/** Asking for a reset link. Answers the same whether or not the address exists. */
export const requestPasswordResetInput = z.object({
  email: z.string().trim().min(1).max(200),
});
export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetInput
>;

export const resetPasswordWithTokenInput = z.object({
  token: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});
export type ResetPasswordWithTokenInput = z.infer<
  typeof resetPasswordWithTokenInput
>;

/**
 * Self-registration.
 *
 * No role field on purpose: a public endpoint that accepted one would be a way
 * to mint an admin. The server always creates a borrower.
 */
export const registerInput = z.object({
  email: z.email().max(200),
  studentId: z.string().trim().min(1).max(50),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(200),
});
export type RegisterInput = z.infer<typeof registerInput>;

export const verifyEmailInput = z.object({
  token: z.string().min(1).max(200),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailInput>;

/**
 * FR-AUTH-01: lets the login page show "Sign in with Google" only when the
 * backend actually has it wired up. Public - a visitor asks this before they
 * have a session, same as `login` itself.
 */
export const providersOutput = z.object({ google: z.boolean() });
export type ProvidersOutput = z.infer<typeof providersOutput>;
