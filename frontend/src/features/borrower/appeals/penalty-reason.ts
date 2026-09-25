import type { TFunction } from "i18next";

/** The PenaltyReason enum in schema.prisma. */
const REASON_CODES = ["DamagedItem", "BrokenItem", "LostItem", "DidntReturn", "ReturnLate"] as const;

/**
 * A penalty's reason in the reader's language.
 *
 * `PenaltyInfo.Reason` is free text, but everything the penalty service writes
 * is `<PenaltyReason>` or `<PenaltyReason>: <note>` (common/penalty/
 * penalty.service.ts `apply`). The code is translated and the note kept as
 * written; anything else, such as an administrator's ban reason, is shown as-is.
 */
export function penaltyReasonText(reason: string | null, t: TFunction): string {
  if (!reason) return t("borrower.penalty.noReason");
  const match = /^([A-Za-z]+)(?::\s*(.*))?$/s.exec(reason.trim());
  const code = match?.[1];
  if (!code || !(REASON_CODES as readonly string[]).includes(code)) return reason;
  const label = t(`borrower.penalty.reason${code}`);
  return match?.[2] ? `${label} (${match[2]})` : label;
}
