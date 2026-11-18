#!/usr/bin/env node
// RI Workplace home demos: resize the picked originals for the web.
// Reads the picks from content/site.json (images[key].src is relative to ../docs/),
// writes assets/img/<key>-<width>.jpg at 800 and 1600 wide (never upscaled), JPG quality 82,
// metadata stripped, WebP sources converted to JPG. Files already under 100KB are copied as they are.
// PNG sources (logos) are copied untouched. Writes content/images.json for build.mjs.
// An entry may set its own `quality` and `max` width.
// Needs sharp (npm i inside scripts/). Run: node scripts/optimize-images.mjs [key ...]
// With keys, only those images are processed and merged into the existing content/images.json.

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

const ONLY = process.argv.slice(2);
const manifestPath = join(BUILD, 'content', 'images.json');
const manifest = ONLY.length && existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const report = [];
let before = 0, after = 0;

for (const [key, meta] of Object.entries(site.images)) {
  if (!meta.src) continue;
  if (ONLY.length && !ONLY.includes(key)) continue;
  const src = join(DOCS, meta.src);
  if (!existsSync(src)) { console.warn(`  no source yet: ${key} (${meta.src})`); continue; }
  const bytes = statSync(src).size;
  const info = await sharp(src).metadata();
  const ext = extname(src).toLowerCase();
  mkdirSync(dirname(join(OUT, key)), { recursive: true });
  const variants = [];
  const cap = Math.min(meta.max || 1600, info.width);

  if (ext === '.png' || (bytes < SKIP_UNDER && ext !== '.webp' && info.width <= cap)) {
    const file = `${key}-${info.width}${ext === '.jpeg' ? '.jpg' : ext}`;
    copyFileSync(src, join(OUT, file));
    variants.push({ w: info.width, h: info.height, file });
    after += bytes;
    report.push([key, `${info.width}w`, bytes, bytes, 'copied']);
  } else {
    const widths = [...new Set(WIDTHS.map((w) => Math.min(w, cap)))].sort((a, b) => a - b);
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

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log('image'.padEnd(44), 'sizes'.padEnd(12), 'before'.padStart(9), 'after'.padStart(9));
for (const [k, s, b, a, how] of report) console.log(k.padEnd(44), s.padEnd(12), kb(b).padStart(9), kb(a).padStart(9), how);
console.log(`${report.length} images. before ${kb(before)}, after ${kb(after)} across all sizes.`);
