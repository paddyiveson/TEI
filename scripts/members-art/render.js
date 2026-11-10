#!/usr/bin/env node
/* Renders a members' article's image set from the TEI templates.

     node scripts/members-art/render.js <slug>          TEI on-brand set, e.g. ondas-disconnect
     node scripts/members-art/render.js <slug> --own    the article's own-style set (needs an "own"
                                                         block and sets/<slug>.own.css)

   Reads scripts/members-art/sets/<slug>.json and writes:
     assets/img/members/<slug>/wide.webp      1600x900   members' card (Hub, Research)
     assets/img/members/<slug>/og.png         1200x630   og:image / twitter:image
     assets/img/members/<slug>/og.webp        1200x630
     assets/img/members/<slug>/square.webp    1080x1080  social
     assets/img/members/<slug>/tease.webp     1600x900   homepage tease (blurred, Members only)
   and the full PNG + WebP set for Drive, named <prefix>_wide.png and so on, in
     scripts/members-art/out/<driveFolder>/   (not committed; upload it to
     02_Brand_and_Content / Thumbnails_and_Teases / <driveFolder>)

   Rules (Paddy, 10 Nov 2026): words only on every image (headline, company
   names, kicker, date). The tease rows are placeholders made here, never the
   article's figures, and sit under a 14px blur. TEI dark ground, champagne
   accents, Schibsted Grotesk words and Inter figures; no company colours or
   logos. Uses Playwright's own Chromium (also used to encode the WebP).

   --own (Paddy, 10 Nov 2026: ONDS and NBIS keep their own colour and styles,
   alongside the on-brand set): wide, og and square from thumb-own.html in the
   article's colours and type, and the tease captured from the article itself
   by scripts/capture-home-article.js (title sharp, the rest blurred, Members
   only chip). Files are named own-wide.webp, own-og.png and so on, and
   <prefix>_own_wide.png and so on for Drive. */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..');
const slug = process.argv[2];
const OWN = process.argv.includes('--own');
if (!slug) { console.error('Usage: node scripts/members-art/render.js <slug> [--own]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'sets', slug + '.json'), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Headlines may carry <br> to set the line break; everything else is escaped.
const headline = (s) => esc(s).replace(/&lt;br&gt;/g, '<br>');

function kicker(k) {
  const [a, b, c] = k;
  return '<b>' + esc(a) + '</b><span class="sep">/</span>' + esc(b) + '<span class="sep">/</span><span class="q">' + esc(c) + '</span>';
}
function foot(f) {
  if (f.type === 'track') {
    return '<div class="track">' + f.marks.map((m) => '<div class="mk" style="left:' + m.at + '%"><b>' + esc(m.t) + '</b><i></i></div>').join('') + '</div>' +
      '<div class="stages">' + f.stages.map((s) => '<span>' + esc(s) + '</span>').join('') + '</div>';
  }
  return '<div class="co"><div class="who"><i></i><b>' + esc(f.ticker) + '</b><span>' + esc(f.name) + '</span></div><div class="dt">' + esc(f.date) + '</div></div>';
}

// Placeholder rows: shapes only, plus dummy figures that the blur makes unreadable.
const DUMMY = ['$0.00', '00.0%', '+00%', '$0.0bn', '0.0x'];
const DOTS = [['var(--up)', 'var(--up)', 'var(--up)'], ['var(--up)', 'var(--down)', 'var(--down)'], ['var(--down)', 'var(--down)', '#9AA5B6'], ['#9AA5B6', 'var(--down)', 'var(--down)']];
function rows(list) {
  return list.map((r, i) => {
    const third = i % 2
      ? '<div class="bars"><div><i style="width:' + (80 - i * 9) + '%"></i></div><div><i style="width:' + (46 + i * 7) + '%"></i></div><div><i style="width:' + (63 - i * 4) + '%"></i></div></div>'
      : '<div class="txt"><span style="width:' + (96 - i * 2) + '%"></span><span style="width:' + (88 - i * 4) + '%"></span><span style="width:' + (64 - i * 3) + '%"></span></div>';
    return '<div class="r"><div class="tk"><b>' + esc(r.tk) + '</b><span>' + esc(r.name) + '</span></div>' +
      '<div class="num"><b>' + DUMMY[i % DUMMY.length] + '</b><span></span></div>' +
      '<div class="res">' + DOTS[i % DOTS.length].map((c, j) => '<i style="--c:' + c + ';--w:' + (120 + ((i * 3 + j * 5) % 7) * 10) + 'px"></i>').join('') + '</div>' + third + '</div>';
  }).join('');
}

const SIZES = [
  ['wide', 1600, 900, '--w:1600px;--h:900px;--pad:84px 96px;--s:24px;--h1:132px', ''],
  ['og', 1200, 630, '--w:1200px;--h:630px;--pad:60px 72px;--s:19px;--h1:96px', ''],
  ['square', 1080, 1080, '--w:1080px;--h:1080px;--pad:80px;--s:22px;--h1:124px', 'sq'],
];

async function shoot(browser, file, w, h, out) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto('file://' + file);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.locator('.card').screenshot({ path: out + '.png' });
  // WebP through the browser's own encoder, quality 0.88 as in the Drive template.
  const b64 = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.88).split(',')[1];
  }, 'data:image/png;base64,' + png.toString('base64'));
  fs.writeFileSync(out + '.webp', Buffer.from(b64, 'base64'));
  await page.close();
}

