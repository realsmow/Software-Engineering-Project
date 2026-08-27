import { z } from 'zod';

/**
 * Auth inputs — these mirror frontend/src/features/auth/login.schema.ts.
 *
 * The frontend offers two sign-in methods and validates them client-side;
 * these schemas re-validate the same rules server-side, because a client
 * check is a convenience, never a guarantee.
 */

/** Students and faculty sign in with a KU address — same rule as the frontend */
const kuEmail = z
  .email()
  .refine(
    (v) => /@(ku\.ac\.th|ku\.th)$/i.test(v.trim()),
    'Email must be @ku.ac.th or @ku.th',
  );

/**
 * Minimum password length is enforced on the way *in* only.
 *
 * The login schemas deliberately don't require it: an existing account may
 * predate the rule, and rejecting a short password at login would leak that
 * the password was short. Login only cares whether the hash matches.
 */
const newPassword = z.string().min(8, 'Password must be at least 8 characters');

/**
 * "Remember me" on the login forms. When false the session cookie is dropped
 * when the browser closes; the JWT's own lifetime is unaffected either way.
 */
const remember = z.boolean().optional();

export const kuLoginInput = z.object({
  email: kuEmail,
  password: z.string().min(1),
  remember,
});

export const localLoginInput = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  remember,
});

export const registerInput = z.object({
  email: kuEmail,
  password: newPassword,
  /** AccountInfo.UserID — student/staff number */
  studentId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export type KuLoginInput = z.infer<typeof kuLoginInput>;
export type LocalLoginInput = z.infer<typeof localLoginInput>;
export type RegisterInput = z.infer<typeof registerInput>;
