import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const srs = readFileSync('docs/specs/srs_data.py', 'utf8');
const matrixPath = 'docs/test-requirement-matrix.md';
const matrix = readFileSync(matrixPath, 'utf8');

// Match only the first cell of a requirement row. Reading source text avoids
// executing the Python document data or treating its prose as instructions.
const expected = new Set(
  [...srs.matchAll(/^\s*\['((?:FR|NFR)-[A-Z]+-\d+)'/gm)].map((match) => match[1]),
);
const start = '<!-- requirement-matrix:start -->';
const end = '<!-- requirement-matrix:end -->';
const first = matrix.indexOf(start);
const last = matrix.indexOf(end);
if (first < 0 || last <= first) {
  throw new Error(`Missing requirement-matrix markers in ${matrixPath}`);
}

const table = matrix.slice(first + start.length, last);
const mapped = [...table.matchAll(/\b(?:FR|NFR)-[A-Z]+-\d+\b/g)].map((match) => match[0]);
const counts = new Map();
for (const id of mapped) counts.set(id, (counts.get(id) ?? 0) + 1);

const missing = [...expected].filter((id) => !counts.has(id));
const extra = [...counts.keys()].filter((id) => !expected.has(id));
const repeated = [...counts].filter(([, count]) => count !== 1).map(([id]) => id);
const brokenLinks = [...table.matchAll(/\]\((\.\.\/[^)]+)\)/g)]
  .map((match) => match[1])
  .filter((link) => !existsSync(resolve(dirname(matrixPath), link)));

if (missing.length || extra.length || repeated.length || brokenLinks.length) {
  throw new Error([
    `Traceability matrix is out of sync with the SRS.`,
    `Missing IDs: ${missing.join(', ') || 'none'}`,
    `Unknown IDs: ${extra.join(', ') || 'none'}`,
    `Repeated IDs: ${repeated.join(', ') || 'none'}`,
    `Broken links: ${brokenLinks.join(', ') || 'none'}`,
  ].join('\n'));
}

console.log(`Traceability matrix: ${expected.size} SRS requirements mapped once; all evidence links exist.`);
