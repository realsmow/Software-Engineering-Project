import { Injectable } from '@nestjs/common';
import type { ContextOptions, TRPCContext } from 'nestjs-trpc';
import type { Request, Response } from 'express';
import { mapUserRole, type UserRole } from '../common/schemas/status.schema';
import { PrismaService } from '../prisma.service';
import { SESSION_COOKIE, SessionService } from '../auth/session';

/** Logged-in user — the shape every procedure relies on */
export interface TrpcUser {
  /** AccountInfo.AccountKey */
  accountKey: number;
  role: UserRole;
  /** FacultyInfo.FacultyKey — no relation on AccountInfo yet, always null for now */
  facultyKey: number | null;
  /**
   * AccountInfo.UserCredit — display only.
   *
   * Credit score does not decide *whether* a user can borrow, only *how
   * long* via CreditTier -> BorrowConstraints.MaxBorrowDate. Any procedure
   * computing a real due date must re-read the score live from the DB,
   * since a cron job may dock credit while a request is in flight.
   */
  creditScore: number;
}

export interface TrpcContext {
  req: Request;
  res: Response;
  /** null = not logged in — middleware decides which procedures allow that */
  user: TrpcUser | null;
  [key: string]: unknown;
}

@Injectable()
export class AppContext implements TRPCContext {
  constructor(
    private readonly prisma: PrismaService,
    private readonly session: SessionService,
  ) {}

  async create(opts: ContextOptions): Promise<TrpcContext> {
    const req = opts.req as Request;
    const res = opts.res as Response;

    return {
      req,
      res,
      user: await this.resolveUser(req),
    };
  }

  /**
   * Turns "whatever came in over HTTP" into "whatever business logic can
   * use". This is the only place that knows about cookies — everywhere
   * else in the app only ever sees ctx.user.
   */
  private async resolveUser(req: Request): Promise<TrpcUser | null> {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) return null;

    // Signature and expiry only. Whether the account still exists, and what
    // role it has today, is read from the database below on every request --
    // the token deliberately carries neither. See session.ts.
    const accountKey = this.session.verify(token);
    if (accountKey === null) return null;

    const account = await this.prisma.accountInfo.findUnique({
      where: { AccountKey: accountKey },
      // Only the fields ctx needs — never the whole row, since
      // AccountInfo.HashedPassword lives in this same table.
      select: {
        AccountKey: true,
        UserCredit: true,
        Role: { select: { RoleName: true } },
      },
    });
    if (!account) return null;

    return {
      accountKey: account.AccountKey,
      role: mapUserRole(account.Role.RoleName),
      facultyKey: null,
      creditScore: account.UserCredit,
    };
  }

}
