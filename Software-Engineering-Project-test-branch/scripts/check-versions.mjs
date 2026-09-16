#!/usr/bin/env node
/**
 * Guards agenda 02: the backend and the frontend must resolve the SAME zod.
 *
 *     node scripts/check-versions.mjs
 *
 * Why this exists even though "npm is just a package manager".
 *
 * That is true for anything crossing the wire as JSON - HTTP does not care
 * what either side installed. But a tRPC contract does not cross the wire; it
 * crosses at COMPILE TIME, as a TypeScript type the frontend imports. The
 * generated contract file contains real zod code (`z.object(...)`, not just
 * types), so both sides have to agree on which zod that is.
 *
 * When they do not, the error looks like the type system is broken:
 *
 *     Type 'ZodObject<...>' is missing the following properties from
 *     type 'ZodType<any, any, any>': _type, _parse, _getType, ...
 *
 * Same names, different packages, incompatible types. This script is what
 * stops the repo drifting back into that state.
 *
 * NOTE: if the team later adopts npm workspaces (agenda 01 option A), a single
 * hoisted node_modules makes drift structurally impossible and this check
 * becomes a cheap formality rather than a necessity. Keeping it costs seconds
 * and it still catches a stray nested install, so there is no reason to remove
 * it either way.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Packages that must match exactly across both sides.
 *
 * How to know what belongs here: read the import statements at the top of the
 * generated contract file. Today the backend has no routers yet, so only zod
 * is shared. Add '@trpc/server' the day the frontend starts consuming the
 * contract - the generated file imports it too.
 */
const SHARED = ['zod'];

/** Where each side lives, relative to the repo root. */
const SIDES = ['backend', 'frontend'];

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

const pkgs = Object.fromEntries(
  SIDES.map((s) => [s, JSON.parse(readFileSync(join(root, s, 'package.json'), 'utf8'))]),
);

/** A dependency may sit in dependencies or devDependencies - check both. */
const declared = (pkg, name) =>
  pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? null;

console.log('\n1. the two package.json files declare the same version');
for (const name of SHARED) {
  const [a, b] = SIDES.map((s) => declared(pkgs[s], name));
  if (!a) fail(`${name} is not declared in ${SIDES[0]}/package.json`);
  else if (!b) fail(`${name} is not declared in ${SIDES[1]}/package.json`);
  else if (a !== b) fail(`${name}: ${SIDES[0]} ${a} vs ${SIDES[1]} ${b}`);
  else pass(`${name} ${a}`);
}

console.log('\n2. the version is pinned exactly, not a range');
/**
 * Why this is not pedantry.
 *
 * "^4.4.3" on both sides passes check 1 while still being unsafe: the two
 * lockfiles were resolved at different moments, so one machine can sit on
 * 4.4.3 and the other on 4.7.0 with both package.json files reading the same.
 *
 * This is not hypothetical in this repo. frontend/package.json says
 * "^3.23.8", and what is actually installed is 3.25.76.
 */
for (const name of SHARED) {
  for (const side of SIDES) {
    const v = declared(pkgs[side], name);
    if (!v) continue;
    if (/^[\^~><=*]|x$/.test(v)) fail(`${side} ${name} is a range ("${v}") - pin it exactly`);
    else pass(`${side} ${name} pinned`);
  }
}

console.log('\n3. exactly one copy is installed on each side');
/**
 * Checks 1 and 2 only read what people wrote down. A transitive dependency can
 * still pull a second copy into node_modules, and node hands different copies
 * to different files. `npm ls` is the only thing that sees that.
 *
 * When node_modules is absent this is SKIPPED, not failed. In CI this script
 * runs in its own job with no install, because installing both sides again
 * just to re-read npm ls would double the workflow runtime to prove something
 * the backend and frontend jobs already prove by compiling. Locally, where
 * node_modules exists, the check runs for real.
 */
for (const side of SIDES) {
  if (!existsSync(join(root, side, 'node_modules'))) {
    console.log(`  skip  ${side}: no node_modules here (run npm ci to include this check)`);
    continue;
  }
  for (const name of SHARED) {
    let out = '';
    try {
      out = execFileSync('npm', ['ls', name, '--json', '--all'], {
        cwd: join(root, side),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (e) {
      // npm ls exits non-zero on peer warnings but still prints usable JSON
      out = e.stdout || '';
    }

    const found = new Set();
    const walk = (node) => {
      for (const [dep, info] of Object.entries(node.dependencies ?? {})) {
        if (dep === name && info.version) found.add(info.version);
        walk(info);
      }
    };
    try { walk(JSON.parse(out || '{}')); }
    catch { fail(`${side}: could not read npm ls output for ${name}`); continue; }

    if (found.size === 0) fail(`${side}: ${name} is not installed`);
    else if (found.size > 1) fail(`${side}: ${found.size} copies of ${name} (${[...found].join(', ')})`);
    else pass(`${side}: one copy of ${name} (${[...found][0]})`);
  }
}

console.log(
  failures === 0
    ? '\nshared dependencies OK\n'
    : `\n${failures} problem(s) - a tRPC contract will not type-check across these two sides\n`,
);
process.exit(failures === 0 ? 0 : 1);
