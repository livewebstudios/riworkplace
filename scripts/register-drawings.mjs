#!/usr/bin/env node
// RI Workplace, CROSS SECTION round 4: register each Higgsfield drawing to the photo it was traced from.
// Reads ../docs/assets/drawn/originals/<slot>.png and the served photo in assets/img/projects/.
// 1. Edge maps of both at 400px wide: greyscale, 3x3 Sobel in x and y (sharp convolve), magnitude,
//    thresholded to the top 12% of edge strength.
// 2. The drawing is first fitted to the photo by "cover" (uniform scale, centered, never stretched),
//    then searched: scale 0.94 to 1.06 and offset up to 4% of each axis. Coarse grid
//    (scale 0.01, offset 1%), then a refine around the best (scale 0.005, offset 0.25%).
//    Match = Dice overlap of photo edges against the drawing's edges (drawing edges dilated 1px).
// 3. The best transform is applied at full size, cropped or padded with paper white to the photo's size.
// 4. Score = share of the photo's strong edges with a drawing edge within 1.5% of the image width.
//    Pass at 0.55 or higher.
// Writes ../docs/assets/drawn/aligned/<slot>.png, ../docs/_contact-sheets/drawn/<slot>.jpg
// (photo | aligned drawing | drawing multiplied over the photo) and ../docs/assets/drawn/_registration.csv.
// Run: node scripts/register-drawings.mjs [slot ...]

import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(BUILD, '..', 'docs');
const ORIG = join(DOCS, 'assets', 'drawn', 'originals');
const ALIGNED = join(DOCS, 'assets', 'drawn', 'aligned');
const SHEETS = join(DOCS, '_contact-sheets', 'drawn');
const CSV = join(DOCS, 'assets', 'drawn', '_registration.csv');

// slot -> the served photo it was traced from (the largest variant)
export const SLOTS = {
  'ls-power-reception': 'projects/ls-power/reception-1600.jpg',
  'kdlm-entry': 'projects/kdlm/entry-1373.jpg',
  'wetransfer-lounge': 'projects/wetransfer/lounge-1600.jpg',
  'jura-lounge': 'projects/jura/lounge-1500.jpg',
  'ls-power-reception-wide': 'projects/ls-power/reception-wide-1600.jpg',
  'kdlm-boardroom': 'projects/kdlm/boardroom-1600.jpg',
  'aucta-reception': 'projects/aucta/reception-1500.jpg',
  'tweezerman-reception': 'projects/tweezerman/reception-1280.jpg',
  'ri-workplace-meeting': 'projects/ri-workplace/meeting-1600.jpg',
};

const W = 400;            // working width for the edge maps
const TOP = 0.12;         // keep the strongest 12% of edges
const PASS = 0.55;
const TOL = 0.015;        // 1.5% of the image width

/* ---------- edge map: Sobel magnitude, top 12% -> binary ---------- */
async function edges(input, w, h) {
  const grey = await sharp(input).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer();
  const raw = { raw: { width: w, height: h, channels: 1 } };
  const k = (kernel) => sharp(grey, raw).convolve({ width: 3, height: 3, kernel, scale: 8, offset: 128 }).extractChannel(0).raw().toBuffer();
  const gx = await k([-1, 0, 1, -2, 0, 2, -1, 0, 1]);
  const gy = await k([-1, -2, -1, 0, 0, 0, 1, 2, 1]);
  const mag = new Float32Array(w * h);
  for (let i = 0; i < mag.length; i++) {
    const x = gx[i] - 128, y = gy[i] - 128;
    mag[i] = Math.sqrt(x * x + y * y);
  }
  // zero a 1px border (the convolution edge) so frame lines never count
  for (let x = 0; x < w; x++) { mag[x] = 0; mag[(h - 1) * w + x] = 0; }
  for (let y = 0; y < h; y++) { mag[y * w] = 0; mag[y * w + w - 1] = 0; }
  const sorted = Float32Array.from(mag).sort();
  const thr = Math.max(1, sorted[Math.floor(sorted.length * (1 - TOP))]);
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < bin.length; i++) bin[i] = mag[i] >= thr ? 1 : 0;
  return bin;
}

function dilate(bin, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!bin[y * w + x]) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < h && xx >= 0 && xx < w && dx * dx + dy * dy <= r * r) out[yy * w + xx] = 1;
    }
  }
  return out;
}

function integral(bin, w, h) {
  const s = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += bin[y * w + x]; s[(y + 1) * (w + 1) + x + 1] = s[y * (w + 1) + x + 1] + row; }
  }
  return s;
}
const boxSum = (s, w, x0, y0, x1, y1) => s[y1 * (w + 1) + x1] - s[y0 * (w + 1) + x1] - s[y1 * (w + 1) + x0] + s[y0 * (w + 1) + x0];

