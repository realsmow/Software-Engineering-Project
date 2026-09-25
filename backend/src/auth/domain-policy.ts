import type { ConfigService } from '@nestjs/config';

/** C-01: every account must carry a KU e-mail. Used when nothing is configured. */
const DEFAULT_ALLOWED_DOMAINS = ['ku.th'];

/**
 * Parses ALLOWED_EMAIL_DOMAINS ("ku.th,ku.ac.th") into a lowercase list.
 *
 * Empty or unset falls back to ku.th rather than an empty list - an empty
 * list would make isEmailDomainAllowed refuse every address, which turns a
 * missing .env entry into an outage instead of the documented default.
 */
export function parseAllowedDomains(raw: string | undefined | null): string[] {
  const domains = (raw ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  return domains.length > 0 ? domains : DEFAULT_ALLOWED_DOMAINS;
}

/** Reads ALLOWED_EMAIL_DOMAINS from config at call time (env may change between calls in tests). */
export function allowedDomainsFromConfig(config: ConfigService): string[] {
  return parseAllowedDomains(config.get<string>('ALLOWED_EMAIL_DOMAINS'));
}

/**
 * True when `email`'s domain (case-insensitive) is one of `allowedDomains`.
 *
 * Pure and network-free on purpose: both self-registration and the Google
 * id_token check need the exact same rule, and a rule this security-sensitive
 * should be testable without spinning up a database or an HTTP call.
 */
export function isEmailDomainAllowed(
  email: string,
  allowedDomains: string[],
): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return false;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return allowedDomains.includes(domain);
}
