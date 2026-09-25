/**
 * Exports a type-only snapshot of the tRPC AppRouter for the frontend.
 *
 * The frontend's Docker build context is `frontend/` only, so it cannot
 * `import type { AppRouter }` from `backend/src/generated/trpc/server.ts`
 * directly - that file (and everything it imports) is unreachable at the
 * frontend's build time, and is gitignored besides. Before this script the
 * frontend carried a hand-written mirror of the router in
 * `trpc-contract.ts`, which drifted from the real backend repeatedly.
 *
 * This script runs dts-bundle-generator against the generated router,
 * resolving every zod schema and Prisma-derived type into plain literal
 * types and folding them into one flat declaration file. The result only
 * references `@trpc/server` (which the frontend already depends on) - no
 * zod schema objects, no backend file paths, no Prisma types. That file is
 * committed at frontend/src/server/api-types.d.ts.
 *
 * Usage (from backend/):
 *
 *   npm run trpc:generate   # regenerate src/generated/trpc/server.ts first
 *   npm run api:types
 *
 * CI regenerates both and fails the build if the committed snapshot would
 * change, so a drifted type can't merge silently.
 */
import { generateDtsBundle } from 'dts-bundle-generator';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entry = path.join(backendRoot, 'src/generated/trpc/server.ts');
const outFile = path.join(
  backendRoot,
  '../frontend/src/server/api-types.d.ts',
);

if (!existsSync(entry)) {
  console.error(
    `${entry} does not exist - run "npm run trpc:generate" first.`,
  );
  process.exit(1);
}

const [bundle] = generateDtsBundle(
  [
    {
      filePath: entry,
      output: { noBanner: true },
    },
  ],
  { preferredConfigPath: path.join(backendRoot, 'tsconfig.json') },
);

const header = `/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Type-only snapshot of the backend tRPC AppRouter, produced by
 * backend/scripts/export-api-types.mjs (\`npm run api:types\` in backend).
 * Regenerate after any backend router/schema change and commit the result -
 * CI fails if this file would differ from a fresh run.
 *
 * See docs/trpc-guide.tex for the full workflow.
 */
`;

writeFileSync(outFile, header + bundle);
console.log(`Wrote ${path.relative(backendRoot, outFile)}`);
