import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { PrismaService } from '../prisma.service';
import { BusinessError } from '../common/errors/business-error';
import { hashPassword } from '../common/crypto/password';
import { SessionService } from './session.service';

/** Long enough that a stolen link is unlikely to still be live, short enough to be usable. */
const TTL_MS = 30 * 60 * 1000;

/**
 * Forgotten-password links.
 *
 * Same shape as a session: a random token goes out, only its SHA-256 is kept,
 * so a leaked database cannot be used to reset anybody's password. The token
 * is spent on first use and every session is revoked when it succeeds - the
 * reason someone resets a password is usually that somebody else knows the old
 * one, and leaving their session alive would make the reset cosmetic.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly appUrl: string;
  private readonly from: string;
  private readonly mailer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    config: ConfigService,
  ) {
    this.appUrl = (
      config.get<string>('PUBLIC_APP_URL') ?? 'http://localhost:5173'
    ).replace(/\/+$/, '');
    this.from = config.get<string>('MAIL_FROM') ?? 'ULMs <no-reply@ku.th>';
    // ponytail: no pooling, no retry queue. One short mail on a human action.
    // Defaults point at the MailHog container in docker-compose.
    this.mailer = createTransport({
      host: config.get<string>('SMTP_HOST') ?? 'localhost',
      port: Number(config.get<string>('SMTP_PORT') ?? 1025),
      secure: false,
    });
  }

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Always resolves, whether or not the address belongs to an account.
   *
   * Telling the caller "no such email" turns this endpoint into a way to find
   * out who has an account here.
   */
  async request(email: string): Promise<void> {
    const account = await this.prisma.accountInfo.findFirst({
      where: { Email: { equals: email.trim(), mode: 'insensitive' } },
      select: { AccountKey: true, Email: true, IsActive: true },
    });
    if (!account || !account.IsActive) return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordReset.create({
      data: {
        AccountKey: account.AccountKey,
        TokenHash: PasswordResetService.hash(token),
        ExpiresAt: new Date(Date.now() + TTL_MS),
      },
    });

    const link = `${this.appUrl}/reset-password?token=${token}`;
    try {
      await this.mailer.sendMail({
        to: account.Email,
        from: this.from,
        subject: 'Reset your ULMs password',
        text: `Open this link to choose a new password. It expires in 30 minutes and works once.\n\n${link}\n\nIf you did not ask for this, ignore this message; nothing has changed.`,
      });
    } catch (error) {
      // The row is already written, so the link works even if the mail did not
      // go out. Failing loudly here would also tell the caller the address
      // exists, which is the thing this method is careful not to reveal.
      this.logger.error(`Reset mail to ${account.Email} failed`, error);
    }
  }

  /** Spend a link and set the new password. */
  async reset(token: string, newPassword: string): Promise<void> {
    const row = await this.prisma.passwordReset.findUnique({
      where: { TokenHash: PasswordResetService.hash(token) },
      select: { ResetKey: true, AccountKey: true, ExpiresAt: true, UsedAt: true },
    });

    // One answer for forged, spent and expired alike: none of them should let
    // the caller learn which it was.
    if (!row || row.UsedAt || row.ExpiresAt.getTime() <= Date.now()) {
      throw new BusinessError('RESET_TOKEN_INVALID');
    }

    await this.prisma.$transaction([
      this.prisma.accountInfo.update({
        where: { AccountKey: row.AccountKey },
        data: { HashedPassword: await hashPassword(newPassword) },
      }),
      this.prisma.passwordReset.update({
        where: { ResetKey: row.ResetKey },
        data: { UsedAt: new Date() },
      }),
    ]);

    await this.sessions.revokeAllForAccount(row.AccountKey);
  }
}