const MARKS = {
  compass: '<svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="11.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M13 4.5 L15.6 13 L13 21.5 L10.4 13 Z" fill="#d9ff4a"/></svg>',
  ring: '<svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="11" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="13" r="4" fill="none" stroke="#E8D6A8" stroke-width="1.5"/></svg>',
};

async function own() {
  const o = cfg.own;
  if (!o) throw new Error('sets/' + slug + '.json has no "own" block');
  const assets = path.join(ROOT, 'assets', 'img', 'members', slug);
  const drive = path.join(HERE, 'out', cfg.driveFolder);
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(drive, { recursive: true });
  const tpl = fs.readFileSync(path.join(HERE, 'thumb-own.html'), 'utf8');
  const css = fs.readFileSync(path.join(HERE, 'sets', o.css), 'utf8');
  const browser = await chromium.launch();
  for (const [n, w, h, vars, cls] of SIZES) {
    // The own headline may carry the article's own spans (authored in sets/, not user input).
    const html = tpl.replace('__THEME__', css).replace('__CLS__', cls)
      .replace('__VARS__', vars + ';--k:' + ((o.scale && o.scale[n]) || 1))
      .replace('__MARK__', MARKS[o.mark] || '')
      .replace('__PILLS__', o.pills.map((p) => '<span class="pill' + (p.c ? ' ' + p.c : '') + '">' + esc(p.t) + '</span>').join(''))
      .replace('__H1__', o.headline)
      .replace('__DEK__', o.dek ? '<p class="dek">' + esc(o.dek) + '</p>' : '')
      .replace('__TICKER__', esc(cfg.foot.ticker)).replace('__NAME__', esc(cfg.foot.name)).replace('__DATE__', esc(cfg.foot.date));
    const tmp = path.join(HERE, '_own_' + n + '.html');
    fs.writeFileSync(tmp, html);
    const out = path.join(drive, cfg.prefix + '_own_' + n);
    await shoot(browser, tmp, w, h, out);
    fs.unlinkSync(tmp);
    fs.copyFileSync(out + '.webp', path.join(assets, 'own-' + n + '.webp'));
    if (n === 'og') fs.copyFileSync(out + '.png', path.join(assets, 'own-og.png'));
    console.log('wrote', cfg.prefix + '_own_' + n, '(.png, .webp)');
  }
  await browser.close();
  // The tease: the article itself, 1200x675 at 4/3 scale = 1600x900.
  const { capture } = require('../capture-home-article.js');
  const out = path.join(drive, cfg.prefix + '_own_homepage_tease');
  await capture({ slug, width: 1200, height: 675, scale: 4 / 3, out: out + '.webp', png: out + '.png', hide: (o.capture && o.capture.hide) || [] });
  fs.copyFileSync(out + '.webp', path.join(assets, 'own-tease.webp'));
  console.log('Site images in', path.relative(ROOT, assets) + '/ (own-*)');
}

(async () => {
  if (OWN) return own();
  const assets = path.join(ROOT, 'assets', 'img', 'members', slug);
  const drive = path.join(HERE, 'out', cfg.driveFolder);
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(drive, { recursive: true });
  const browser = await chromium.launch();
  const thumb = fs.readFileSync(path.join(HERE, 'thumb.html'), 'utf8');
  const tease = fs.readFileSync(path.join(HERE, 'tease.html'), 'utf8');
  const k = cfg.kicker;
  const jobs = SIZES.map(([n, w, h, vars, cls]) => [n, w, h, thumb
    .replace('__CLS__', cls)
    .replace('__VARS__', vars + ';--k:' + ((cfg.scale && cfg.scale[n]) || 1) + (cfg.wideHeadline ? ';--mw:none' : ''))
    .replace('__KICKER__', kicker(k))
    .replace('__H1__', headline(cfg.headline))
    .replace('__DEK__', esc(cfg.dek))
    .replace('__FOOT__', foot(cfg.foot))]);
  jobs.push(['homepage_tease', 1600, 900, tease
    .replace('__VARS__', '--k:' + ((cfg.scale && cfg.scale.tease) || 1))
    .replace('__KICKER__', kicker(k))
    .replace('__H1__', headline(cfg.teaseHeadline || cfg.headline))
    .replace('__LOCKLINE__', esc(cfg.lockLine))
    .replace('__ROWS__', rows(cfg.rows))]);
  for (const [n, w, h, html] of jobs) {
    const tmp = path.join(HERE, '_' + n + '.html');
    fs.writeFileSync(tmp, html);
    const out = path.join(drive, cfg.prefix + '_' + n);
    await shoot(browser, tmp, w, h, out);
    fs.unlinkSync(tmp);
    const site = n === 'homepage_tease' ? 'tease' : n;
    fs.copyFileSync(out + '.webp', path.join(assets, site + '.webp'));
    if (n === 'og') fs.copyFileSync(out + '.png', path.join(assets, 'og.png'));
    console.log('wrote', cfg.prefix + '_' + n, '(.png, .webp)');
  }
  await browser.close();
  console.log('Site images in', path.relative(ROOT, assets) + '/');
  console.log('Drive set in', path.relative(ROOT, drive) + '/  ->  Thumbnails_and_Teases / ' + cfg.driveFolder);
})().catch((e) => { console.error(e); process.exit(1); });
