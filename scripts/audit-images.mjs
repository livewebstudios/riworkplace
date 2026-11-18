#!/usr/bin/env node
// RI Workplace home demos: measure every downloaded original and build contact sheets.
// Writes ../docs/assets/_audit.csv (file, width, height, bytes, verdict) and one JPG
// per folder in ../docs/_contact-sheets/. Manual verdicts live in ../docs/assets/_verdicts.json
// and override the size-based default. Needs sharp (npm i inside scripts/).

import sharp from 'sharp';
import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs');
const ORIG = join(DOCS, 'assets', 'originals');
const SHEETS = join(DOCS, '_contact-sheets');
const verdictFile = join(DOCS, 'assets', '_verdicts.json');
const verdicts = existsSync(verdictFile) ? JSON.parse(readFileSync(verdictFile, 'utf8')) : {};
mkdirSync(SHEETS, { recursive: true });

const CELL_W = 480, CELL_H = 320, LABEL = 30, COLS = 4, GAP = 8;
const rows = [['file', 'width', 'height', 'bytes', 'verdict']];
const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

for (const slug of readdirSync(ORIG).filter((d) => statSync(join(ORIG, d)).isDirectory()).sort()) {
  const files = readdirSync(join(ORIG, slug)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const cells = [];
  for (const [i, f] of files.entries()) {
    const p = join(ORIG, slug, f);
    const meta = await sharp(p).metadata();
    const size = meta.width >= 1600 ? 'ok: 1600 or wider' : meta.width >= 1000 ? 'small: split layouts only, never wider than 60% of 1440' : 'thumb: small slots only';
    rows.push([`${slug}/${f}`, meta.width, meta.height, statSync(p).size, verdicts[`${slug}/${f}`] || size]);
    const thumb = await sharp(p).flatten({ background: '#ffffff' }).resize(CELL_W, CELL_H, { fit: 'contain', background: '#e9e9e6' }).jpeg({ quality: 74 }).toBuffer();
    const x = GAP + (i % COLS) * (CELL_W + GAP);
    const y = GAP + Math.floor(i / COLS) * (CELL_H + LABEL + GAP);
    cells.push({ input: thumb, left: x, top: y });
    const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${LABEL}"><rect width="100%" height="100%" fill="#101216"/><text x="8" y="20" font-family="Menlo, monospace" font-size="13" fill="#fff">${i + 1}. ${xml(f.length > 44 ? f.slice(0, 20) + '…' + f.slice(-22) : f)}  ${meta.width}x${meta.height}</text></svg>`;
    cells.push({ input: Buffer.from(label), left: x, top: y + CELL_H });
  }
  if (!cells.length) continue;
  const rowsN = Math.ceil(files.length / COLS);
  await sharp({ create: { width: GAP + COLS * (CELL_W + GAP), height: GAP + rowsN * (CELL_H + LABEL + GAP), channels: 3, background: '#ffffff' } })
    .composite(cells).jpeg({ quality: 80 }).toFile(join(SHEETS, `${slug}.jpg`));
  console.log(`${slug}: ${files.length} images`);
}
writeFileSync(join(DOCS, 'assets', '_audit.csv'), rows.map((r) => r.map((c) => (/[",]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n');
console.log(`audit: ${rows.length - 1} files`);
