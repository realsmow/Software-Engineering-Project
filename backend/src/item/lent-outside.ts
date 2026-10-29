/**
 * "Lent outside the system" (requested 29 Oct 2569) without a new
 * ResourceStatus value, which would need a migration and the BE lead.
 *
 * Staff withdraw the unit from lending with this fixed note (setUnitLendable
 * with `lentOutside`), and a withdrawn unit whose latest condition note is
 * this one is reported as lent outside. Thai, like every other note staff
 * write, because the condition history shows notes as written.
 */
export const LENT_OUTSIDE_NOTE = 'ยืมนอกระบบ';

/** The note to store: the fixed text, then the staff member's own, if any. */
export function lentOutsideNote(reason: string | undefined): string {
  return reason ? `${LENT_OUTSIDE_NOTE}: ${reason}` : LENT_OUTSIDE_NOTE;
}

/** Whether a note was written by a "lent outside" withdrawal. */
export function isLentOutsideNote(note: string | null): boolean {
  return (
    note !== null &&
    (note === LENT_OUTSIDE_NOTE || note.startsWith(`${LENT_OUTSIDE_NOTE}: `))
  );
}
