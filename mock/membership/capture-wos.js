/* Wealth OS captures for the Membership mock-up (mock/membership).

   Reads the signed-off Quiet mockup straight from its branch (never copied
   into this one), swaps every real name and personal goal for example ones,
   and saves one desktop and one phone capture for Home, Wealth, Goals,
   Forecast and Cashflow, Client view only.

   Phone captures are the app screen alone (status bar, page, Wealth OS tab
   bar and home indicator): the mockup's Safari address bar and toolbar are
   left out, and the page draws its own hardware phone frame around them.
   Desktop captures are the app window alone (Wealth OS nav and page); the
   page draws the laptop frame.

   Run from the repo root:  node mock/membership/capture-wos.js
   Needs: git fetch origin mock/wealth-os-quiet */
const { execSync } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, 'img');
const SRC = 'origin/mock/wealth-os-quiet:mock/wealth-os/index.html';
const URL = 'http://wos.local/index.html';

// Real names and personal goals out, example ones in. Longest first.
const SWAP = [
  ['Thailand · J10', 'Japan trip · New car'],
  ['Paddy, your coach', 'Your coach'],
  ['Ask Paddy', 'Ask your coach'],
  ['Monzo Thailand pot', 'Monzo travel pot'],
  ['Pass J10', 'New car'],
  ['J10', 'New car'],
  ['Thailand', 'Japan trip'],
  ['Wedding', 'Kitchen'],
  ['John Doe', 'Alex'],
  ['John', 'Alex'],
  ['>JD<', '>A<'],
  ['Paddy', 'your coach'],
];
const BANNED = /John|Doe|Paddy|J10|Thailand|Wedding|\bJD\b|\bBTC\b|TSLA|ONDS/;

const PAGES = ['home', 'wealth', 'goals', 'fc', 'cash'];
const NAME = { home: 'home', wealth: 'wealth', goals: 'goals', fc: 'forecast', cash: 'cashflow' };

// The app as installed: no Safari bars; the tab bar sits on the home indicator.
const PHONE_CSS = `
  .saf,.mv1{display:none!important}
  .phone{box-shadow:none!important;border-radius:0!important}
  .tabbar{bottom:0!important;height:84px!important;padding-bottom:28px!important}
  .tabbar::after{content:"";position:absolute;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:#F7F4ED}
  .scroll{padding-bottom:110px!important}
  .rv{display:none!important}
  .stage{padding:0!important}
`;
const DESK_CSS = `.rv{display:none!important} .mv1{display:none!important} .dk{padding:0!important} .dkf{border:0!important;border-radius:0!important;box-shadow:none!important}`;

function swap(html) {
  for (const [a, b] of SWAP) html = html.split(a).join(b);
  return html;
}

async function check(page, label) {
  const text = await page.evaluate(() => {
    const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const attrs = [...document.querySelectorAll('[aria-label],[title],[alt]')].filter(vis)
      .map((e) => [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('alt')].join(' '));
    return document.body.innerText + ' ' + attrs.join(' ');
  });
  const m = text.match(BANNED);
  if (m) throw new Error(label + ': still shows "' + m[0] + '"');
}

(async () => {
  const html = swap(execSync('git show ' + SRC, { encoding: 'utf8', maxBuffer: 1 << 24 }));
  const browser = await chromium.launch();
  for (const dev of ['p', 'd']) {
    const ctx = await browser.newContext({
      viewport: dev === 'p' ? { width: 800, height: 900 } : { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.route('http://wos.local/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: dev === 'p' ? PHONE_CSS : DESK_CSS });
    await page.$eval('#sWho [data-v="c"]', (b) => b.click());
    await page.$eval('#sDev [data-v="' + dev + '"]', (b) => b.click());
    if (dev === 'd') await page.evaluate(() => { const w = document.getElementById('dkw'); if (w) w.style.transform = 'none'; });
    await page.evaluate(() => document.fonts.ready);
    for (const pg of PAGES) {
      await page.$eval('#sPg [data-v="' + pg + '"]', (b) => b.click());
      await page.evaluate(() => { document.querySelectorAll('.scroll,.dkm').forEach((s) => { s.scrollTop = 0; }); window.scrollTo(0, 0); });
      // Leave out the holdings block: a named holding reads as a real
      // position on a public page.
      await page.evaluate(() => {
        document.querySelectorAll('.q-sec').forEach((s) => {
          const h = s.querySelector('h2');
          if ((h && /investments sit/i.test(h.textContent)) || /\bBTC\b/.test(s.textContent)) s.style.display = 'none';
        });
        document.querySelectorAll('.mv1').forEach((e) => e.style.setProperty('display', 'none', 'important'));
      });
      // Let the page's own entrances (donut, rings, lines) finish.
      await page.waitForTimeout(1800);
      await check(page, NAME[pg] + '-' + dev);
      const el = await page.$(dev === 'p' ? '.phone' : '.dkb');
      const file = path.join(OUT, 'wos-' + NAME[pg] + (dev === 'p' ? '-phone' : '-desk') + '.jpg');
      await el.screenshot({ path: file, type: 'jpeg', quality: 86, animations: 'disabled' });
      console.log('saved', path.relative(process.cwd(), file));
    }
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
