#!/usr/bin/env node
// RI Workplace home demos: static build.
// Zero dependencies. Reads content/site.json (every word) and content/images.json
// (measured image sizes), stamps them into templates/*.html, writes the four pages.
// Run: node scripts/build.mjs   (add --lint to list any copy typed into a template)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const LINT = process.argv.includes('--lint');

const site = JSON.parse(read('content/site.json'));
const manifest = existsSync(join(ROOT, 'content/images.json'))
  ? JSON.parse(read('content/images.json'))
  : {};

/* ---------- data prep: derive hrefs, never words ---------- */

const live = (path) => site.org.url + path;

for (const item of site.nav) {
  item.href = live(item.path);
  item.id = item.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  for (const child of item.children || []) child.href = live(child.path);
  item.hasChildren = (item.children || []).length > 0;
  item.wide = (item.children || []).length > 8;
}
const servicePaths = Object.fromEntries(
  site.nav.flatMap((n) => n.children || []).map((c) => [c.label, c.path])
);
for (const step of site.steps.items) {
  step.links = step.services.map((label) => {
    if (!servicePaths[label]) throw new Error(`Step service not in nav: ${label}`);
    return { label, href: live(servicePaths[label]) };
  });
}
const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
for (const p of site.work.projects) {
  p.href = live(p.path);
  // Under 1600px wide: split layouts only, never full-bleed (handoff 7.7).
  p.small = (manifest[p.lead]?.variants.at(-1).w || 0) < 1600;
}
for (const p of site.work.index || []) p.href = live(p.path);
// BLUE HOUR's featured project is one of the six, picked by slug in site.json.
// MOVE-IN DAY's featured project, picked by slug the same way.
if (site.moveIn) {
  site.moveIn.project = site.work.projects.find((p) => p.slug === site.moveIn.featured.slug);
  if (!site.moveIn.project) throw new Error(`Featured project not found: ${site.moveIn.featured.slug}`);
}
if (site.blueHour) {
  site.blueHour.project = site.work.projects.find((p) => p.slug === site.blueHour.featured.slug);
  if (!site.blueHour.project) throw new Error(`Featured project not found: ${site.blueHour.featured.slug}`);
}
// One list for the project table: the six featured rows, then the rest of the index.
site.work.rows = [
  ...site.work.projects.map((p) => ({ ...p, featured: true, note: p.line })),
  ...site.work.index.map((p, i) => ({ ...p, n: String(site.work.projects.length + i + 1).padStart(2, '0'), featured: false, note: '' })),
].map((r) => ({ ...r, sectorSlug: slug(r.sector) }));
site.work.sectors = [...new Set(site.work.rows.map((r) => r.sector).filter(Boolean))].map((label) => ({ label, slug: slug(label) }));
for (const q of site.quotes.items) q.name = q.by.split(' · ')[0];
for (const i of site.industries.items) {
  if (!servicePaths[i.label]) throw new Error(`Industry not in nav: ${i.label}`);
  i.href = live(servicePaths[i.label]);
}
site.work.allHref = live(site.work.all.path);
site.steps.allHref = live(site.steps.all.path);
site.family.linkHref = live(site.family.link.path);
site.footer.privacyHref = live(site.footer.privacy.path);
site.org.telHref = 'tel:+1' + site.org.telephone.replace(/\D/g, '');
site.org.mailHref = 'mailto:' + site.org.email;
site.meta.ogImageFile = (manifest[site.meta.ogImage]?.variants.at(-1) || { file: site.meta.ogImage + '.jpg' }).file;
site.ld = JSON.stringify(
  {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: site.org.name,
    url: site.org.url,
    telephone: site.org.telephone,
    email: site.org.email,
    foundingDate: site.org.founded,
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.org.address.street,
      addressLocality: site.org.address.city,
      addressRegion: site.org.address.region,
      postalCode: site.org.address.zip,
      addressCountry: 'US',
    },
    sameAs: site.org.social.map((s) => s.url),
  },
  null,
  2
);

