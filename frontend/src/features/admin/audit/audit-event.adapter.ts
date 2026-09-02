import type { Role } from "@/types/domain";
import type { AuditAction, AuditEvent } from "../mock-data";

/**
 * The audit row the backend sends (`auditEventOutput` in
 * backend/src/admin/admin.schema.ts), converted to the shape this page reads.
 *
 * Same boundary-adapter approach as the other connected pages. The two shapes
 * are close, so this is mostly about the id being an int server-side and about
 * ip / userAgent being genuinely optional there.
 */
export interface ServerAuditEvent {
  id: number;
  at: string;
  actorId: number | null;
  actorName: string;
  actorRole: Role;
  action: AuditAction;
  target: string;
  ip: string | null;
  userAgent: string | null;
  detail: string;
}

export function toAuditEvent(s: ServerAuditEvent): AuditEvent {
  return {
    id: String(s.id),
    at: s.at,
    actorName: s.actorName,
    actorRole: s.actorRole,
    action: s.action,
    target: s.target,
    // Both are nullable on the server: a request can arrive without a
    // user-agent, and req.ip is undefined when Express does not trust the
    // proxy chain. An em dash placeholder keeps the table aligned.
    ip: s.ip ?? "-",
    userAgent: s.userAgent ?? "-",
    detail: s.detail,
  };
}
