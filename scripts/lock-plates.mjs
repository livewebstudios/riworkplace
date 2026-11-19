#!/usr/bin/env node
// RI Workplace, MOVE-IN DAY: lock the hero plates to the master frame.
// Each plate was edited separately from the master (stage 5, lanterns), so walls, glass and planter
// can shimmer a little between plates. This keeps the master's pixels wherever a plate barely differs,
// so only the furniture changes from one plate to the next.
// Stage 0 (the raw shell) is never locked: every surface changes on purpose.
//
// Reads  ../../demo4-scroll-plates/stageN_*.png        (untouched originals, outside build/)
// Writes ../../demo4-scroll-plates/locked/stageN_*.png  (locked plates)
//        ../../docs/_plates/masks/stageN.png             (the masks, for inspection)
//        ../../docs/_plates/compare.jpg                  (raw left, locked right, one row per plate)
// Needs sharp (npm i inside scripts/). Run: node scripts/lock-plates.mjs

import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLATES = join(HERE, '..', '..', 'demo4-scroll-plates');
const LOCKED = join(PLATES, 'locked');
const DOCS = join(HERE, '..', '..', 'docs', '_plates');
const MASKS = join(DOCS, 'masks');
mkdirSync(LOCKED, { recursive: true });
mkdirSync(MASKS, { recursive: true });

const MASTER = 'stage5_lanterns';
const LOCK = ['stage1_empty', 'stage2_sofa-rug', 'stage3_chairs', 'stage4_tables-ottoman', 'stage6_scotts'];
const THRESHOLD = 28;

async function raw(file, blur) {
  let img = sharp(join(PLATES, `${file}.png`)).removeAlpha();
  if (blur) img = img.blur(blur);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

// Separable square max/min filter on a 0/1 mask. r is the radius (kernel = 2r + 1).
function morph(src, w, h, r, isMax) {
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  const pick = isMax ? 1 : 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 1 - pick;
      for (let k = Math.max(0, x - r), e = Math.min(w - 1, x + r); k <= e; k++) if (src[row + k] === pick) { v = pick; break; }
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 1 - pick;
      for (let k = Math.max(0, y - r), e = Math.min(h - 1, y + r); k <= e; k++) if (tmp[k * w + x] === pick) { v = pick; break; }
      out[y * w + x] = v;
    }
  }
  return out;
}
const dilate = (m, w, h, r) => morph(m, w, h, r, true);
const erode = (m, w, h, r) => morph(m, w, h, r, false);

// Drop connected islands (4-connected) smaller than minArea pixels.
function dropIslands(m, w, h, minArea) {
  const seen = new Uint8Array(m.length);
  const stack = new Int32Array(m.length);
  let dropped = 0;
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || seen[i]) continue;
    let top = 0, n = 0;
    const members = [];
    stack[top++] = i; seen[i] = 1;
    while (top) {
      const p = stack[--top];
      members.push(p); n++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && m[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < w - 1 && m[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && m[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[top++] = p - w; }
      if (y < h - 1 && m[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[top++] = p + w; }
    }
    if (n < minArea) { for (const p of members) m[p] = 0; dropped++; }
  }
  return dropped;
}

const masterRaw = await raw(MASTER, 0);
const masterBlur = await raw(MASTER, 1.5);
const { w, h } = masterRaw;
const rows = [];

for (const name of LOCK) {
  if (!existsSync(join(PLATES, `${name}.png`))) { console.warn(`missing ${name}.png`); continue; }
  const plate = await raw(name, 0);
  const blur = await raw(name, 1.5);
  if (plate.w !== w || plate.h !== h) throw new Error(`${name} is ${plate.w}x${plate.h}, master is ${w}x${h}`);

  // 1. per-pixel difference on the blurred pair
  let m = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < m.length; i++, p += 3) {
    const d = Math.max(Math.abs(blur.data[p] - masterBlur.data[p]), Math.abs(blur.data[p + 1] - masterBlur.data[p + 1]), Math.abs(blur.data[p + 2] - masterBlur.data[p + 2]));
    m[i] = d > THRESHOLD ? 1 : 0;
  }
  // 2. clean: close 15px, open 5px, drop islands under 2,000px, dilate 12px
  m = erode(dilate(m, w, h, 7), w, h, 7);
  m = dilate(erode(m, w, h, 2), w, h, 2);
  const dropped = dropIslands(m, w, h, 2000);
  m = dilate(m, w, h, 12);
  // 3. feather with a 16px blur, values 0 to 1
  const m8 = Buffer.alloc(w * h);
  for (let i = 0; i < m.length; i++) m8[i] = m[i] * 255;
  const feather = await sharp(m8, { raw: { width: w, height: h, channels: 1 } }).blur(8).extractChannel(0).raw().toBuffer();
  if (feather.length !== w * h) throw new Error(`feathered mask has ${feather.length / (w * h)} channels`);
  await sharp(feather, { raw: { width: w, height: h, channels: 1 } }).toColourspace('b-w').png().toFile(join(MASKS, `${name.split('_')[0]}.png`));

  // 4. out = master * (1 - mask) + plate * mask
  const out = Buffer.alloc(w * h * 3);
  let covered = 0;
  for (let i = 0, p = 0; i < m.length; i++, p += 3) {
    const a = feather[i] / 255;
    if (a > 0.5) covered++;
    out[p] = Math.round(masterRaw.data[p] * (1 - a) + plate.data[p] * a);
    out[p + 1] = Math.round(masterRaw.data[p + 1] * (1 - a) + plate.data[p + 1] * a);
    out[p + 2] = Math.round(masterRaw.data[p + 2] * (1 - a) + plate.data[p + 2] * a);
  }
  await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toFile(join(LOCKED, `${name}.png`));
  const pct = ((covered / m.length) * 100).toFixed(1);
  console.log(`${name.padEnd(24)} mask covers ${pct.padStart(5)}% of the frame, ${dropped} islands dropped`);
  rows.push(name);
}

// 5. contact sheet: raw left, locked right
const CW = 960, CH = Math.round((CW * h) / w), GAP = 8;
const comps = [];
for (let i = 0; i < rows.length; i++) {
  const top = i * (CH + GAP);
  comps.push({ input: await sharp(join(PLATES, `${rows[i]}.png`)).resize(CW, CH).jpeg().toBuffer(), left: 0, top });
  comps.push({ input: await sharp(join(LOCKED, `${rows[i]}.png`)).resize(CW, CH).jpeg().toBuffer(), left: CW + GAP, top });
}
await sharp({ create: { width: CW * 2 + GAP, height: rows.length * (CH + GAP) - GAP, channels: 3, background: '#ffffff' } })
  .composite(comps).jpeg({ quality: 80 }).toFile(join(DOCS, 'compare.jpg'));
console.log('wrote docs/_plates/compare.jpg and docs/_plates/masks/');
