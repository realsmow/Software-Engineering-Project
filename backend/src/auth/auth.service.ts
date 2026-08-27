import { Injectable } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { PrismaService } from '../prisma.service';
import { toUserOutput } from '../common/mappers/user.mapper';
import { creditBand, type CreditBand } from '../common/schemas/status.schema';
import type { UserOutput } from '../common/schemas/user.schema';
import type {
  KuLoginInput,
  LocalLoginInput,
  RegisterInput,
} from '../common/schemas/auth.schema';
import { PasswordService } from './password.service';

/** Credit every new account starts on — top of the D0 band */
const STARTING_CREDIT = 100;

/** RoleInfo.RoleName values that mean "ordinary borrower" (see mapUserRole) */
const BORROWER_ROLE_NAMES = ['Student', 'Borrower'];

/** Columns that make up a UserOutput — never includes HashedPassword */
const PROFILE_SELECT = {
  AccountKey: true,
  UserID: true,
  UserFName: true,
  UserLName: true,
  Email: true,
  UserCredit: true,
  FacultyKey: true,
  Role: { select: { RoleName: true } },
} as const;

/** A signed-in account: the profile to return plus the key to put in the JWT */
export interface AuthResult {
  accountKey: number;
  user: UserOutput;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
  ) {}

  async getProfile(accountKey: number): Promise<UserOutput> {
    const row = await this.prisma.accountInfo.findUniqueOrThrow({
      where: { AccountKey: accountKey },
      select: PROFILE_SELECT,
    });

    return toUserOutput(row, await this.resolveCreditBand(row.UserCredit));
  }

  /** KU email sign-in — students and faculty */
  async loginWithKuEmail(input: KuLoginInput): Promise<AuthResult> {
    return this.login({ Email: input.email.trim().toLowerCase() }, input.password);
  }

  /** Local account sign-in — department staff without a KU email */
  async loginWithLocalAccount(input: LocalLoginInput): Promise<AuthResult> {
    return this.login({ Username: input.username.trim() }, input.password);
  }

  /**
   * Shared credential check for both sign-in methods.
   *
   * Every failure path returns the same INVALID_CREDENTIALS error and costs
   * roughly the same time, so the response can't be used to work out whether
   * an account exists.
   */
  private async login(
    where: { Email: string } | { Username: string },
    plainPassword: string,
  ): Promise<AuthResult> {
    const account = await this.prisma.accountInfo.findUnique({
      where,
      // The one query in the app allowed to read the hash.
      select: { ...PROFILE_SELECT, HashedPassword: true },
    });

    if (!account) {
      await this.password.fakeVerify();
      throw AuthService.invalidCredentials();
    }

    const ok = await this.password.verify(plainPassword, account.HashedPassword);
    if (!ok) throw AuthService.invalidCredentials();

    return {
      accountKey: account.AccountKey,
      user: toUserOutput(account, await this.resolveCreditBand(account.UserCredit)),
    };
  }

  /** Public self-registration — always creates an ordinary borrower */
  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();

    const existing = await this.prisma.accountInfo.findUnique({
      where: { Email: email },
      select: { AccountKey: true },
    });
    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: 'EMAIL_ALREADY_REGISTERED' });
    }

    /**
     * Role is looked up rather than accepted from input — letting a caller
     * pick their own role would make every permission check meaningless.
     */
    const role = await this.prisma.roleInfo.findFirst({
      where: { RoleName: { in: BORROWER_ROLE_NAMES, mode: 'insensitive' } },
      select: { RoleKey: true },
    });
    if (!role) {
      throw new Error(
        `No borrower role found in RoleInfo (looked for ${BORROWER_ROLE_NAMES.join(' or ')}) — seed the role table first.`,
      );
    }

    const account = await this.prisma.accountInfo.create({
      data: {
        Email: email,
        HashedPassword: await this.password.hash(input.password),
        UserID: input.studentId.trim(),
        UserFName: input.firstName.trim(),
        UserLName: input.lastName.trim(),
        UserCredit: STARTING_CREDIT,
        RoleKey: role.RoleKey,
      },
      select: PROFILE_SELECT,
    });

    return {
      accountKey: account.AccountKey,
      user: toUserOutput(account, await this.resolveCreditBand(account.UserCredit)),
    };
  }

  /**
   * Converts a raw credit score into the band the frontend displays.
   *
   * Low credit doesn't mean "cannot borrow", it means "shorter borrow
   * window" — CreditTier (CreditMin/CreditMax) buckets the score, and the
   * frontend's CREDIT_BANDS constant turns the band into loan days.
   * Eligibility to borrow at all is a separate mechanism (Eligibility +
   * MinimumAuthorityLevel).
   */
  private async resolveCreditBand(creditScore: number): Promise<CreditBand> {
    const tier = await this.prisma.creditTier.findFirst({
      where: {
        CreditMin: { lte: creditScore },
        CreditMax: { gte: creditScore },
      },
      select: { CreditTierName: true },
    });

    if (!tier?.CreditTierName) {
      throw new Error(
        `No CreditTier row covers a credit score of ${creditScore} — seed the CreditTier table so every score from 0 to 100 falls in a band.`,
      );
    }

    // Fails loudly if the DB grows a band the API doesn't know about, rather
    // than shipping an unknown string to the frontend.
    return creditBand.parse(tier.CreditTierName);
  }

  private static invalidCredentials(): TRPCError {
    return new TRPCError({ code: 'UNAUTHORIZED', message: 'INVALID_CREDENTIALS' });
  }
}