/* ---------- one slot ---------- */
async function register(slot) {
  const photoPath = join(BUILD, 'assets', 'img', SLOTS[slot]);
  const drawPath = join(ORIG, `${slot}.png`);
  if (!existsSync(drawPath)) return { slot, verdict: 'missing' };
  const pm = await sharp(photoPath).metadata();
  const dm = await sharp(drawPath).metadata();
  const PW = pm.width, PH = pm.height, DW = dm.width, DH = dm.height;
  const aspectDiff = Math.abs(DW / DH - PW / PH) / (PW / PH);
  const cover = Math.max(PW / DW, PH / DH); // drawing px -> photo px at m = 1

  const H = Math.round(W * PH / PW);
  const k = W / PW; // photo px -> working px
  const P = await edges(photoPath, W, H);
  const pList = [];
  for (let i = 0; i < P.length; i++) if (P[i]) pList.push(i % W, (i / W) | 0);
  const nP = pList.length / 2;

  const cache = new Map();
  async function drawingAt(m) {
    const key = m.toFixed(4);
    if (cache.has(key)) return cache.get(key);
    const dw = Math.round(DW * cover * m * k), dh = Math.round(DH * cover * m * k);
    const E = await edges(drawPath, dw, dh);
    const v = { dw, dh, E, D: dilate(E, dw, dh, 1), S: integral(E, dw, dh) };
    cache.set(key, v);
    return v;
  }
  // place: drawing center at photo center + (ox, oy) working px
  function dice(d, ox, oy) {
    const left = Math.round((W - d.dw) / 2 + ox), top = Math.round((H - d.dh) / 2 + oy);
    let hit = 0;
    for (let i = 0; i < pList.length; i += 2) {
      const x = pList[i] - left, y = pList[i + 1] - top;
      if (x >= 0 && y >= 0 && x < d.dw && y < d.dh && d.D[y * d.dw + x]) hit++;
    }
    const x0 = Math.max(0, -left), y0 = Math.max(0, -top), x1 = Math.min(d.dw, W - left), y1 = Math.min(d.dh, H - top);
    const nD = x1 > x0 && y1 > y0 ? boxSum(d.S, d.dw, x0, y0, x1, y1) : 0;
    return (2 * hit) / (nP + nD);
  }
  async function search(scales, offsX, offsY) {
    let best = { v: -1 };
    for (const m of scales) {
      const d = await drawingAt(m);
      for (const fx of offsX) for (const fy of offsY) {
        const v = dice(d, fx * W, fy * H);
        if (v > best.v) best = { v, m, fx, fy };
      }
    }
    return best;
  }
  const range = (a, b, step) => { const out = []; for (let x = a; x <= b + 1e-9; x += step) out.push(Math.round(x * 10000) / 10000); return out; };
  const coarse = await search(range(0.94, 1.06, 0.01), range(-0.04, 0.04, 0.01), range(-0.04, 0.04, 0.01));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fine = await search(
    range(clamp(coarse.m - 0.01, 0.94, 1.06), clamp(coarse.m + 0.01, 0.94, 1.06), 0.005),
    range(clamp(coarse.fx - 0.01, -0.04, 0.04), clamp(coarse.fx + 0.01, -0.04, 0.04), 0.0025),
    range(clamp(coarse.fy - 0.01, -0.04, 0.04), clamp(coarse.fy + 0.01, -0.04, 0.04), 0.0025),
  );
  const identity = dice(await drawingAt(1), 0, 0);

  /* ---------- score: photo edges with a drawing edge within 1.5% of the width ---------- */
  const best = await drawingAt(fine.m);
  const r = Math.round(TOL * W);
  const left = Math.round((W - best.dw) / 2 + fine.fx * W), top = Math.round((H - best.dh) / 2 + fine.fy * H);
  const placed = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xx = x - left, yy = y - top;
    if (xx >= 0 && yy >= 0 && xx < best.dw && yy < best.dh) placed[y * W + x] = best.E[yy * best.dw + xx];
  }
  const near = dilate(placed, W, H, r);
  let within = 0;
  for (let i = 0; i < pList.length; i += 2) if (near[pList[i + 1] * W + pList[i]]) within++;
  const score = within / nP;
  // the same score for an unrelated control: the photo's edges against its own mirror image
  // (tells us how much of the score dense hatching gets for free)
  const mirror = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mirror[y * W + x] = placed[y * W + (W - 1 - x)];
  const nearM = dilate(mirror, W, H, r);
  let withinM = 0;
  for (let i = 0; i < pList.length; i += 2) if (nearM[pList[i + 1] * W + pList[i]]) withinM++;
  const control = withinM / nP;

  /* ---------- apply at full size ---------- */
  const S = cover * fine.m;
  const sw = Math.round(DW * S), sh = Math.round(DH * S);
  const L = Math.round((PW - sw) / 2 + fine.fx * PW), T = Math.round((PH - sh) / 2 + fine.fy * PH);
  const scaled = await sharp(drawPath).resize(sw, sh, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().toBuffer();
  // crop the part that falls inside the photo frame, pad the rest with white
  const cx = Math.max(0, -L), cy = Math.max(0, -T);
  const cw = Math.min(sw - cx, PW - Math.max(0, L)), ch = Math.min(sh - cy, PH - Math.max(0, T));
  const piece = await sharp(scaled).extract({ left: cx, top: cy, width: cw, height: ch }).toBuffer();
  mkdirSync(ALIGNED, { recursive: true });
  const alignedPath = join(ALIGNED, `${slot}.png`);
  await sharp({ create: { width: PW, height: PH, channels: 3, background: '#FFFFFF' } })
    .composite([{ input: piece, left: Math.max(0, L), top: Math.max(0, T) }]).png().toFile(alignedPath);
  const padded = { l: Math.max(0, L), t: Math.max(0, T), r: Math.max(0, PW - (L + sw)), b: Math.max(0, PH - (T + sh)) };

  /* ---------- contact sheet: photo | aligned | multiply ---------- */
  mkdirSync(SHEETS, { recursive: true });
  const CH = 700, cwid = Math.round(CH * PW / PH);
  const ph = await sharp(photoPath).resize(cwid, CH).toBuffer();
  const al = await sharp(alignedPath).resize(cwid, CH).toBuffer();
  const mult = await sharp(ph).composite([{ input: al, blend: 'multiply' }]).toBuffer();
  await sharp({ create: { width: cwid * 3 + 20, height: CH, channels: 3, background: '#777777' } })
    .composite([{ input: ph, left: 0, top: 0 }, { input: al, left: cwid + 10, top: 0 }, { input: mult, left: 2 * cwid + 20, top: 0 }])
    .jpeg({ quality: 82 }).toFile(join(SHEETS, `${slot}.jpg`));

  return {
    slot, photo: `${PW}x${PH}`, drawing: `${DW}x${DH}`, aspectDiff, scale: fine.m, offX: fine.fx, offY: fine.fy,
    total: S, dice: fine.v, diceIdentity: identity, score, control, padded,
    verdict: score >= PASS ? 'pass' : 'review',
  };
}

