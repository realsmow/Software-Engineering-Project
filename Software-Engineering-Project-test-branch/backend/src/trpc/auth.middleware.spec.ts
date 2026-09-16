import { BusinessError } from '../common/errors/business-error';
import { SupervisorMiddleware } from './auth.middleware';

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
});
