import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreditTierService } from '../common/credit/credit-tier.service';
import { BusinessError } from '../common/errors/business-error';
import { dummyPasswordHash, verifyPassword } from '../common/crypto/password';
import { toUserOutput } from '../common/mappers/user.mapper';
import type { UserOutput } from '../common/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditTiers: CreditTierService,
  ) {}

  async getProfile(accountKey: number): Promise<UserOutput> {
    const row = await this.prisma.accountInfo.findUniqueOrThrow({
      where: { AccountKey: accountKey },
      select: {
        AccountKey: true,
        UserID: true,
        UserFName: true,
        UserLName: true,
        Email: true,
        UserCredit: true,
        Role: { select: { RoleName: true } },
        Faculty: { select: { FacultyName: true } },
        // HashedPassword intentionally not selected - cannot leak by accident
      },
    });

    return toUserOutput(
      row,
      await this.creditTiers.resolveBorrowLimits(row.UserCredit),
    );
  }

  /**
   * Checks credentials and returns the AccountKey to open a session for.
   *
   * Two things this deliberately does NOT do:
   *
   *  - it never says whether the account exists. Both "no such user" and
   *    "wrong password" produce the same INVALID_CREDENTIALS, and when the
   *    account is missing it still spends the cost of one hash against a dummy
   *    value, so the two cases take the same time. Skipping that turns the
   *    login endpoint into a way to enumerate which KU emails are registered.
   *
   *  - it does not touch the session. Issuing the cookie is the router's job,
   *    which keeps this method testable without an HTTP response object.
   */
  async authenticate(username: string, password: string): Promise<number> {
    const identifier = username.trim();

    const account = await this.prisma.accountInfo.findFirst({
      // findFirst rather than findUnique because the OR spans two columns;
      // findUnique takes a single unique field. Both Email and UserID now
      // carry a unique constraint, so at most one row can match either arm.
      where: {
        OR: [
          { Email: { equals: identifier, mode: 'insensitive' } },
          { UserID: identifier },
        ],
      },
      select: { AccountKey: true, HashedPassword: true, IsActive: true },
    });

    const stored = account?.HashedPassword ?? (await dummyPasswordHash());
    const matches = await verifyPassword(password, stored);

    if (!account || !matches) {
      throw new BusinessError('INVALID_CREDENTIALS');
    }

    // Checked after the password on purpose. Answering "this account is
    // disabled" to anyone who asks would confirm the account exists; behind a
    // correct password it tells the owner something useful and tells an
    // attacker nothing they had not already proven.
    if (!account.IsActive) {
      throw new BusinessError('ACCOUNT_DISABLED');
    }

    return account.AccountKey;
  }
}
