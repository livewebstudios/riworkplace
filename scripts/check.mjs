#!/usr/bin/env node
// RI Workplace home demos: static checks on the chooser and every built demo page.
// Zero dependencies. Run: node scripts/check.mjs   (exit code 1 if anything fails)
// Covers the copy kill list, the LWS page rules, demo scaffolding, and the
// "same words in all three demos" comparison from the handoff acceptance list.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const site = JSON.parse(read('content/site.json'));
// A demo listed in site.json whose page is not built yet (its template does not exist) is skipped and reported.
const ALL_DEMOS = site.demos.map((d) => `${d.slug}/index.html`);
const DEMOS = ALL_DEMOS.filter((p) => existsSync(join(ROOT, p)));
const PAGES = ['index.html', ...DEMOS];

const EM_DASH = String.fromCharCode(8212);
let failed = 0;
const out = [];
const pass = (name, detail = '') => out.push(`PASS  ${name}${detail ? '  ' + detail : ''}`);
const fail = (name, detail) => { failed++; out.push(`FAIL  ${name}\n      ${[].concat(detail).join('\n      ')}`); };
const check = (name, problems, detail) => (problems.length ? fail(name, problems) : pass(name, detail));
for (const p of ALL_DEMOS.filter((x) => !DEMOS.includes(x))) out.push(`SKIP  ${p} is not built yet`);

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
// Visible text of the <main> of a page, one string per text run.
function visible(html, scope = /<main[\s\S]*<\/main>/) {
  const body = (html.match(scope) || [''])[0]
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+aria-hidden="true"[^>]*>[^<]*<\/[a-z]+>/g, ' ');
  return body.split(/<[^>]+>/).map((t) => decode(t).replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/* ---------- 1. copy kill list, every page, markup included ---------- */
const BANNED = ['learn more', 'click here', 'submit', 'circle back', "don't hesitate to reach out", 'schedule a free consultation',
  'seamless', 'solutions', 'comprehensive', 'cutting-edge', 'leverage', 'utilize', 'robust', 'streamlined', 'world-class', 'london'];
// RI's own service name and the client's own company name stay exactly as they are (handoff 2.6 and 5.4).
const EXEMPT = [/Return-to-Work Solutions/g, /return-to-work-solutions/g];
for (const page of PAGES) {
  const raw = read(page);
  const problems = [];
  if (raw.includes(EM_DASH)) problems.push('em dash found');
  let text = raw;
  for (const re of EXEMPT) text = text.replace(re, '');
  const lower = text.toLowerCase();
  for (const word of BANNED) if (lower.includes(word)) problems.push(`"${word}" at ...${lower.substr(Math.max(0, lower.indexOf(word) - 40), 90).replace(/\s+/g, ' ')}...`);
  if (lower.replace(/tweezerman[- ]international/g, '').includes('international')) problems.push('"international" used outside the client name Tweezerman International');
  check(`kill list: ${page}`, problems);
}
// Source files too: no em dash in CSS, JS, templates, content or scripts (vendor code excluded).
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((f) => {
  const p = `${dir}/${f}`;
  if (/node_modules|vendor|\.git/.test(p)) return [];
  return statSync(join(ROOT, p)).isDirectory() ? walk(p) : ['.css', '.js', '.mjs', '.html', '.json', '.toml', '.txt'].includes(extname(p)) ? [p] : [];
});
check('no em dash in any source file', ['assets', 'templates', 'content', 'scripts'].flatMap(walk).filter((p) => read(p).includes(EM_DASH)));

/* ---------- 2. LWS page rules ---------- */
for (const page of PAGES) {
  const html = read(page);
  const problems = [];
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) problems.push(`${h1} h1 elements`);
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => +m[1]);
  levels.forEach((l, i) => { if (i && l - levels[i - 1] > 1) problems.push(`heading jumps h${levels[i - 1]} to h${l}`); });
  if (/\sstyle="/.test(html)) problems.push('inline style attribute');
  const rootRel = html.match(/(?:href|src|srcset|action|imagesrcset)="\/[^/"][^"]*"/g);
  if (rootRel) problems.push(`root-relative path: ${rootRel.slice(0, 3).join(' ')}`);
  if (/(?:href|src)="https?:\/\/[^"]*riworkplace[^"]*\.(?:css|js|png|jpe?g|svg|woff2)"/.test(html)) problems.push('absolute URL for an internal asset');
  for (const need of ['<meta name="viewport"', '<meta name="description"', '<meta name="robots" content="noindex, nofollow">', 'property="og:title"',
    'property="og:description"', 'property="og:image"', 'application/ld+json', '"ProfessionalService"', '"foundingDate": "1991"',
    '<!-- GA4: G-XXXXXXXXXX goes here at launch -->', 'verifiedsecured.png" width="150" height="37"', 'Built by Live Web Studios', '<main', '<footer', '<header']) {
    if (!html.includes(need)) problems.push(`missing ${need}`);
  }
  if (/googletagmanager|gtag\(/.test(html)) problems.push('live analytics tag');
  for (const img of html.match(/<img\b[^>]*>/g) || []) {
    if (!/\salt="/.test(img)) problems.push(`img without alt: ${img.slice(0, 80)}`);
    if (!/\swidth="\d+"/.test(img) || !/\sheight="\d+"/.test(img)) problems.push(`img without width/height: ${img.slice(0, 80)}`);
    // fetchpriority low or auto = a deliberate first-screen load (round 4: CROSS SECTION hero photos and drawings 2 to 4)
    if (!/loading="lazy"|fetchpriority="(?:high|low|auto)"/.test(img) && !/ri-35-years-logo/.test(img)) problems.push(`img neither lazy nor priority: ${img.slice(0, 80)}`);
  }
  const logos = html.match(/<img\b[^>]*ri-35-years-logo[^>]*>/g) || [];
  if (!logos.length || logos.some((l) => !l.includes('alt="RI Workplace, 35 years"'))) problems.push('logo img missing or wrong alt');
  check(`page rules: ${page}`, problems);
}

/* ---------- 3. demo pages: nav, form, scaffolding ---------- */
for (const page of DEMOS) {
  const html = read(page);
  const problems = [];
  const labels = site.nav.flatMap((n) => [n.label, ...(n.children || []).map((c) => c.label)]);
  for (const l of labels) if (!html.includes(`>${l.replace(/&/g, '&amp;')}</a>`)) problems.push(`nav label missing: ${l}`);
  if (!html.includes('action="https://formspree.io/f/REPLACE_ME"')) problems.push('form action is not the Formspree placeholder');
  if (!html.includes('name="_gotcha"')) problems.push('honeypot missing');
  if (!/id="contact"/.test(html) || !/id="work"/.test(html)) problems.push('#work or #contact anchor missing');
  // demos are look-only: no link may leave the page (except the LWS credit)
  for (const a of html.match(/<a\b[^>]*>/g) || []) {
    const href = (a.match(/\shref="([^"]*)"/) || [])[1];
    if (href !== undefined && !href.startsWith('#') && !href.includes('livewebstudios.com')) problems.push(`link leaves the demo: ${a.slice(0, 110)}`);
  }
  if (/tawk\.to/i.test(html)) problems.push('tawk.to chat widget present');
  if (/istock/i.test(html)) problems.push('stock image reference');
  check(`demo rules: ${page}`, problems);
}

/* ---------- 4. the same words in all three demos ---------- */
// Every string of the shared copy deck must be visible on every demo.
const deck = [
  site.hero.eyebrow, site.hero.sub, site.hero.primary, site.hero.secondary, site.hero.film,
  ...site.numbers.flatMap((n) => [n.figure, n.label]),
  site.work.line, site.work.all.label,
  ...site.work.projects.flatMap((p) => [p.name, p.place, p.sector, p.line]),
  ...site.work.index.flatMap((p) => [p.name, p.place, p.sector].filter(Boolean)),
  site.steps.line, site.steps.all.label, ...site.steps.items.flatMap((s) => [s.name, s.copy, ...s.services]),
  ...site.industries.items.map((i) => i.label),
  ...site.quotes.items.flatMap((q) => [q.text, q.by]),
  ...site.family.body, site.family.link.label, ...site.family.people.flatMap((p) => [p.name, p.title]), ...site.family.timeline.flatMap((t) => [t.year, t.entry]),
  site.showroom.body, site.showroom.button, site.clients.heading,
  site.contact.line, site.contact.button, site.contact.fields.consent.label, ...site.contact.fields.source.options,
  ...['first', 'last', 'email', 'tel', 'company', 'source', 'message'].map((k) => site.contact.fields[k].label),
  site.org.telephone, site.org.email,
];
const headings = [site.hero.h1, site.work.h2, site.steps.h2, site.industries.h2, site.quotes.h2, site.family.h2, site.showroom.h2, site.contact.h2];
const norm = (s) => s.replace(/\s+/g, ' ').replace(/ ?· ?/g, ' ').trim().toLowerCase();
const texts = {};
for (const page of DEMOS) {
  const html = read(page);
  const flat = norm(visible(html).join(' '));
  texts[page] = visible(html);
  const problems = [...deck, ...headings].filter((s) => !flat.includes(norm(s))).map((s) => `deck text not found: ${s.slice(0, 70)}`);
  if (!norm(visible(html).join(' ')).includes(norm(site.org.address.street))) problems.push('address not found');
  check(`copy deck complete: ${page}`, problems, `${deck.length + headings.length} strings`);
}
// What each demo shows beyond the others (demo-specific furniture, listed for the record).
const sets = Object.fromEntries(DEMOS.map((p) => [p, new Set(texts[p].map(norm).flatMap((t) => t.split(' ')))]));
for (const page of DEMOS.length > 1 ? DEMOS : []) {
  const others = DEMOS.filter((p) => p !== page);
  const extra = [...sets[page]].filter((w) => /[a-z]{3,}/.test(w) && others.every((o) => !sets[o].has(w)));
  out.push(`INFO  words only on ${page}: ${extra.length ? extra.join(', ') : 'none'}`);
}
// Testimonials character for character.
for (const page of DEMOS) check(`testimonials verbatim: ${page}`, site.quotes.items.filter((q) => !decode(read(page)).includes(`<p>${q.text}</p>`)).map((q) => q.by));
// Family below the work and above the contact form.
for (const page of DEMOS) {
  const html = read(page);
  const pos = [html.indexOf('id="work"'), html.indexOf(site.family.people[0].name + '</h3>'), html.indexOf('id="contact"')];
  check(`the Scotts sit between work and contact: ${page}`, pos[0] < pos[1] && pos[1] < pos[2] ? [] : [`order ${pos.join(' / ')}`]);
}

/* ---------- 5. BLUE HOUR rules (round 2 handoff, section 7) ---------- */
if (existsSync(join(ROOT, 'blue-hour/index.html'))) {
  const css = read('assets/css/blue-hour.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const html = read('blue-hour/index.html');
  // No black: no #000 / #000000, no keyword, no rgba(0, 0, 0, ...) anywhere in the stylesheet.
  const black = css.match(/#000(?:000)?\b|\bblack\b|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*[,)]/gi) || [];
  check('blue-hour.css: no black', black.map((m) => `found ${m}`));
  // Lights on: every photo frame carries its dusk layer.
  const frames = html.match(/<(?:span|div|figure)\b[^>]*class="[^"]*\bbh-photo\b[^"]*"[^>]*>/g) || [];
  const missing = [];
  let at = 0;
  for (const f of frames) {
    const i = html.indexOf(f, at); at = i + f.length;
    const tag = f.match(/^<(\w+)/)[1];
    // the frame's own content runs to its matching close tag; dusk layers sit directly inside it
    let depth = 1, j = at;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g'); re.lastIndex = at;
    let m;
    while (depth && (m = re.exec(html))) { depth += m[1] ? -1 : 1; j = m.index; }
    if (!html.slice(at, j).includes('class="bh-dusk"')) missing.push(f.slice(0, 90));
  }
  check('blue-hour: every .bh-photo has a .bh-dusk', missing, `${frames.length} photo frames`);
  // --blue is never a text colour on this page (graphics and display type only; display type here is frost).
  const blueText = css.match(/(?:^|[;{\s])color:\s*var\(--blue\)/g) || [];
  check('blue-hour.css: no text in --blue', blueText.map((m) => `found ${m.trim()}`));
}

/* ---------- 5b. MOVE-IN DAY rules (round 3 handoff, section 7) ---------- */
if (existsSync(join(ROOT, 'move-in-day/index.html'))) {
  const css = read('assets/css/move-in-day.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const html = read('move-in-day/index.html');
  const black = css.match(/#000(?:000)?\b|\bblack\b|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*[,)]/gi) || [];
  check('move-in-day.css: no black', black.map((m) => `found ${m}`));
  check('move-in-day.css: no backdrop-filter', /backdrop-filter/.test(css) ? ['backdrop-filter used'] : []);
  // seven plates, in order, each a <picture> with AVIF and WebP sources
  const plates = [...html.matchAll(/<picture class="mi-plate[^"]*" data-plate="(\d)"[^>]*>([\s\S]*?)<\/picture>/g)];
  const problems = [];
  if (plates.map((m) => m[1]).join('') !== '0123456') problems.push(`plates found: ${plates.map((m) => m[1]).join(',') || 'none'}`);
  for (const [, n, inner] of plates) {
    if (!/type="image\/avif"/.test(inner) || !/type="image\/webp"/.test(inner)) problems.push(`plate ${n}: missing AVIF or WebP source`);
    const alt = (inner.match(/<img\b[^>]*\salt="([^"]*)"/) || [])[1];
    const want = site.images[`move-in/plate-${n}`].alt;
    if (n === '0' || n === '6') { if (!alt || alt !== want) problems.push(`plate ${n}: alt text missing or not the site.json alt`); }
    else if (alt !== '') problems.push(`plate ${n}: should have alt=""`);
  }
  if (!/data-plate="0"[^>]*>[\s\S]*?fetchpriority="high"/.test(html.match(/<picture class="mi-plate" data-plate="0"[\s\S]*?<\/picture>/)?.[0] || '')) problems.push('plate 0 is not high priority');
  if (!/<link rel="preload" as="image" href="[^"]*plate-0-\d+\.avif"[^>]*type="image\/avif"/.test(html)) problems.push('no AVIF preload for plate 0');
  check('move-in-day: seven hero plates', problems, `${plates.length} plates`);
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  check('move-in-day: one h1', h1 === 1 ? [] : [`${h1} h1 elements`]);
  // demo-only extras: the moveIn block's captions are on the page, as real text
  check('move-in-day: moveIn captions present', site.moveIn.captions.filter((c) => !decode(html).includes(c)).map((c) => `missing caption: ${c}`));
  check('move-in-day: captions are live text', /class="mi-captions" aria-live="polite"/.test(html) && !/mi-cap[^"]*"[^>]*aria-hidden/.test(html) ? [] : ['captions not live or hidden from screen readers']);
}

/* ---------- 5c. CROSS SECTION drawn to built (round 4 handoff, section 7) ---------- */
if (existsSync(join(ROOT, 'cross-section/index.html'))) {
  const html = read('cross-section/index.html');
  const manifest = JSON.parse(read('content/images.json'));
  // every live figure has both layers; every drawing img has alt="" inside an aria-hidden parent
  const figs = [...html.matchAll(/<figure class="[^"]*\bd2b\b[^"]*"([^>]*)>([\s\S]*?)<\/figure>/g)];
  const probs = [];
  let live = 0;
  for (const [, attrs, inner] of figs) {
    if (!/data-d2b="/.test(attrs)) { if (/d2b__drawing/.test(inner)) probs.push('figure without data-d2b carries a drawing layer'); continue; }
    live++;
    if (!/class="d2b__photo"/.test(inner) || !/class="d2b__drawing" aria-hidden="true"/.test(inner)) probs.push(`figure missing a layer: ${attrs.slice(0, 80)}`);
    if (/data-d2b="drag"/.test(attrs) && !/data-d2b-label="[^"]+, [^"]+"/.test(attrs)) probs.push(`drag figure without a label: ${attrs.slice(0, 80)}`);
  }
  const slices = [...html.matchAll(/<li class="cs-slice has-drawn"[\s\S]*?<\/li>/g)].map((m) => m[0]);
  for (const sl of slices) if (!/cs-slice-built/.test(sl) || !/class="d2b__drawing cs-slice-drawn" aria-hidden="true"/.test(sl)) probs.push('hero slice missing a layer');
  const drawImgs = [...html.matchAll(/<span class="d2b__drawing[^"]*"( aria-hidden="true")?>(<img\b[^>]*>)/g)];
  for (const [, hidden, img] of drawImgs) {
    if (!hidden) probs.push(`drawing parent not aria-hidden: ${img.slice(0, 70)}`);
    if (!/\salt=""/.test(img)) probs.push(`drawing img alt is not empty: ${img.slice(0, 70)}`);
  }
  check('cross-section: drawn-to-built figures', probs, `${live} live figures, ${slices.length} hero slices, ${drawImgs.length} drawing images`);
  // every drawing file is exactly the size of its photo's variant (same order, same w x h, real pixels)
  const jpegSize = (file) => {
    const b = readFileSync(join(ROOT, 'assets/img', file));
    for (let i = 2; i < b.length;) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + len;
    }
    return null;
  };
  const sizeProbs = [];
  const pairs = site.work.projects.flatMap((p) => [[p.leadDrawn, p.lead], [p.sliceDrawn, p.slice]]).concat([[site.showroom.imageDrawn, site.showroom.image]])
    .filter(([d]) => d && manifest[d]);
  for (const [d, ph] of pairs) {
    const dv = manifest[d].variants, pv = manifest[ph].variants;
    if (dv.length !== pv.length) { sizeProbs.push(`${d}: ${dv.length} variants, photo has ${pv.length}`); continue; }
    dv.forEach((v, i) => {
      const real = jpegSize(v.file);
      if (v.w !== pv[i].w || v.h !== pv[i].h || !real || real[0] !== pv[i].w || real[1] !== pv[i].h) sizeProbs.push(`${v.file} is ${real ? real.join('x') : '?'}, photo ${pv[i].file} is ${pv[i].w}x${pv[i].h}`);
    });
  }
  check('cross-section: drawing files match their photo variants', sizeProbs, `${pairs.length} pairs`);
  check('cross-section: drawn section is an h2 between the numbers and the index',
    /<div class="cs-numbers">[\s\S]*<section class="cs-drawn" id="drawn">\s*<header[^>]*>\s*<div[^>]*>\s*<h2/.test(html) && html.indexOf('id="drawn"') < html.indexOf('id="work"') ? [] : ['section missing or out of place']);
  check('cross-section: d2b.js loads after kit.js and before cross-section.js',
    /kit\.js"><\/script>\s*<script src="[^"]*d2b\.js"><\/script>\s*<script src="[^"]*cross-section\.js"/.test(html) ? [] : ['script order']);
  check('cross-section: LCP preload is slice 01 drawing', /<link rel="preload" as="image" href="[^"]*drawn\/[^"]+"[^>]*fetchpriority="high">/.test(html) ? [] : ['no drawing preload']);
}

/* ---------- 6. scaffolding files ---------- */
check('robots.txt', /User-agent: \*\s+Disallow: \//.test(read('robots.txt')) ? [] : ['wrong content']);
check('_headers', /\/\*\s+X-Robots-Tag: noindex, nofollow/.test(read('_headers')) ? [] : ['wrong content']);
check('no sitemap.xml', readdirSync(ROOT).includes('sitemap.xml') ? ['sitemap.xml exists'] : []);
check('netlify.toml', /publish = "\."/.test(read('netlify.toml')) && !/command/.test(read('netlify.toml')) ? [] : ['wrong content']);

console.log(out.join('\n'));
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
