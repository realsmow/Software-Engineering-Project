import { z } from 'zod';
import { creditBand, userRole } from './status.schema';

/**
 * User shape as seen by clients of the API.
 *
 * This mirrors the frontend's `User` interface in
 * frontend/src/types/domain.ts field-for-field — the frontend defines the
 * contract, so the DB's own column names and types stop at this boundary.
 *
 * Maps from the AccountInfo table:
 *   AccountKey            -> id (as a string, the frontend uses string ids)
 *   UserID                -> studentId
 *   UserFName + UserLName -> name (joined, the frontend shows one name)
 *   UserCredit            -> creditScore
 *   FacultyKey            -> departmentId (as a string)
 *   HashedPassword        -> never included — it is not declared here, so it
 *                            cannot leak out by accident.
 */
export const userOutput = z.object({
  id: z.string(),
  studentId: z.string(),
  name: z.string(),
  email: z.email(),
  role: userRole,
  departmentId: z.string(),
  creditScore: z.number().int(),
  creditBand,
});

export type UserOutput = z.infer<typeof userOutput>;
