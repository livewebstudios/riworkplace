#!/usr/bin/env node
// RI Workplace home demos: screenshots for the record and for the chooser cards.
// Full pages at 390 and 1440 go to ../docs/_screenshots/<ROUND>/ (default round3). The first screen of each demo at 1440
// is saved as chooser-<slug>.jpg, which optimize-images.mjs then turns into the chooser card images.
// Env: ROUND=round3-before   PAGES=blue-hour,cross-section (limit the full-page captures)   CARDS=none (skip cards)
// CROSS SECTION (round 4): its chooser card is the first screen after the intro, drawings showing.
// MOVE-IN DAY (round 3): its full-page record is taken in the reduced-motion state, plus seven 1440 x 900
// captures of the hero, one per stage (move-in-hero-stage-0.jpg to -6.jpg). Its chooser card is stage 6.
// Needs Playwright and a local server on the build folder:
//   python3 -m http.server 8765   (from build/)
//   PLAYWRIGHT_FROM=/path/with/node_modules/ node scripts/screenshots.mjs
// PLAYWRIGHT_FROM is any folder whose node_modules holds playwright. Leave it unset if it is installed in scripts/.

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PLAYWRIGHT_FROM ? join(process.env.PLAYWRIGHT_FROM, 'x.js') : import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/';
const OUT = join(HERE, '..', '..', 'docs', '_screenshots', process.env.ROUND || 'round3');
const CARDS = join(HERE, '..', '..', 'docs', '_screenshots');
const site = JSON.parse(readFileSync(join(HERE, '..', 'content', 'site.json'), 'utf8'));
const only = process.env.PAGES ? process.env.PAGES.split(',') : null;
const pages = [{ slug: 'chooser', path: 'index.html' }, ...site.demos.map((d) => ({ slug: d.slug, path: `${d.slug}/index.html` }))]
  .filter((p) => !only || only.includes(p.slug));
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
    const reduced = slug === 'blue-hour' || slug === 'move-in-day';
    const { ctx, page } = await open(path, width, height, reduced ? { reducedMotion: 'reduce' } : {});
    await settle(page, height);
    await page.screenshot({ path: join(OUT, `${slug}-${width}-full.jpg`), fullPage: true, type: 'jpeg', quality: 82 });
    console.log(`${process.env.ROUND || 'round3'}/${slug}-${width}-full.jpg`);
    await ctx.close();
  }
}

// First screen of each demo at 1440 for the chooser cards. BLUE HOUR is captured after its
// lights-on intro has finished, so the card shows the lit hero.
// CARDS=blue-hour limits this step to the named demos (round 2 keeps CROSS SECTION's existing crop).
// MOVE-IN DAY: one 1440 x 900 capture per hero stage. Each stage is held where its plate has fully faded in.
if ((!only || only.includes('move-in-day')) && site.demos.some((d) => d.slug === 'move-in-day')) {
  const { ctx, page } = await open('move-in-day/index.html', 1440, 900);
  await page.waitForTimeout(1500); // late plates load after window load
  const span = await page.evaluate(() => {
    const hero = document.querySelector('.mi-hero');
    return { top: hero.getBoundingClientRect().top + window.scrollY, len: hero.offsetHeight - window.innerHeight };
  });
  for (let k = 0; k < 7; k++) {
    const y = Math.round(span.top + span.len * (k === 0 ? 0 : (k + 0.9) / 7));
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: join(OUT, `move-in-hero-stage-${k}.jpg`), type: 'jpeg', quality: 86 });
    console.log(`move-in-hero-stage-${k}.jpg`);
  }
  await ctx.close();
}

// CROSS SECTION (round 4): three 1440 x 900 frames of the hero sweep (start, middle, end of the sticky stage)
// and one rail card held at 50% (cross-hero-start.jpg, -middle.jpg, -end.jpg, cross-rail-card.jpg).
if ((!only || only.includes('cross-section')) && site.demos.some((d) => d.slug === 'cross-section')) {
  const { ctx, page } = await open('cross-section/index.html', 1440, 900);
  const run = await page.evaluate(() => {
    const r = document.querySelector('[data-hero-run]');
    const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'));
    return { start: r.getBoundingClientRect().top + window.scrollY - nav, travel: r.offsetHeight - document.querySelector('[data-hero]').offsetHeight };
  });
  for (const [name, f] of [['start', 0], ['middle', 0.42], ['end', 0.92]]) {
    await page.evaluate((v) => window.scrollTo(0, v), Math.round(run.start + run.travel * f));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT, `cross-hero-${name}.jpg`), type: 'jpeg', quality: 86 });
    console.log(`cross-hero-${name}.jpg`);
  }
  await page.$eval('#drawn', (el) => el.scrollIntoView());
  await page.waitForTimeout(2600); // the intro tween takes the first card to 50%
  await (await page.$('.cs-card')).screenshot({ path: join(OUT, 'cross-rail-card.jpg'), type: 'jpeg', quality: 86 });
  console.log('cross-rail-card.jpg');
  await ctx.close();
}

const cards = process.env.CARDS ? process.env.CARDS.split(',') : site.demos.map((d) => d.slug);
// MOVE-IN DAY's card is the stage 6 hero capture (the Scotts in the room).
if (cards.includes('move-in-day')) {
  copyFileSync(join(OUT, 'move-in-hero-stage-6.jpg'), join(CARDS, 'chooser-move-in-day.jpg'));
  console.log('chooser-move-in-day.jpg (from stage 6)');
}
for (const d of site.demos.filter((x) => cards.includes(x.slug) && x.slug !== 'move-in-day')) {
  const { ctx, page } = await open(`${d.slug}/index.html`, 1440, 900);
  await page.waitForTimeout(2400);
  await page.screenshot({ path: join(CARDS, `chooser-${d.slug}.jpg`), type: 'jpeg', quality: 88 });
  console.log(`chooser-${d.slug}.jpg`);
  await ctx.close();
}

await browser.close();
