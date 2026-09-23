import type { TrpcContext, TrpcUser } from '../trpc/context';
import {
  AdminMiddleware,
  AuthMiddleware,
  StaffMiddleware,
  SupervisorMiddleware,
} from '../trpc/auth.middleware';
import { BusinessError } from '../common/errors/business-error';

function ctxWith(user: TrpcUser | null): TrpcContext {
  return { user } as TrpcContext;
}

function nextSpy() {
  return jest.fn(async ({ ctx }: { ctx: TrpcContext }) => ({ ok: true, ctx }));
}

describe('Auth and role middleware — Module 1.2.8–1.2.11', () => {
  it('1.2.8 unauthenticated request to a protected route throws NOT_AUTHENTICATED', async () => {
    const middleware = new AuthMiddleware();
    const next = nextSpy();

    await expect(
      middleware.use({ ctx: ctxWith(null), next } as any),
    ).rejects.toMatchObject({
      businessCode: 'NOT_AUTHENTICATED',
    });

    expect(next).not.toHaveBeenCalled();
  });

  it('1.2.9 borrower calling a Staff-only route throws ROLE_NOT_ALLOWED', async () => {
    const middleware = new StaffMiddleware();
    const next = nextSpy();

    await expect(
      middleware.use({
        ctx: ctxWith({
          accountKey: 101,
          role: 'borrower',
        }),
        next,
      } as any),
    ).rejects.toMatchObject({
      businessCode: 'ROLE_NOT_ALLOWED',
    });

    try {
      await middleware.use({
        ctx: ctxWith({ accountKey: 101, role: 'borrower' }),
        next,
      } as any);
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessError);
      expect((error as BusinessError).details).toMatchObject({
        allowed: ['staff', 'supervisor', 'admin'],
        actual: 'borrower',
      });
    }

    expect(next).not.toHaveBeenCalled();
  });

  it('1.2.10 staff cannot access Supervisor-only approvals', async () => {
    const middleware = new SupervisorMiddleware();
    const next = nextSpy();

    await expect(
      middleware.use({
        ctx: ctxWith({ accountKey: 102, role: 'staff' }),
        next,
      } as any),
    ).rejects.toMatchObject({
      businessCode: 'ROLE_NOT_ALLOWED',
    });

    expect(next).not.toHaveBeenCalled();
  });

  it('1.2.11 admin is accepted by all role-gated middleware', async () => {
    const user = { accountKey: 103, role: 'admin' } as TrpcUser;

    for (const Middleware of [
      StaffMiddleware,
      SupervisorMiddleware,
      AdminMiddleware,
    ]) {
      const middleware = new Middleware();
      const next = nextSpy();

      await expect(
        middleware.use({ ctx: ctxWith(user), next } as any),
      ).resolves.toMatchObject({ ok: true });

      expect(next).toHaveBeenCalledTimes(1);
    }
  });
});
