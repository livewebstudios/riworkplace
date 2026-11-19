#!/usr/bin/env node
// RI Workplace home demos: resize the picked originals for the web.
// Reads the picks from content/site.json (images[key].src is relative to ../docs/),
// writes assets/img/<key>-<width>.jpg at 800 and 1600 wide (never upscaled), JPG quality 82,
// metadata stripped, WebP sources converted to JPG. Files already under 100KB are copied as they are.
// PNG sources (logos) are copied untouched. Writes content/images.json for build.mjs.
// An entry may set its own `quality` and `max` width.
// An entry may also set `widths` (e.g. [960, 1600, 2400]) to replace the default 800 + 1600.
// Needs sharp (npm i inside scripts/). Run: node scripts/optimize-images.mjs [key ...]
// With keys, only those images are processed and merged into the existing content/images.json.
//
// MOVE-IN DAY hero plates (round 3): node scripts/optimize-images.mjs --plates
// Reads the seven plates from ../demo4-scroll-plates/ (outside build/, never committed), picks the raw or
// pixel-locked version per stage (PLATES below), writes assets/img/move-in/plate-N-<w>.{avif,webp,jpg}
// at 960, 1600 and 2400 wide, metadata stripped, no size-skip rule. Registers move-in/plate-0 to plate-6
// in content/images.json with `avif` and `webp` lists beside the JPG variants.
//
// CROSS SECTION drawings (round 4): node scripts/optimize-images.mjs --drawn
// Reads the registered drawings from ../docs/assets/drawn/aligned/<slot>.png (register-drawings.mjs),
// writes assets/img/drawn/<slot>-<w>.jpg at exactly the pixel sizes of its photo's variants, JPG quality 82
// (76 when the largest file would pass 350KB), metadata stripped. Registers drawn/<slot> in images.json
// with "alt": "" (drawings are decorative). Only slots marked `ship` in DRAWN below are written.

import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(BUILD, '..', 'docs');
const OUT = join(BUILD, 'assets', 'img');
const site = JSON.parse(readFileSync(join(BUILD, 'content', 'site.json'), 'utf8'));
const WIDTHS = [800, 1600];
const QUALITY = 82;
const SKIP_UNDER = 100 * 1024;

const PLATES_MODE = process.argv.includes('--plates');
const DRAWN_MODE = process.argv.includes('--drawn');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const manifestPath = join(BUILD, 'content', 'images.json');
const manifest = (ONLY.length || PLATES_MODE || DRAWN_MODE) && existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const report = [];
let before = 0, after = 0;

for (const [key, meta] of Object.entries(PLATES_MODE || DRAWN_MODE ? {} : site.images)) {
  if (!meta.src) continue;
  if (ONLY.length && !ONLY.includes(key)) continue;
  const src = join(DOCS, meta.src);
  if (!existsSync(src)) { console.warn(`  no source yet: ${key} (${meta.src})`); continue; }
  const bytes = statSync(src).size;
  const info = await sharp(src).metadata();
  const ext = extname(src).toLowerCase();
  mkdirSync(dirname(join(OUT, key)), { recursive: true });
  const variants = [];
  const cap = Math.min(meta.max || Math.max(...(meta.widths || WIDTHS)), info.width);

  if (ext === '.png' || (bytes < SKIP_UNDER && ext !== '.webp' && info.width <= cap)) {
    const file = `${key}-${info.width}${ext === '.jpeg' ? '.jpg' : ext}`;
    copyFileSync(src, join(OUT, file));
    variants.push({ w: info.width, h: info.height, file });
    after += bytes;
    report.push([key, `${info.width}w`, bytes, bytes, 'copied']);
  } else {
    const widths = [...new Set((meta.widths || WIDTHS).map((w) => Math.min(w, cap)))].sort((a, b) => a - b);
    let total = 0;
    for (const w of widths) {
      const file = `${key}-${w}.jpg`;
      const res = await sharp(src).rotate().resize({ width: w, withoutEnlargement: true })
        .jpeg({ quality: meta.quality || QUALITY, mozjpeg: true, progressive: true }).toFile(join(OUT, file));
      variants.push({ w: res.width, h: res.height, file });
      total += res.size;
    }
    after += total;
    report.push([key, widths.map((w) => `${w}w`).join('+'), bytes, total, 'resized']);
  }
  before += bytes;
  manifest[key] = { variants };
}

