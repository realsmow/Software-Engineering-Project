const sendMail = jest.fn().mockResolvedValue({});
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail }),
}));

import { RegistrationService } from './registration.service';
import { BusinessError } from '../common/errors/business-error';
import type { PrismaService } from '../prisma.service';
import type { ConfigService } from '@nestjs/config';
import type { RegisterInput } from './auth.schema';

/**
 * Self-registration.
 *
 * Two things carry the security of a public endpoint here: it never reveals
 * whether an address is taken, and it never lets the caller pick a role. The
 * confirmation link has the same three-way indistinguishability as a reset
 * link - forged, spent and expired must look alike.
 */
function build(options: { clash?: { Email: string } | null } = {}) {
  const created = { AccountKey: 42 };
  const accountCreate = jest.fn().mockResolvedValue(created);
  const verificationCreate = jest.fn().mockResolvedValue({});
  const accountUpdate = jest.fn().mockResolvedValue({});
  const verificationUpdate = jest.fn().mockResolvedValue({});

  const tx = {
    accountInfo: { create: accountCreate },
    emailVerification: { create: verificationCreate },
  };

  const prisma = {
    accountInfo: {
      findFirst: jest.fn().mockResolvedValue(options.clash ?? null),
      update: accountUpdate,
    },
    roleInfo: {
      findMany: jest.fn().mockResolvedValue([
        { RoleKey: 9, RoleName: 'Admin' },
        { RoleKey: 3, RoleName: 'Student' },
      ]),
    },
    emailVerification: {
      findUnique: jest.fn(),
      update: verificationUpdate,
    },
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: unknown) => Promise<unknown>)(tx)
        : Promise.all(arg as unknown[]),
    ),
  } as unknown as PrismaService;

  const config = { get: () => undefined } as unknown as ConfigService;

  return {
    service: new RegistrationService(prisma, config),
    prisma,
    accountCreate,
    verificationCreate,
    accountUpdate,
    verificationUpdate,
  };
}

const input: RegisterInput = {
  email: 'new.student@ku.th',
  studentId: '6510000001',
  firstName: 'New',
  lastName: 'Student',
  password: 'correct horse battery',
};

beforeEach(() => sendMail.mockClear());

describe('register', () => {
  it('creates the account inactive, as a borrower', async () => {
    const t = build();
    await t.service.register(input);

    expect(t.accountCreate).toHaveBeenCalledTimes(1);
    const data = t.accountCreate.mock.calls[0][0].data;
    expect(data.IsActive).toBe(false);
    // Student maps to borrower; Admin is in the table first and must not win.
    expect(data.RoleKey).toBe(3);
    expect(data.HashedPassword).not.toContain(input.password);
    expect(t.verificationCreate).toHaveBeenCalledTimes(1);
  });

  it('mails a link that is not the stored hash', async () => {
    const t = build();
    await t.service.register(input);

    const stored = t.verificationCreate.mock.calls[0][0].data.TokenHash;
    const body = sendMail.mock.calls[0][0].text as string;
    const token = /verify-email\?token=([\w-]+)/.exec(body)?.[1];

    expect(token).toBeTruthy();
    expect(token).not.toBe(stored);
  });

  it('refuses an email outside the allowed domain (C-01) before touching the database', async () => {
    const t = build();
    await expect(
      t.service.register({ ...input, email: 'someone@gmail.com' }),
    ).rejects.toMatchObject({ businessCode: 'INVALID_DOMAIN' });
    expect(t.prisma.accountInfo.findFirst).not.toHaveBeenCalled();
    expect(t.accountCreate).not.toHaveBeenCalled();
  });

  it('creates nothing when the address is taken, and does not say so', async () => {
    const t = build({ clash: { Email: 'existing@ku.th' } });

    // Resolves like any other call. An error here would turn the form into a
    // way to find out who is registered.
    await expect(t.service.register(input)).resolves.toBeUndefined();
    expect(t.accountCreate).not.toHaveBeenCalled();
    expect(t.verificationCreate).not.toHaveBeenCalled();
    // The warning goes to the address on file, not to whoever submitted.
    expect(sendMail.mock.calls[0][0].to).toBe('existing@ku.th');
  });
});

describe('verify', () => {
  const live = {
    VerificationKey: 1,
    AccountKey: 42,
    ExpiresAt: new Date(Date.now() + 60_000),
    UsedAt: null,
  };

  it('activates the account and spends the token', async () => {
    const t = build();
    (t.prisma.emailVerification.findUnique as jest.Mock).mockResolvedValue(
      live,
    );

    await t.service.verify('good-token');

    expect(t.accountUpdate).toHaveBeenCalledWith({
      where: { AccountKey: 42 },
      data: { IsActive: true },
    });
    expect(t.verificationUpdate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['forged', null],
    ['already spent', { ...live, UsedAt: new Date() }],
    ['expired', { ...live, ExpiresAt: new Date(Date.now() - 1) }],
  ])('refuses a %s token without activating anything', async (_label, row) => {
    const t = build();
    (t.prisma.emailVerification.findUnique as jest.Mock).mockResolvedValue(row);

    await expect(t.service.verify('x')).rejects.toMatchObject({
      businessCode: 'VERIFICATION_TOKEN_INVALID',
    });
    expect(t.accountUpdate).not.toHaveBeenCalled();
  });

  it('answers the same code for all three', async () => {
    const t = build();
    const codes: string[] = [];
    for (const row of [
      null,
      { ...live, UsedAt: new Date() },
      { ...live, ExpiresAt: new Date(0) },
    ]) {
      (t.prisma.emailVerification.findUnique as jest.Mock).mockResolvedValue(
        row,
      );
      await t.service
        .verify('x')
        .catch((e: BusinessError) => codes.push(e.businessCode));
    }
    expect(new Set(codes).size).toBe(1);
  });
});
