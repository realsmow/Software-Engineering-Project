import { isEmailDomainAllowed } from '../auth/domain-policy';

export type CsvRole = 'borrower' | 'staff' | 'supervisor';

export interface CsvUser {
  line: number;
  email: string;
  studentId: string;
  firstName: string;
  lastName: string;
  role: CsvRole;
  /** Department or club name; empty means none. */
  group: string;
}

const HEADER = ['email', 'student_id', 'first_name', 'last_name'];
const ROLES: CsvRole[] = ['borrower', 'staff', 'supervisor'];

/**
 * Reads the bulk-import file. Columns: email, student_id, first_name,
 * last_name, then optional role (borrower by default) and group.
 *
 * Every problem is collected rather than stopping at the first, so the whole
 * file can be fixed in one go. The caller writes nothing if `errors` is not
 * empty.
 */
export function parseUserCsv(
  text: string,
  allowedDomains: string[],
): { users: CsvUser[]; errors: string[] } {
  // Excel saves CSV with a BOM and CRLF line ends.
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  if (HEADER.some((h, i) => header[i] !== h)) {
    return {
      users: [],
      errors: [`line 1: header must start with ${HEADER.join(',')}`],
    };
  }
  const roleAt = header.indexOf('role');
  const groupAt = header.indexOf('group');

  const users: CsvUser[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((raw, i) => {
    const line = i + 2;
    if (!raw.trim()) return;
    // ponytail: no quoted fields; names with commas are refused, not parsed.
    if (raw.includes('"')) {
      errors.push(`line ${line}: quotes are not supported`);
      return;
    }
    const cells = raw.split(',').map((c) => c.trim());
    const [email, studentId, firstName, lastName] = cells;
    const role = (cells[roleAt] || 'borrower').toLowerCase() as CsvRole;
    const group = groupAt >= 0 ? (cells[groupAt] ?? '') : '';

    if (!email || !studentId || !firstName || !lastName) {
      errors.push(
        `line ${line}: email, student_id, first_name and last_name are required`,
      );
      return;
    }
    if (
      !/^[^@\s]+@[^@\s]+$/.test(email) ||
      !isEmailDomainAllowed(email, allowedDomains)
    ) {
      errors.push(
        `line ${line}: ${email} is not a KU email (${allowedDomains.join(', ')})`,
      );
    }
    if (roleAt >= 0 && !ROLES.includes(role)) {
      errors.push(`line ${line}: role must be one of ${ROLES.join(', ')}`);
    }
    for (const key of [email.toLowerCase(), `id:${studentId}`]) {
      if (seen.has(key))
        errors.push(`line ${line}: ${key.replace('id:', '')} appears twice`);
      seen.add(key);
    }
    users.push({ line, email, studentId, firstName, lastName, role, group });
  });
  return { users, errors };
}
