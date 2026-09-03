/**
 * Convert svg/*.svg to pdf/*.pdf (vector, for \includegraphics) and
 * png/*.png (raster preview, for slides and quick review).
 *
 * Chrome does the conversion because the Inkscape on this machine is a broken
 * snap build; printing from Chrome keeps the text as real vector glyphs, so the
 * PDF stays sharp at any zoom in the report.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = dirname(fileURLToPath(import.meta.url));
const PNG_WIDTH = 2400;          // preview width; height follows the aspect ratio

mkdirSync(join(HERE, 'pdf'), { recursive: true });
mkdirSync(join(HERE, 'png'), { recursive: true });

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

for (const file of readdirSync(join(HERE, 'svg')).filter((f) => f.endsWith('.svg')).sort()) {
  const svg = readFileSync(join(HERE, 'svg', file), 'utf8');
  const w = Number(svg.match(/width="(\d+)"/)[1]);
  const h = Number(svg.match(/height="(\d+)"/)[1]);
  const name = file.replace(/\.svg$/, '');

  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>
       @page { size: ${w}px ${h}px; margin: 0 }
       html,body { margin:0; padding:0; background:#fff }
       svg { display:block }
     </style></head><body>${svg}</body></html>`,
    { waitUntil: 'load' }
  );
  await page.evaluateHandle('document.fonts.ready');

  writeFileSync(
    join(HERE, 'pdf', `${name}.pdf`),
    await page.pdf({ width: `${w}px`, height: `${h}px`, printBackground: true, pageRanges: '1' })
  );

  await page.setViewport({ width: w, height: h, deviceScaleFactor: PNG_WIDTH / w });
  writeFileSync(
    join(HERE, 'png', `${name}.png`),
    await page.screenshot({ type: 'png', fullPage: false })
  );
  await page.close();
  console.log(`✓ ${name}  pdf ${w}×${h}pt  png ${PNG_WIDTH}×${Math.round((h * PNG_WIDTH) / w)}`);
}

await browser.close();