/* ---------- tiny template engine ---------- */

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const filters = {
  pad2: (v) => String(v).padStart(2, '0'),
  json: (v) => JSON.stringify(v),
  slug: (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  count: (v) => (v || []).length,
  // Round 4: the drawing key if that drawing shipped (it is in images.json), else ''. Lets a template leave out
  // the drawing layer, its tags and data-d2b for a slot whose drawing was rejected or expired: {{#if p.leadDrawn | shipped}}
  shipped: (v) => (v && manifest[v] ? v : ''),
};

function lookup(expr, scopes) {
  expr = expr.trim();
  if (/^"[^"]*"$/.test(expr)) return expr.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  const parts = expr.split('.');
  for (const s of scopes) {
    if (s && Object.prototype.hasOwnProperty.call(s, parts[0])) {
      let v = s[parts[0]];
      for (const p of parts.slice(1)) v = v == null ? undefined : v[p];
      return v;
    }
  }
  return undefined;
}

function value(expr, scopes) {
  const [path, ...pipes] = expr.split('|').map((s) => s.trim());
  let v = lookup(path, scopes);
  for (const f of pipes) {
    if (!filters[f]) throw new Error(`Unknown filter: ${f}`);
    v = filters[f](v);
  }
  return v;
}

function truthy(cond, scopes) {
  cond = cond.trim();
  let m;
  if ((m = cond.match(/^(.+?)\s*(==|!=)\s*(.+)$/))) {
    const eq = String(value(m[1], scopes)) === String(value(m[3], scopes));
    return m[2] === '==' ? eq : !eq;
  }
  if (cond.startsWith('!')) return !truthy(cond.slice(1), scopes);
  const v = value(cond, scopes);
  return Array.isArray(v) ? v.length > 0 : Boolean(v);
}

function parseArgs(str) {
  const out = { _: [] };
  const re = /([\w-]+)=("[^"]*"|\S+)|("[^"]*"|\S+)/g;
  let m;
  while ((m = re.exec(str))) {
    if (m[1]) out[m[1]] = m[2];
    else out._.push(m[3]);
  }
  return out;
}

function parse(src) {
  const re = /\{\{\{([\s\S]+?)\}\}\}|\{\{([\s\S]+?)\}\}/g;
  const root = { type: 'root', body: [] };
  const stack = [root];
  let target = root.body;
  let last = 0;
  let m;
  const push = (n) => target.push(n);
  while ((m = re.exec(src))) {
    if (m.index > last) push({ type: 'text', value: src.slice(last, m.index) });
    last = re.lastIndex;
    if (m[1] != null) {
      push({ type: 'var', expr: m[1].trim(), raw: true });
      continue;
    }
    const tag = m[2].trim();
    if (tag.startsWith('!')) continue;
    if (tag.startsWith('#each ')) {
      const mm = tag.match(/^#each\s+(.+?)(?:\s+as\s+(\w+))?$/);
      const node = { type: 'each', expr: mm[1], as: mm[2] || 'it', body: [] };
      push(node);
      stack.push(node);
      target = node.body;
    } else if (tag.startsWith('#if ')) {
      const node = { type: 'if', cond: tag.slice(4), body: [], alt: [] };
      push(node);
      stack.push(node);
      target = node.body;
    } else if (tag === 'else') {
      const top = stack[stack.length - 1];
      if (top.type !== 'if') throw new Error('{{else}} outside {{#if}}');
      top.inAlt = true;
      target = top.alt;
    } else if (tag === '/each' || tag === '/if') {
      const node = stack.pop();
      if (node.type !== tag.slice(1)) throw new Error(`Mismatched ${tag}`);
      const parent = stack[stack.length - 1];
      target = parent.type === 'if' && parent.inAlt ? parent.alt : parent.body;
    } else if (tag.startsWith('> ')) {
      const [name, ...rest] = tag.slice(2).trim().split(/\s+/);
      push({ type: 'partial', name, args: parseArgs(rest.join(' ')) });
    } else if (tag.startsWith('pic ')) {
      push({ type: 'pic', args: parseArgs(tag.slice(4)) });
    } else if (tag.startsWith('picture ')) {
      push({ type: 'picture', args: parseArgs(tag.slice(8)) });
    } else if (tag.startsWith('preload ')) {
      push({ type: 'preload', args: parseArgs(tag.slice(8)) });
    } else {
      push({ type: 'var', expr: tag, raw: false });
    }
  }
  if (last < src.length) push({ type: 'text', value: src.slice(last) });
  if (stack.length > 1) throw new Error(`Unclosed block: ${stack[stack.length - 1].type}`);
  return root.body;
}

const partialCache = {};
function partial(name) {
  if (!partialCache[name]) partialCache[name] = parse(read(`templates/partials/${name}.html`));
  return partialCache[name];
}

// Picture helper. One <img> with srcset from the measured manifest.
function pic(args, scopes) {
  const key = value(args._[0], scopes);
  const root = lookup('root', scopes);
  const meta = site.images[key];
  const info = manifest[key];
  const cls = args.class ? value(args.class, scopes) : '';
  const eager = args._.includes('eager');
  // Round 4: `low` = loads at once (no lazy) but at low priority, for the hero photos waiting under the drawings.
  const low = args._.includes('low');
  // `auto` = loads at once at normal priority (first-screen images that are not the LCP image).
  const auto = args._.includes('auto');
  if (!meta) throw new Error(`Image not in site.json: ${key}`);
  if (!info) {
    // Fallback for a slot with no downloaded photo: a labeled tint block.
    return `<span class="pic-missing ${esc(cls)}" role="img" aria-label="${esc(meta.alt)}" data-slot="${esc(key)}" data-demo-scaffold></span>`;
  }
  const sizes = args.sizes ? value(args.sizes, scopes) : '100vw';
  const largest = info.variants[info.variants.length - 1];
  const srcset = info.variants.map((v) => `${root}assets/img/${v.file} ${v.w}w`).join(', ');
  const attrs = [
    cls ? `class="${esc(cls)}"` : '',
    `src="${root}assets/img/${largest.file}"`,
    info.variants.length > 1 ? `srcset="${srcset}" sizes="${esc(sizes)}"` : '',
    `width="${largest.w}" height="${largest.h}"`,
    `alt="${esc(args.alt ? value(args.alt, scopes) : meta.alt)}"`,
    eager ? 'fetchpriority="high" decoding="async"' : low ? 'fetchpriority="low" decoding="async"' : auto ? 'fetchpriority="auto" decoding="async"' : 'loading="lazy" decoding="async"',
  ];
  return `<img ${attrs.filter(Boolean).join(' ')}>`;
}

// Picture helper (round 3, MOVE-IN DAY plates): <picture> with AVIF and WebP sources over the JPG <img>.
// Needs a manifest entry with `avif` and `webp` lists (optimize-images.mjs --plates).
// Args: key, class (on <picture>), imgclass, sizes, eager | late, and any data-* or aria-* passed to <picture>.
// `late` = lazy and low priority, for plates the page shows only after the first one.
function picture(args, scopes) {
  const key = value(args._[0], scopes);
  const root = lookup('root', scopes);
  const meta = site.images[key];
  const info = manifest[key];
  if (!meta) throw new Error(`Image not in site.json: ${key}`);
  if (!info || !info.avif || !info.webp) throw new Error(`No AVIF/WebP set for ${key}: run optimize-images.mjs --plates`);
  const sizes = esc(args.sizes ? value(args.sizes, scopes) : '100vw');
  const set = (list) => list.map((v) => `${root}assets/img/${v.file} ${v.w}w`).join(', ');
  const largest = info.variants[info.variants.length - 1];
  const extra = Object.entries(args).filter(([k]) => /^(data|aria)-/.test(k)).map(([k, v]) => `${k}="${esc(value(v, scopes))}"`);
  const cls = args.class ? ` class="${esc(value(args.class, scopes))}"` : '';
  const imgcls = args.imgclass ? `class="${esc(value(args.imgclass, scopes))}" ` : '';
  const load = args._.includes('eager') ? 'fetchpriority="high" decoding="async"' : args._.includes('late') ? 'loading="lazy" fetchpriority="low" decoding="async"' : 'loading="lazy" decoding="async"';
  return `<picture${cls}${extra.length ? ' ' + extra.join(' ') : ''}>`
    + `<source type="image/avif" srcset="${set(info.avif)}" sizes="${sizes}">`
    + `<source type="image/webp" srcset="${set(info.webp)}" sizes="${sizes}">`
    + `<img ${imgcls}src="${root}assets/img/${largest.file}" srcset="${set(info.variants)}" sizes="${sizes}" width="${largest.w}" height="${largest.h}" alt="${esc(args.alt ? value(args.alt, scopes) : meta.alt)}" ${load}>`
    + `</picture>`;
}

// Preload hint for the hero image, matching the srcset the picture helper writes.
// format=avif preloads the AVIF set instead (with type="image/avif"), for the picture helper.
function preload(args, scopes) {
  const key = value(args._[0], scopes);
  const root = lookup('root', scopes);
  const info = manifest[key];
  if (!info) return '';
  const sizes = args.sizes ? value(args.sizes, scopes) : '100vw';
  const format = args.format ? value(args.format, scopes) : '';
  const list = format && info[format] ? info[format] : info.variants;
  const largest = list[list.length - 1];
  const srcset = list.map((v) => `${root}assets/img/${v.file} ${v.w}w`).join(', ');
  const type = format && info[format] ? ` type="image/${format}"` : '';
  return `<link rel="preload" as="image" href="${root}assets/img/${largest.file}" imagesrcset="${srcset}" imagesizes="${esc(sizes)}"${type} fetchpriority="high">`;
}

function render(nodes, scopes) {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += n.value;
    else if (n.type === 'var') {
      const v = value(n.expr, scopes);
      if (v === undefined) throw new Error(`Missing value: {{${n.expr}}}`);
      out += n.raw ? String(v) : esc(v);
    } else if (n.type === 'each') {
      const list = value(n.expr, scopes) || [];
      list.forEach((item, i) => {
        out += render(n.body, [
          { [n.as]: item, '@index': i, '@n': i + 1, '@first': i === 0, '@last': i === list.length - 1, '@odd': i % 2 === 0 },
          ...scopes,
        ]);
      });
    } else if (n.type === 'if') {
      out += render(truthy(n.cond, scopes) ? n.body : n.alt, scopes);
    } else if (n.type === 'partial') {
      const extra = {};
      for (const [k, v] of Object.entries(n.args)) if (k !== '_') extra[k] = value(v, scopes);
      out += render(partial(n.name), [extra, ...scopes]);
    } else if (n.type === 'pic') {
      out += pic(n.args, scopes);
    } else if (n.type === 'picture') {
      out += picture(n.args, scopes);
    } else if (n.type === 'preload') {
      out += preload(n.args, scopes);
    }
  }
  return out;
}

/* ---------- lint: no copy typed into templates ---------- */

function lint(name, src) {
  const text = src
    .replace(/\{\{[\s\S]+?\}\}/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/g, ' ');
  const words = text.match(/[A-Za-z]{2,}[A-Za-z' ]*/g);
  if (words) console.warn(`  lint ${name}: literal text -> ${[...new Set(words.map((w) => w.trim()))].join(' | ')}`);
}

/* ---------- pages ---------- */

const pages = [
  { template: 'chooser', out: 'index.html', root: '', demo: null },
  ...site.demos.map((d) => ({ template: d.slug, out: `${d.slug}/index.html`, root: '../', demo: d })),
];

for (const page of pages) {
  const path = `templates/${page.template}.html`;
  if (!existsSync(join(ROOT, path))) {
    console.warn(`skip ${page.out} (no ${path})`);
    continue;
  }
  const src = read(path);
  if (LINT) lint(page.template, src);
  const demos = site.demos.map((d) => ({ ...d, current: page.demo && page.demo.slug === d.slug }));
  let html = render(parse(src), [{ root: page.root, page, demo: page.demo, demos, isDemo: Boolean(page.demo) }, site]);
  html = html.replace(/^[ \t]*\n/gm, '');
  // Demos are look-only: every link that would leave the page goes nowhere ("#").
  // In-page anchors (#contact, #work, #top, #main) still scroll; the LWS credit stays live.
  if (page.demo) {
    html = html.replace(/<a\b[^>]*>/g, (tag) => {
      const href = (tag.match(/\shref="([^"]*)"/) || [])[1];
      if (href === undefined || href.startsWith('#') || href.includes('livewebstudios.com')) return tag;
      return tag
        .replace(/\shref="[^"]*"/, ' href="#"')
        .replace(/\s(target|rel)="[^"]*"/g, '');
    });
  }
  mkdirSync(dirname(join(ROOT, page.out)), { recursive: true });
  writeFileSync(join(ROOT, page.out), html);
  console.log(`wrote ${page.out} (${(html.length / 1024).toFixed(1)} KB)`);
}
if (LINT) for (const name of Object.keys(partialCache)) lint(`partials/${name}`, read(`templates/partials/${name}.html`));