const only = process.argv.slice(2);
const results = [];
for (const slot of Object.keys(SLOTS)) {
  if (only.length && !only.includes(slot)) continue;
  const r = await register(slot);
  results.push(r);
  if (r.verdict === 'missing') { console.log(`${slot}: no drawing`); continue; }
  console.log(`${slot.padEnd(26)} m ${r.scale.toFixed(3)} dx ${(r.offX * 100).toFixed(2)}% dy ${(r.offY * 100).toFixed(2)}%  dice ${r.dice.toFixed(3)} (untouched ${r.diceIdentity.toFixed(3)})  score ${r.score.toFixed(3)} (mirror control ${r.control.toFixed(3)})  aspect diff ${(r.aspectDiff * 100).toFixed(2)}%  pad ${JSON.stringify(r.padded)}  ${r.verdict}`);
}

// merge into the CSV (keeps rows for slots not run this time)
const rows = new Map();
if (only.length && existsSync(CSV)) {
  for (const line of readFileSync(CSV, 'utf8').trim().split('\n').slice(1)) rows.set(line.split(',')[0], line);
}
for (const r of results) {
  if (r.verdict === 'missing') { rows.set(r.slot, `${r.slot},,,,,,,,missing`); continue; }
  rows.set(r.slot, [r.slot, r.photo, r.drawing, r.scale.toFixed(3), (r.offX * 100).toFixed(2) + '%', (r.offY * 100).toFixed(2) + '%',
    r.total.toFixed(5), r.dice.toFixed(3), r.score.toFixed(3), r.control.toFixed(3), r.verdict].join(','));
}
mkdirSync(dirname(CSV), { recursive: true });
writeFileSync(CSV, 'slot,photo,drawing,scale,offset_x,offset_y,total_scale_drawing_to_photo,dice,score,mirror_control,verdict\n'
  + [...rows.values()].join('\n') + '\n');
console.log(`wrote ${CSV}`);
