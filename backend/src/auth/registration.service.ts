import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../prisma.service';
import { BusinessError } from '../common/errors/business-error';
import { hashPassword } from '../common/crypto/password';
import { mailSettings } from '../common/mail/mailer';
import { tryMapUserRole } from '../common/schemas/status.schema';
import type { RegisterInput } from './auth.schema';
import { BASE_CREDIT } from '../common/credit/recompute-credit';
import {
  allowedDomainsFromConfig,
  isEmailDomainAllowed,
} from './domain-policy';

/** A day, so a link sent overnight still works in the morning. */
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Self-registration.
 *
 * The account row is written straight away with IsActive false. That is the
 * part worth understanding: an unconfirmed account cannot sign in, because
 * AuthService.authenticate refuses an inactive row, and it cannot receive a
 * password reset link either, because PasswordResetService skips inactive
 * rows. What it does do is hold the email address and the student id, so a
 * second person cannot claim either while the first confirmation is still
 * outstanding.
 *
 * Nothing here ever tells the caller whether an address is already registered.
 * `register` resolves the same way for a free address and a taken one; when it
 * is taken the mail goes to the address itself, saying an account already
 * exists, which is information the owner can use and a stranger cannot.
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);
  private readonly mailer: Transporter;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const settings = mailSettings(config);
    this.mailer = settings.mailer;
    this.from = settings.from;
    this.appUrl = settings.appUrl;
  }

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Always resolves, whether or not the address or student id is free.
   *
   * A thrown EMAIL_ALREADY_IN_USE would make this form a way to find out who
   * has an account here, which is the one thing a public endpoint must not
   * hand out.
   */
  async register(input: RegisterInput): Promise<void> {
    const email = input.email.trim();
    const studentId = input.studentId.trim();

    // C-01: only a KU e-mail may hold an account. Checked before the clash
    // lookup below so a disallowed address never touches AccountInfo at all -
    // this is the one registration rule that is allowed to say why it failed,
    // since "wrong domain" reveals nothing about who is already registered.
    // Read at call time, not cached at construction, so a config change or a
    // test does not need a new instance to take effect.
    if (!isEmailDomainAllowed(email, allowedDomainsFromConfig(this.config))) {
      throw new BusinessError('INVALID_DOMAIN');
    }

    const clash = await this.prisma.accountInfo.findFirst({
      where: {
        OR: [
          { Email: { equals: email, mode: 'insensitive' } },
          { UserID: studentId },
        ],
      },
      select: { Email: true },
    });

    if (clash) {
      await this.sendAlreadyRegistered(clash.Email);
      return;
    }

    const roleKey = await this.borrowerRoleKey();
    const token = randomBytes(32).toString('base64url');

    // One transaction: an account with no verification row could never be
    // activated, and would sit on the address forever.
    await this.prisma.$transaction(async (tx) => {
      const account = await tx.accountInfo.create({
        data: {
          Email: email,
          HashedPassword: await hashPassword(input.password),
          UserID: studentId,
          UserFName: input.firstName.trim(),
          UserLName: input.lastName.trim(),
          UserCredit: BASE_CREDIT,
          RoleKey: roleKey,
          IsActive: false,
        },
        select: { AccountKey: true },
      });

      await tx.emailVerification.create({
        data: {
          AccountKey: account.AccountKey,
          TokenHash: RegistrationService.hash(token),
          ExpiresAt: new Date(Date.now() + TTL_MS),
        },
      });
    });

    const link = `${this.appUrl}/verify-email?token=${token}`;
    await this.send(
      email,
      'Confirm your ULMs account',
      `Open this link to finish creating your account. It expires in 24 hours and works once.\n\n${link}\n\nIf you did not sign up, ignore this message. The account cannot be used until the link is opened.`,
    );
  }

  /** Spend a link and let the account sign in. */
  async verify(token: string): Promise<void> {
    const row = await this.prisma.emailVerification.findUnique({
      where: { TokenHash: RegistrationService.hash(token) },
      select: {
        VerificationKey: true,
        AccountKey: true,
        ExpiresAt: true,
        UsedAt: true,
      },
    });

    // One answer for forged, spent and expired alike, same as a reset link.
    if (!row || row.UsedAt || row.ExpiresAt.getTime() <= Date.now()) {
      throw new BusinessError('VERIFICATION_TOKEN_INVALID');
    }

    await this.prisma.$transaction([
      this.prisma.accountInfo.update({
        where: { AccountKey: row.AccountKey },
        data: { IsActive: true },
      }),
      this.prisma.emailVerification.update({
        where: { VerificationKey: row.VerificationKey },
        data: { UsedAt: new Date() },
      }),
    ]);
  }

  /**
   * Which RoleKey a self-registered account gets.
   *
   * Always borrower, and not a parameter. A public endpoint that took a role
   * would be a way to mint an admin.
   */
  private async borrowerRoleKey(): Promise<number> {
    const rows = await this.prisma.roleInfo.findMany({
      select: { RoleKey: true, RoleName: true },
    });
    const match = rows.find(
      (row) => tryMapUserRole(row.RoleName) === 'borrower',
    );
    if (!match) {
      throw new BusinessError('ROLE_NOT_CONFIGURED', { role: 'borrower' });
    }
    return match.RoleKey;
  }

  private sendAlreadyRegistered(to: string): Promise<void> {
    return this.send(
      to,
      'Someone tried to sign up with your ULMs address',
      `An account already exists for this address, so nothing was created.\n\nIf that was you, sign in instead, or use the forgotten-password link if you cannot remember it: ${this.appUrl}/forgot-password\n\nIf it was not you, no action is needed.`,
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    try {
      await this.mailer.sendMail({ to, from: this.from, subject, text });
    } catch (error) {
      // The rows are already written, so a verification link still works even
      // if the mail did not go out. Failing loudly here would also tell the
      // caller which branch ran, which is what this service avoids.
      this.logger.error(`Mail to ${to} failed`, error);
    }
  }
}
