import { Injectable } from '@nestjs/common';
import type { ContextOptions, TRPCContext } from 'nestjs-trpc';
import type { Request, Response } from 'express';
import { mapUserRole, type UserRole } from '../common/schemas/status.schema';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

/** Logged-in user - the shape every procedure relies on */
export interface TrpcUser {
  /** AccountInfo.AccountKey */
  accountKey: number;
  role: UserRole;
  /** FacultyInfo.FacultyKey - no relation on AccountInfo yet, always null for now */
  facultyKey: number | null;
  /**
   * AccountInfo.UserCredit - display only.
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
  /** null = not logged in - middleware decides which procedures allow that */
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
   * use". SessionService is the only class that knows a cookie is involved;
   * everything downstream of here only ever sees ctx.user.
   *
   * Every failure returns null rather than throwing. An unreadable session is
   * not an error, it is an anonymous request - the middleware on each
   * procedure decides whether that is allowed.
   */
  private async resolveUser(req: Request): Promise<TrpcUser | null> {
    const accountKey = this.session.read(req);
    if (accountKey === null) return null;

    const account = await this.prisma.accountInfo.findUnique({
      where: { AccountKey: accountKey },
      // Only the fields ctx needs - never the whole row, since
      // AccountInfo.HashedPassword lives in this same table.
      select: {
        AccountKey: true,
        UserCredit: true,
        FacultyKey: true,
        Role: { select: { RoleName: true } },
      },
    });
    // The token was valid but the account is gone (deleted between requests).
    if (!account) return null;

    return {
      accountKey: account.AccountKey,
      role: mapUserRole(account.Role.RoleName),
      // Null until a faculty is assigned to the account. Procedures that scope
      // by department must treat null as "not scoped" rather than "no access".
      facultyKey: account.FacultyKey,
      creditScore: account.UserCredit,
    };
  }
}
