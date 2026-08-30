# ADR-001 · Local password authentication, with OIDC as the target

Status: **accepted** · 31 Aug 2026 · supersedes nothing

## Context

ULMs authenticates users itself: `auth.login` checks a password against
`AccountInfo.HashedPassword` using scrypt, and issues a session cookie backed
by a `SessionInfo` row.

The obvious alternative is to delegate authentication to Kasetsart University's
identity provider over OIDC or SAML. That is the better architecture for a
system that will hold real student records, and it is not in dispute:

- The application never stores a credential, so it cannot leak one.
- Password reset, lockout and credential-stuffing move to the university, which
  already runs them properly.
- Users inherit institutional policy, including MFA, for free.
- Under PDPA, credentials never held are credentials never breached.

It is not adopted now for one reason: **we do not have access to it.**
Registering an OIDC client with the university IdP is an institutional request
requiring IT approval, not something a project team can provision. The `@ku.th`
addresses this system uses today are ordinary account identifiers that happen to
resemble university mail; no part of the flow touches Google Workspace or any
university IdP.

## Decision

Authenticate locally with scrypt, and treat OIDC as the target architecture to
adopt if this system is ever deployed beyond a course project.

Do **not** pre-build for it. No provider abstraction, no nullable password
column, no configuration switch. An interface with a single implementation
usually encodes a wrong guess about the second one, and the migration below is
cheap enough that guessing early buys nothing.

## Consequences

Accepted, with eyes open:

- We store password hashes and carry the liability that implies.
- We own password reset. `admin.resetPassword` issues a temporary password that
  is displayed once, because there is no mail delivery.
- There is no MFA.

Mitigated in the current design:

- scrypt with N=16384, r=8 (~16 MB per hash), the baseline Node's documentation
  recommends. Memory-hard, and no native dependency.
- Failed-login throttling, per account and per IP.
- Sessions are revocable, so a compromised account can be cut off immediately
  rather than at token expiry.
- `AccountInfo.IsActive` blocks sign-in outright and revokes live sessions.

## Migration path, if the IdP becomes available

Password handling is deliberately confined to four places. Everything else that
mentions `HashedPassword` is a comment saying not to select it.

| Change | Where |
|---|---|
| Replace credential check with an OIDC callback resolving verified email to AccountKey | `auth/auth.service.ts` `authenticate()` |
| Drop temporary-password issuing | `admin/admin.service.ts` `createUser`, `resetPassword` |
| Stop seeding passwords | `seed.ts` |
| Retire or keep for fallback only | `common/crypto/password.ts` |
| Make the column nullable for IdP-only accounts | `AccountInfo.HashedPassword` |

Unchanged, and this is the point: `SessionInfo` and revocation, `logoutAll`,
`IsActive`, role mapping, `ctx.user`, every middleware, the throttle, and all
30 procedures. OIDC replaces *who proved they are who they claim*, not session
lifetime, roles, or authorisation - none of which an IdP knows about.

The frontend needs no structural change either. Its two-tab login, "KU email"
and "Local account", is already the shape that OIDC-primary-with-local-fallback
wants; only what sits behind the KU tab changes.

## A local path must survive

Even after adopting OIDC, keep at least one local administrator account.

If the IdP is unreachable, or the client registration lapses, and local login is
the only way in, nobody can administer the system - including fixing the
integration that broke. This is a break-glass account, not a convenience.

scrypt remains adequate for that handful of accounts. The argument for a
stronger KDF such as Argon2id rests on protecting a large hash dump from offline
cracking; with two or three emergency accounts there is no dump worth the native
dependency.

## Revisit when

- The university grants an OIDC or SAML client registration, or
- this system is deployed with real student credentials outside a course
  project, at which point the ADR should be re-decided rather than assumed.
