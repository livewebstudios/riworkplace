#!/usr/bin/env node
// RI Workplace home demos: read-only image and page fetch from the live site.
// Zero dependencies. Downloads full-size originals to ../docs/assets/originals/<slug>/
// and the project pages (HTML) to ../docs/assets/pages/ for the copy audit.
// Nothing here writes to riworkplace.com. Run: node scripts/fetch-images.mjs

import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(BUILD, '..', 'docs', 'assets');
const SITE = 'https://riworkplace.com';
const UPLOADS = `${SITE}/wp-content/uploads/`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// Handoff sections 7.2 to 7.6. Paths are relative to wp-content/uploads/.
const FILES = {
  'ls-power': [
    '2-scaled.webp', '8-1-scaled.jpg', '3-scaled.webp', '13-1-scaled.jpg', '22-1-scaled.jpg', '30-1-scaled.jpg',
    '17-1-scaled.jpg', 'ls-power-office-cafe-workplace-retreat-nj-scaled.jpg', '9-1-scaled.jpg', '20-1-scaled.jpg',
    '7-1-scaled.jpg', '32-1-scaled.jpg', '6-1-scaled.jpg', '26-1-scaled.jpg', '10-1-scaled.jpg', '19-1-scaled.jpg',
    '27-1-scaled.jpg',
  ].map((f) => `2026/03/${f}`),
  kdlm: ['1', '2', '3', '8', '9', '11', '13', '14'].map((n) => `2023/04/KDLM-${n}-scaled.jpg`),
  wetransfer: [
    'RI-Workplace-Projects-3-scaled.jpg',
    ...['4', '5', '7', '8', '9', '10', '11', '13', '14'].map((n) => `WeTransfer-Modern-Corporate-Office-Space-${n}.jpg`),
    'WeTransfer-Modern-Corporate-Office-Space-New-York-City.jpg',
  ].map((f) => `2024/05/${f}`),
  jura: ['Main-Image.jpg', '3.jpg', '5.jpg', '7.jpg', '9.jpg', '11.jpg', '12.jpg'].map((f) => `2024/01/${f}`),
  aucta: [
    '1-modern-pharmaceutical-office-reception-area.jpg',
    '3-modern-pharmaceutical-office-workstation-area.jpg',
    '5-modern-pharmaceutical-office-cafe-design.jpg',
    '7-modern-office-design-with-glass-offices.jpg',
    '9-modern-pharmaceutical-office-coffee-bar-and-conference-room.jpg',
    '13-modern-pharmaceutical-office-reception-area-with-conference-room.jpg',
    '16-modern-office-cafe-and-kitchen-area.jpg',
  ].map((f) => `2025/12/${f}`),
  tweezerman: Array.from({ length: 16 }, (_, i) => `2023/09/${i + 1}.jpg`),
  index: [
    '2022/06/Marotta-Controls-1-1.jpg', '2023/10/1.jpg', '2024/09/Modern-residential-office-design-lounge.jpg',
    '2025/09/Main-Image.jpg', '2022/06/4-1.jpg', '2021/07/Austin-Williams-118.jpg', '2021/07/micronix019.jpg',
    '2021/07/20190124_RI_JEP_5209.jpg', '2023/05/4-scaled.jpg', '2021/07/DL1961-2.jpg', '2021/07/Baldor-11.jpg',
    '2021/09/brookaire022.jpg', '2021/07/Gramercy-Cardiac-Diagnostic-Services_-Inc-featured.jpg',
    '2025/09/Soundcoat-acoustics-lab-renovated-workspace-design.jpg',
    '2026/03/american-tire-auto-care-reception-desk-branded-entry-mat-scaled.jpg', '2021/10/RI-Group-11-min.jpg',
  ],
  team: ['Rob-Scott.jpg', 'Keith-Scott.jpg', 'Ben-Scott.jpg'].map((f) => `2021/11/${f}`),
  heritage: [
    'RI-Through-the-Years-RI_s-Office-Exterior-1990_s.jpg', 'RI-Through-the-Years-RI_s-Office-Interior-2000_s.jpg',
    'RI-Through-the-Years-RI_s-Office-Interior-2010_s.jpg', 'RI-Through-the-Years-RI_s-Office-Interior-2020_s.jpg',
    'RI-Through-the-Years-RI_s-Office-Exterior-2020_s.jpg', 'RI-Through-the-Years-RI_s-Office-Interior-2020v2_s.jpg',
  ].map((f) => `2026/05/${f}`),
  brand: ['2026/04/RI.-35-Years-Logo-Blue-landscape-scaled.png', '2021/06/Ri_Logo.svg'],
  clients: [
    '2021/10/Steinway_and_Sons_logo.png', '2021/10/CLARINS_Corporate-logo.png', '2021/06/mitsubishi-logo_17.png',
    '2021/10/avis-logo.png', '2021/10/1800-flowers-logo.png', '2021/10/akzonobel-logo.png',
    '2021/06/perrigo-logo_21.png', '2022/08/Summit_Health-removebg-preview.png', '2022/08/Davita-removebg-preview.png',
    '2021/10/Baldor_logo.png', '2021/10/Grassi-Logo.png', '2021/10/workman-logo.png',
  ],
};