/* ---------- MOVE-IN DAY hero plates ---------- */
// use: 'raw' or 'locked'. Every locked plate showed lantern-glow blotches and seams on the floor
// (the master's glow leaks in under the 28 threshold), so all seven ship raw. See OPEN_QUESTIONS round 3.
const PLATES = [
  { n: 0, file: 'stage0_shell', use: 'raw' },
  { n: 1, file: 'stage1_empty', use: 'raw' },
  { n: 2, file: 'stage2_sofa-rug', use: 'raw' },
  { n: 3, file: 'stage3_chairs', use: 'raw' },
  { n: 4, file: 'stage4_tables-ottoman', use: 'raw' },
  { n: 5, file: 'stage5_lanterns', use: 'raw' },
  { n: 6, file: 'stage6_scotts', use: 'raw' },
];
const PLATE_WIDTHS = [960, 1600, 2400];
if (PLATES_MODE) {
  const dir = join(BUILD, '..', 'demo4-scroll-plates');
  mkdirSync(join(OUT, 'move-in'), { recursive: true });
  let avif1600 = 0;
  for (const p of PLATES) {
    const src = join(dir, p.use === 'locked' ? 'locked' : '', `${p.file}.png`);
    if (!existsSync(src)) { console.warn(`  missing plate ${p.n}: ${src}`); continue; }
    const key = `move-in/plate-${p.n}`;
    const entry = { variants: [], webp: [], avif: [], source: p.use };
    const row = [];
    for (const w of PLATE_WIDTHS) {
      const base = sharp(src).resize({ width: w, withoutEnlargement: true });
      const jpg = await base.clone().jpeg({ quality: 82, mozjpeg: true, progressive: true }).toFile(join(OUT, `${key}-${w}.jpg`));
      const webp = await base.clone().webp({ quality: 78 }).toFile(join(OUT, `${key}-${w}.webp`));
      const avif = await base.clone().avif({ quality: 55, effort: 6 }).toFile(join(OUT, `${key}-${w}.avif`));
      entry.variants.push({ w: jpg.width, h: jpg.height, file: `${key}-${w}.jpg` });
      entry.webp.push({ w: webp.width, h: webp.height, file: `${key}-${w}.webp` });
      entry.avif.push({ w: avif.width, h: avif.height, file: `${key}-${w}.avif` });
      if (w === 1600) avif1600 += avif.size;
      row.push(`${w}: avif ${(avif.size / 1024).toFixed(0)}K webp ${(webp.size / 1024).toFixed(0)}K jpg ${(jpg.size / 1024).toFixed(0)}K`);
    }
    manifest[key] = entry;
    console.log(`plate-${p.n} (${p.use})  ${row.join('  |  ')}`);
  }
  console.log(`1600 AVIF set, all seven: ${(avif1600 / 1024 / 1024).toFixed(2)} MB (target under 1.9 MB)`);
}

/* ---------- CROSS SECTION drawings ---------- */
// slot -> the photo key it was traced from. ship: false falls back to photo only (see OPEN_QUESTIONS round 4).
const DRAWN = [
  { slot: 'ls-power-reception', photo: 'projects/ls-power/reception', ship: true },
  { slot: 'kdlm-entry', photo: 'projects/kdlm/entry', ship: true },
  { slot: 'wetransfer-lounge', photo: 'projects/wetransfer/lounge', ship: true },
  { slot: 'jura-lounge', photo: 'projects/jura/lounge', ship: true },
  { slot: 'ls-power-reception-wide', photo: 'projects/ls-power/reception-wide', ship: true },
  { slot: 'kdlm-boardroom', photo: 'projects/kdlm/boardroom', ship: true },
  { slot: 'aucta-reception', photo: 'projects/aucta/reception', ship: true },
  { slot: 'tweezerman-reception', photo: 'projects/tweezerman/reception', ship: true },
  { slot: 'ri-workplace-meeting', photo: 'projects/ri-workplace/meeting', ship: true },
];
if (DRAWN_MODE) {
  const dir = join(DOCS, 'assets', 'drawn', 'aligned');
  mkdirSync(join(OUT, 'drawn'), { recursive: true });
  for (const d of DRAWN) {
    const key = `drawn/${d.slot}`;
    const src = join(dir, `${d.slot}.png`);
    const photo = manifest[d.photo];
    if (!d.ship || !existsSync(src) || !photo) { delete manifest[key]; console.log(`${key}: not shipped`); continue; }
    const write = async (q) => {
      const out = [];
      for (const v of photo.variants) {
        const file = `drawn/${d.slot}-${v.w}.jpg`;
        const res = await sharp(src).resize(v.w, v.h, { fit: 'fill', kernel: 'lanczos3' })
          .jpeg({ quality: q, mozjpeg: true, progressive: true }).toFile(join(OUT, file));
        if (res.width !== v.w || res.height !== v.h) throw new Error(`${file} is ${res.width}x${res.height}, photo is ${v.w}x${v.h}`);
        out.push({ w: v.w, h: v.h, file, bytes: res.size });
      }
      return out;
    };
    let q = 82;
    let vars = await write(q);
    const big = vars.at(-1).bytes;
    if (big > 350 * 1024) { q = 76; vars = await write(q); console.log(`  ${key}: ${(big / 1024).toFixed(0)}K at 82 -> ${(vars.at(-1).bytes / 1024).toFixed(0)}K at 76`); }
    manifest[key] = { alt: '', quality: q, variants: vars.map(({ w, h, file }) => ({ w, h, file })) };
    console.log(`${key.padEnd(32)} q${q}  ${vars.map((v) => `${v.w}x${v.h} ${(v.bytes / 1024).toFixed(0)}K`).join('  ')}`);
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log('image'.padEnd(44), 'sizes'.padEnd(12), 'before'.padStart(9), 'after'.padStart(9));
for (const [k, s, b, a, how] of report) console.log(k.padEnd(44), s.padEnd(12), kb(b).padStart(9), kb(a).padStart(9), how);
console.log(`${report.length} images. before ${kb(before)}, after ${kb(after)} across all sizes.`);
