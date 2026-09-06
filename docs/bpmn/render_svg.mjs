/**
 * Render every *.bpmn in this folder to svg/<name>.svg using the real bpmn-js
 * viewer inside headless Chrome.
 *
 * This doubles as the validation step: bpmn-js reports an import warning for any
 * dangling reference or shape without DI, so a clean run means the generated XML
 * is a model that real BPMN tools accept, not just well-formed XML.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEWER = readFileSync(
  join(HERE, 'node_modules/bpmn-js/dist/bpmn-viewer.production.min.js'),
  'utf8'
);

// diagram-js measures label text in the browser to decide where to wrap, so the
// Thai font has to win there, not only in the exported file.
const FONT_CSS = `
  text, tspan { font-family: "Noto Sans Thai", "Noto Sans", sans-serif !important; }
`;

const files = readdirSync(HERE).filter((f) => f.endsWith('.bpmn')).sort();
mkdirSync(join(HERE, 'svg'), { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
const page = await browser.newPage();
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8">
   <style>html,body{margin:0}#c{width:6000px;height:3000px}${FONT_CSS}</style>
   <script>${VIEWER}</script></head><body><div id="c"></div></body></html>`,
  { waitUntil: 'load' }
);

let failed = 0;
for (const file of files) {
  const xml = readFileSync(join(HERE, file), 'utf8');
  const result = await page.evaluate(async (xml) => {
    const viewer = new window.BpmnJS({ container: '#c' });
    try {
      const { warnings } = await viewer.importXML(xml);
      const { svg } = await viewer.saveSVG();
      return { warnings: warnings.map((w) => w.message), svg };
    } catch (err) {
      return { error: String(err.message || err), warnings: [] };
    } finally {
      viewer.destroy();
    }
  }, xml);

  const name = file.replace(/\.bpmn$/, '');
  if (result.error) {
    console.error(`✗ ${name}: ${result.error}`);
    failed++;
    continue;
  }
  for (const w of result.warnings) console.warn(`  ! ${name}: ${w}`);
  if (result.warnings.length) failed++;

  // Carry the font choice into the exported file so the SVG looks the same when
  // it is opened outside a browser (Inkscape, LaTeX, the team's slides).
  const svg = result.svg.replace(/(<svg[^>]*>)/, `$1<style>${FONT_CSS}</style>`);
  const out = join(HERE, 'svg', `${name}.svg`);
  writeFileSync(out, svg, 'utf8');
  const [, w, h] = svg.match(/width="(\d+)"\s+height="(\d+)"/) ?? [, '?', '?'];
  console.log(`✓ ${name}  ${w}×${h}px  ${(svg.length / 1024).toFixed(0)} KB`);
}

await browser.close();
process.exit(failed ? 1 : 0);
