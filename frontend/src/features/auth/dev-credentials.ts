import type { Role } from "@/types/domain";

/**
 * The development sign-in accounts, and the guard that keeps them out of a
 * production build.
 *
 * These are no longer mock credentials. Login goes through `auth.login`
 * against the real server, and every username below is an account
 * `backend/src/seed.ts` actually creates - which is why the old warning here
 * ("no backend yet", "do NOT seed these usernames into any database") has been
 * removed rather than reworded: it described the opposite of what the system
 * now does, and a stale safety note is worse than none.
 *
 * What has not changed is that the passwords are published in two READMEs, so
 * a build carrying them must never reach production. `import.meta.env.DEV` is
 * replaced by a literal at build time, so the production bundle keeps only the
 * empty array and the strings are never emitted. main.tsx asserts on that.
 */
export const DEV_CREDENTIALS: {
  username: string;
  password: string;
  role: Exclude<Role, "borrower">;
}[] = import.meta.env.DEV
  ? [
      { username: "test_staff", password: "staff1234", role: "staff" },
      { username: "test_supervisor", password: "supervisor1234", role: "supervisor" },
      { username: "test_admin", password: "admin1234", role: "admin" },
    ]
  : [];
