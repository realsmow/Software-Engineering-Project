import { Injectable } from '@nestjs/common';
import type { MiddlewareOptions, TRPCMiddleware } from 'nestjs-trpc';
import { BusinessError } from '../common/errors/business-error';
import type { TrpcContext, TrpcUser } from './context';

/** Must be logged in - used on almost every procedure */
@Injectable()
export class AuthMiddleware implements TRPCMiddleware {
  async use(opts: MiddlewareOptions<TrpcContext>) {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw new BusinessError('NOT_AUTHENTICATED');
    }
    // Pass ctx along with user narrowed to non-null, so downstream
    // procedures don't have to re-check.
    return next({ ctx: { ...ctx, user: ctx.user } });
  }
}

/** Role-gated middleware factory - write once, reuse per role */
function requireRole(...allowed: TrpcUser['role'][]) {
  @Injectable()
  class RoleMiddleware implements TRPCMiddleware {
    async use(opts: MiddlewareOptions<TrpcContext>) {
      const { ctx, next } = opts;
      if (!ctx.user) {
        // Distinguish the two: an anonymous caller should be sent to the login
        // page, a logged-in caller with the wrong role should not.
        throw new BusinessError('NOT_AUTHENTICATED');
      }
      if (!allowed.includes(ctx.user.role)) {
        throw new BusinessError('ROLE_NOT_ALLOWED', {
          allowed,
          actual: ctx.user.role,
        });
      }
      return next({ ctx });
    }
  }
  return RoleMiddleware;
}

/**
 * The staff floor: prepares equipment, records checkout/return, assesses
 * damage, and clears the part of the approval queue that is not a supervisor's.
 *
 * `supervisor` is included because the roles are a ladder, not a partition
 * (SRS ว-03: a supervisor can do everything staff can, plus decide). Leaving
 * it out locked teachers out of `approval.*` entirely - the very desk the
 * approval router's own docstring says they clear T2 from - and out of the
 * department-management pages the supervisor navigation already links to.
 *
 * Where a supervisor must be told apart from staff, that is a per-row question
 * (approval-policy.ts routes T2 to them; CANNOT_APPROVE_OWN_REQUEST stops
 * self-approval), not something a role gate can answer.
 */
export const StaffMiddleware = requireRole('staff', 'supervisor', 'admin');

/** Supervisor: approves/rejects requests, decides appeals */
export const SupervisorMiddleware = requireRole('supervisor', 'admin');

/** Admin: manages users and system settings */
export const AdminMiddleware = requireRole('admin');
