import { Injectable } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { PrismaService } from '../prisma.service';
import { toUserOutput, type BorrowLimits } from '../common/mappers/user.mapper';
import type { CreditTier } from '../common/schemas/status.schema';
import type { UserOutput } from '../common/schemas/user.schema';
import { verifyPassword } from './password';

/** Which addresses count as a KU account for the 'ku' login method */
const KU_EMAIL = /@(ku\.ac\.th|ku\.th)$/i;

/**
 * A valid-looking hash that no password matches. Used to keep the timing of a
 * failed lookup the same as a wrong password -- see login() below.
 */
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAA==';

export interface LoginInput {
  method: 'ku' | 'local';
  identifier: string;
  password: string;
}

/**
 * The only columns any auth path reads. Declared once so login() and
 * getProfile() cannot drift apart, and so HashedPassword has to be asked for
 * explicitly (login does; getProfile must not).
 */
const ACCOUNT_SELECT = {
  AccountKey: true,
  UserID: true,
  UserFName: true,
  UserLName: true,
  Email: true,
  UserCredit: true,
  Role: { select: { RoleName: true } },
} as const;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verify credentials and return the profile. Knows nothing about tRPC,
   * cookies or HTTP -- it takes an input and either returns a UserOutput or
   * throws, so it can be tested without firing a request. The caller is what
   * attaches the session cookie.
   */
  async login(input: LoginInput): Promise<UserOutput> {
    const identifier = input.identifier.trim();

    if (input.method === 'ku' && !KU_EMAIL.test(identifier)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'NOT_KU_EMAIL' });
    }

    /**
     * Which column each method searches:
     *   ku    -> AccountInfo.Email   (students and academics)
     *   local -> AccountInfo.UserID  (staff without a KU address)
     *
     * UserID uses findUnique because AccountInfo.UserID is @unique -- exactly
     * one row or none.
     *
     * Email uses findFirst with an insensitive match, NOT findUnique. @unique
     * on Email is case-sensitive in Postgres, so 'A@ku.ac.th' and 'a@ku.ac.th'
     * can both exist and a case-insensitive lookup could still see two rows.
     * Closing that properly means normalising Email to lowercase on write --
     * a convention to settle when the seed and the registration path are
     * written, since there is no code creating accounts yet.
     */
    const account =
      input.method === 'local'
        ? await this.prisma.accountInfo.findUnique({
            where: { UserID: identifier },
            select: { ...ACCOUNT_SELECT, HashedPassword: true },
          })
        : await this.prisma.accountInfo.findFirst({
            where: { Email: { equals: identifier, mode: 'insensitive' } },
            select: { ...ACCOUNT_SELECT, HashedPassword: true },
          });

    /**
     * Why the password is still checked when no account was found.
     *
     * Returning early on a miss would answer noticeably faster than the
     * wrong-password case, because scrypt never runs. Someone probing
     * addresses can time that difference and learn which ones exist -- user
     * enumeration. So scrypt runs against a dummy value to burn the same time
     * either way.
     */
    const ok = await verifyPassword(input.password, account?.HashedPassword ?? DUMMY_HASH);

    if (!account || !ok) {
      // Same answer for both cases on purpose - never reveal "no such account".
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'INVALID_CREDENTIALS' });
    }

    // HashedPassword is dropped here: toUserOutput builds a fresh object from
    // named fields rather than spreading the row, so it cannot ride along.
    return toUserOutput(account, await this.resolveBorrowLimits(account.UserCredit));
  }

  async getProfile(accountKey: number): Promise<UserOutput> {
    const row = await this.prisma.accountInfo.findUniqueOrThrow({
      where: { AccountKey: accountKey },
      // ACCOUNT_SELECT deliberately omits HashedPassword - cannot leak by accident
      select: ACCOUNT_SELECT,
    });

    return toUserOutput(row, await this.resolveBorrowLimits(row.UserCredit));
  }

  /**
   * Converts a raw credit score into a borrow limit.
   *
   * Low credit doesn't mean "cannot borrow", it means "shorter borrow
   * window" — CreditTier (CreditMin/CreditMax) buckets the score into a
   * tier, and BorrowConstraints maps that tier to MaxBorrowDate /
   * MaxExtendTime. Eligibility to borrow at all is a separate mechanism
   * (Eligibility + MinimumAuthorityLevel).
   */
  private async resolveBorrowLimits(creditScore: number): Promise<BorrowLimits> {
    const tier = await this.prisma.creditTier.findFirstOrThrow({
      where: {
        CreditMin: { lte: creditScore },
        CreditMax: { gte: creditScore },
      },
      select: {
        CreditTierName: true,
        BorrowConstraints: {
          // Borrow rules differ per item type, so this is a general value
          // for the profile page only — the actual borrow flow must look
          // up BorrowConstraints by the item's own BorrowRuleKey.
          take: 1,
          select: { MaxBorrowDate: true, MaxExtendTime: true },
        },
      },
    });

    const constraint = tier.BorrowConstraints[0];
    return {
      creditTier: (tier.CreditTierName ?? 'D0') as CreditTier,
      maxBorrowDays: constraint?.MaxBorrowDate ?? 7,
      maxExtendTimes: constraint?.MaxExtendTime ?? 0,
    };
  }
}