// Pages whose galleries are pulled in full (handoff 7.1 step 3).
// The match keeps the project's own gallery and drops the related-project teasers on the same page.
const GALLERIES = {
  'ri-workplace': { path: '/project/ri-workplace/', match: /ri[-_]group/i },
  ucsb: { path: '/project/union-county-savings-bank-ucsb/', match: /^2023\/10\// },
  gramercy: { path: '/project/gramercy-cardiac-diagnostic-services-inc/', match: /^2021\/07\// },
};

// Pages saved as HTML for the copy audit (testimonials, project index).
const PAGES = ['/', '/projects/', '/leadership-team/', '/about-us/'];

const log = { ok: [], missing: [], pages: [] };

async function get(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow' });
      if (res.status === 404) return { status: 404 };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  return { status: 0, error: String(lastErr) };
}

async function download(rel, slug, name) {
  const dir = join(DOCS, 'originals', slug);
  mkdirSync(dir, { recursive: true });
  const out = join(dir, name || basename(rel));
  if (existsSync(out) && statSync(out).size > 0) { log.ok.push({ slug, rel, cached: true }); return true; }
  const res = await get(UPLOADS + rel);
  if (!res.body) { log.missing.push({ slug, rel, status: res.status, error: res.error }); console.warn(`  MISSING ${res.status} ${slug}/${rel}`); return false; }
  writeFileSync(out, res.body);
  log.ok.push({ slug, rel, bytes: res.body.length });
  return true;
}

async function savePage(path) {
  const dir = join(DOCS, 'pages');
  mkdirSync(dir, { recursive: true });
  const name = (path.replace(/^\/|\/$/g, '').replace(/\//g, '__') || 'home') + '.html';
  const out = join(dir, name);
  if (existsSync(out) && statSync(out).size > 0) return readText(out);
  const res = await get(SITE + path);
  if (!res.body) { console.warn(`  PAGE ${res.status} ${path}`); log.pages.push({ path, status: res.status }); return ''; }
  writeFileSync(out, res.body);
  log.pages.push({ path, status: 200, bytes: res.body.length });
  return res.body.toString('utf8');
}
function readText(p) { return readFileSync(p, 'utf8'); }

// Every upload referenced on a page, reduced to its full-size original, minus stock and logos.
function galleryFrom(html) {
  const found = new Set();
  const re = /wp-content\/uploads\/(\d{4}\/\d{2}\/[^"'\s)?,]+?\.(?:jpe?g|webp|png))/gi;
  let m;
  while ((m = re.exec(html))) {
    let rel = m[1].replace(/-\d+x\d+(?=\.\w+$)/, '');
    if (/istock|logo|favicon|icon|badge|avatar|placeholder/i.test(rel)) continue;
    found.add(rel);
  }
  return [...found];
}

for (const [slug, list] of Object.entries(FILES)) {
  console.log(`${slug}: ${list.length} files`);
  for (const rel of list) await download(rel, slug, slug === 'index' ? rel.replace(/\//g, '_') : undefined);
}

const projectLinks = new Set();
for (const path of PAGES) {
  const html = await savePage(path);
  for (const m of html.matchAll(/href="https:\/\/riworkplace\.com(\/project\/[^"#?]+\/)"/g)) projectLinks.add(m[1]);
}
console.log(`project pages linked from the site: ${projectLinks.size}`);
for (const path of projectLinks) await savePage(path);

for (const [slug, { path, match }] of Object.entries(GALLERIES)) {
  const html = await savePage(path);
  const list = galleryFrom(html).filter((rel) => match.test(rel));
  console.log(`${slug}: ${list.length} gallery candidates from ${path}`);
  for (const rel of list) await download(rel, slug, rel.replace(/\//g, '_'));
}

writeFileSync(join(DOCS, '_fetch-log.json'), JSON.stringify(log, null, 2));
console.log(`done. ok ${log.ok.length}, missing ${log.missing.length}, pages ${log.pages.length}`);
