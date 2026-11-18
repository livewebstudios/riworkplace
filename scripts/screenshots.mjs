#!/usr/bin/env node
// RI Workplace home demos: screenshots for the record and for the chooser cards.
// Full pages at 390 and 1440 go to ../docs/_screenshots/round2/. The first screen of each demo at 1440
// is saved as chooser-<slug>.jpg, which optimize-images.mjs then turns into the chooser card images.
// Needs Playwright and a local server on the build folder:
//   python3 -m http.server 8765   (from build/)
//   PLAYWRIGHT_FROM=/path/with/node_modules/ node scripts/screenshots.mjs
// PLAYWRIGHT_FROM is any folder whose node_modules holds playwright. Leave it unset if it is installed in scripts/.

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PLAYWRIGHT_FROM ? join(process.env.PLAYWRIGHT_FROM, 'x.js') : import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/';
const OUT = join(HERE, '..', '..', 'docs', '_screenshots', 'round2');
const CARDS = join(HERE, '..', '..', 'docs', '_screenshots');
const site = JSON.parse(readFileSync(join(HERE, '..', 'content', 'site.json'), 'utf8'));
const pages = [{ slug: 'chooser', path: 'index.html' }, ...site.demos.map((d) => ({ slug: d.slug, path: `${d.slug}/index.html` }))];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function open(path, width, height, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 1024, isMobile: width < 768, ...opts });
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  return { ctx, page };
}
// Walk the page so lazy images load, reveals fire and BLUE HOUR's photos come up to full light,
// then return to the top. Lights on is scrubbed, so each photo is held in view long enough to finish.
async function settle(page, height) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.round(height * 0.5)) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(320); }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1400);
}

for (const { slug, path } of pages) {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    // BLUE HOUR's photos light up as they reach the visitor. A tall capture scrolled back to the top
    // would show the lower photos at dusk again, so its full-page record is taken in the
    // reduced-motion state, where every photo starts fully lit and nothing drifts.
    const reduced = slug === 'blue-hour';
    const { ctx, page } = await open(path, width, height, reduced ? { reducedMotion: 'reduce' } : {});
    await settle(page, height);
    await page.screenshot({ path: join(OUT, `${slug}-${width}-full.jpg`), fullPage: true, type: 'jpeg', quality: 82 });
    console.log(`round2/${slug}-${width}-full.jpg`);
    await ctx.close();
  }
}

// First screen of each demo at 1440 for the chooser cards. BLUE HOUR is captured after its
// lights-on intro has finished, so the card shows the lit hero.
// CARDS=blue-hour limits this step to the named demos (round 2 keeps CROSS SECTION's existing crop).
const cards = process.env.CARDS ? process.env.CARDS.split(',') : site.demos.map((d) => d.slug);
for (const d of site.demos.filter((x) => cards.includes(x.slug))) {
  const { ctx, page } = await open(`${d.slug}/index.html`, 1440, 900);
  await page.waitForTimeout(2400);
  await page.screenshot({ path: join(CARDS, `chooser-${d.slug}.jpg`), type: 'jpeg', quality: 88 });
  console.log(`chooser-${d.slug}.jpg`);
  await ctx.close();
}

await browser.close();
