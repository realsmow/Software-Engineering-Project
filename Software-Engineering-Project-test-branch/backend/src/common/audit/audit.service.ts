import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { mapUserRole } from '../schemas/status.schema';
import type { AuditAction, AuditEvent } from '../../admin/admin.schema';
import type { PaginationInput } from '../schemas/pagination.schema';
import { toPage, toSkipTake } from '../schemas/pagination.schema';

/** What the caller knows about the actor and the request they arrived on. */
export interface AuditActor {
  accountKey: number;
  ip?: string | null;
  userAgent?: string | null;
}

interface AuditRow {
  AuditKey: number;
  At: Date;
  ActorKey: number | null;
  ActorName: string;
  ActorRole: string;
  Action: string;
  Target: string;
  Ip: string | null;
  UserAgent: string | null;
  Detail: string;
}

function toAuditEvent(row: AuditRow): AuditEvent {
  return {
    id: row.AuditKey,
    at: row.At.toISOString(),
    actorId: row.ActorKey,
    actorName: row.ActorName,
    actorRole: row.ActorRole as AuditEvent['actorRole'],
    action: row.Action as AuditAction,
    target: row.Target,
    ip: row.Ip,
    userAgent: row.UserAgent,
    detail: row.Detail,
  };
}

/**
 * Writes and reads the append-only audit trail.
 *
 * Two rules this service exists to enforce:
 *
 *  - Nothing here updates or deletes a row, and no procedure exposes a way to.
 *    A trail that can be edited after the fact answers no question worth
 *    asking.
 *
 *  - Writing must never break the action being recorded. If the log write
 *    fails, the disable or role change that just succeeded still stands, and
 *    the failure goes to the server log instead of being thrown. Losing one
 *    audit row is bad; rolling back a completed security action because its
 *    audit row failed is worse, and would leave the caller unsure which of the
 *    two actually happened.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    actor: AuditActor,
    action: AuditAction,
    target: string,
    detail: string,
  ): Promise<void> {
    try {
      // Name and role are copied in rather than joined on read: a join would
      // rewrite history every time someone is renamed or promoted, and the log
      // has to say what was true when it happened.
      const account = await this.prisma.accountInfo.findUnique({
        where: { AccountKey: actor.accountKey },
        select: {
          UserFName: true,
          UserLName: true,
          Role: { select: { RoleName: true } },
        },
      });

      await this.prisma.auditLog.create({
        data: {
          ActorKey: actor.accountKey,
          ActorName: account
            ? `${account.UserFName} ${account.UserLName}`.trim()
            : `account:${actor.accountKey}`,
          ActorRole: account ? mapUserRole(account.Role.RoleName) : 'admin',
          Action: action,
          Target: target,
          Ip: actor.ip ?? null,
          UserAgent: actor.userAgent ?? null,
          Detail: detail,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit row for ${action} on ${target}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Newest first, because an audit log is read to answer "what just happened". */
  async list(input: PaginationInput & { action?: AuditAction }) {
    const where = input.action ? { Action: input.action } : {};

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { At: 'desc' },
        ...toSkipTake(input),
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return toPage<AuditEvent>(rows.map(toAuditEvent), total, input);
  }

  async getById(id: number): Promise<AuditEvent | null> {
    const row = await this.prisma.auditLog.findUnique({
      where: { AuditKey: id },
    });
    return row ? toAuditEvent(row) : null;
  }
}
