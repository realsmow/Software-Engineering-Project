import { BusinessError } from '../common/errors/business-error';
import {
  AdminMiddleware,
  StaffMiddleware,
  SupervisorMiddleware,
} from './auth.middleware';

describe('SupervisorMiddleware', () => {
  it('rejects a staff caller with ROLE_NOT_ALLOWED', async () => {
    const next = jest.fn();
    const middleware = new SupervisorMiddleware();

    await expect(
      middleware.use({
        ctx: {
          user: {
            accountKey: 42,
            role: 'staff',
            facultyKey: null,
            creditScore: 100,
          },
        },
        next,
      } as never),
    ).rejects.toMatchObject<Partial<BusinessError>>({
      businessCode: 'ROLE_NOT_ALLOWED',
    });

    expect(next).not.toHaveBeenCalled();
  });

  it('allows an admin through staff, supervisor, and admin route guards', async () => {
    const next = jest.fn().mockResolvedValue({ ok: true });
    const context = {
      user: {
        accountKey: 42,
        role: 'admin',
        facultyKey: null,
        creditScore: 100,
      },
    };

    await expect(new StaffMiddleware().use({ ctx: context, next } as never)).resolves.toEqual({
      ok: true,
    });
    await expect(
      new SupervisorMiddleware().use({ ctx: context, next } as never),
    ).resolves.toEqual({ ok: true });
    await expect(new AdminMiddleware().use({ ctx: context, next } as never)).resolves.toEqual({
      ok: true,
    });

    expect(next).toHaveBeenCalledTimes(3);
  });
});
