import { z } from 'zod';
import { creditTier, userRole } from './status.schema';

/**
 * User shape as seen by clients of the API.
 *
 * Maps from the AccountInfo table:
 *   AccountKey     -> id
 *   UserID         -> studentId
 *   UserFName      -> firstName
 *   UserLName      -> lastName
 *   UserCredit     -> creditScore
 *   HashedPassword -> never included - it is not declared here, so it
 *                      cannot leak out by accident.
 */
export const userOutput = z.object({
  id: z.number().int(),
  studentId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  role: userRole,
  facultyName: z.string().nullable(),

  // Send the *computed* limit, not the raw credit score - callers should
  // never need to know the score-to-limit business rule.
  creditScore: z.number().int(),
  creditTier,
  /** Max borrow days at the current credit tier (BorrowConstraints.MaxBorrowDate) */
  maxBorrowDays: z.number().int().positive(),
  /** Max extension count at the current credit tier (BorrowConstraints.MaxExtendTime) */
  maxExtendTimes: z.number().int().min(0),
});

export type UserOutput = z.infer<typeof userOutput>;
