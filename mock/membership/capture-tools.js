/* Tools captures for the Membership mock-up: the Portfolio Lab's five
   stages and the full Forecast page, from the live Wealth OS code run on
   the test-only demo client (scripts/wos-demo: Sam Taylor, sample figures,
   never a real record). No login and no live database.

   Run from the repo root, with the repo served on :8080:
     node mock/membership/capture-tools.js
   Writes mock/membership/img/lab-<stage>-{desk,phone}.jpg and
   fc-{desk,phone}.jpg. Reduced motion, so every chart is at its end state.
   The Lab works through the Equal weight preset so Compare, Implement and
   Results show a real scenario. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'img');
const BASE = process.argv[2] || 'http://localhost:8080';
const DEMO = fs.readFileSync(path.join(ROOT, 'scripts/wos-demo/demo-client.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(ROOT, 'scripts/wos-demo/fake-supabase.js'), 'utf8');
const STAGES = ['Analyse', 'Optimise', 'Compare', 'Implement', 'Results'];
const BANNED = /Paddy|Iveson/;
// Not part of the screens: the feedback button, toasts, footers, the phone tab bar.
const HIDE = '.feedback-fab,#toast,#disclaimerBar,.tei-boundary-footer,.tei-boundary,#sideSetupBtn,#clientApp .m-tabs{display:none!important}' +
  '#page-lab .hm-head{display:none!important}';

async function swapNames(page) {
  await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (/Paddy Iveson, your coach/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/Paddy Iveson, your coach/g, 'Your coach');
      if (/Paddy|Iveson/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/Paddy Iveson|Paddy|Iveson/g, 'your coach');
    }
  });
  const t = await page.evaluate(() => document.body.innerText);
  if (BANNED.test(t)) throw new Error('a real name is still on the page');
}

async function shot(el, file) {
  await el.screenshot({ path: file, type: 'jpeg', quality: 82, animations: 'disabled' });
  console.log('saved', path.relative(ROOT, file));
}

async function run(browser, dev) {
  const desk = dev === 'desk';
  const ctx = await browser.newContext({ viewport: desk ? { width: 1440, height: 900 } : { width: 390, height: 844 },
    deviceScaleFactor: desk ? 1.5 : 2, reducedMotion: 'reduce', colorScheme: 'dark' });
  await ctx.route(/\/hub\/js\/supabase-config\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: DEMO }));
  const page = await ctx.newPage();
  await page.goto(BASE + '/hub/wealth-os.html', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: HIDE });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  // Full Forecast page (the page body only, no sidebar).
  await page.evaluate(() => TEI.app.showPage('planning'));
  await page.waitForTimeout(1200);
  await swapNames(page);
  await shot(await page.$('#page-planning'), path.join(OUT, 'fc-' + dev + '.jpg'));

  // The Lab, stage by stage. Desktop: Analyse shows the whole tile (treemap
  // first) and the others start at the row of stage tabs. Phone: the Lab
  // opens as a wizard, stepped forward with its own Next buttons.
  await page.evaluate(() => TEI.app.showPage('lab'));
  await page.waitForTimeout(1200);
  if (!desk) {
    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Open the Lab/.test(x.textContent)).click());
    await page.waitForTimeout(1000);
  }
  for (const st of STAGES) {
    if (st !== 'Analyse') {
      await page.evaluate(({ st, desk }) => {
        const vis = (e) => e.getBoundingClientRect().height > 0;
        const all = [...document.querySelectorAll('#page-lab button')].filter(vis);
        const b = desk ? all.find((x) => x.textContent.replace(/\d/g, '').trim() === st)
          : all.filter((x) => /\u2192\s*$/.test(x.textContent.trim())).pop();
        b.click();
      }, { st, desk });
      await page.waitForTimeout(900);
      if (st === 'Optimise') {
        await page.evaluate(() => [...document.querySelectorAll('#page-lab button')].find((x) => x.textContent.trim() === 'Equal weight').click());
        await page.waitForTimeout(900);
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await swapNames(page);
    const file = path.join(OUT, 'lab-' + st.toLowerCase() + '-' + dev + '.jpg');
    if (!desk || st === 'Analyse') { await shot(await page.$(desk ? '#wlLab' : '#page-lab'), file); continue; }
    const box = await page.evaluate(() => {
      const l = document.getElementById('wlLab').getBoundingClientRect();
      const tab = [...document.querySelectorAll('#wlLab button')].find((x) => /Analyse/.test(x.textContent));
      const top = tab.getBoundingClientRect().top - 16;
      return { x: l.left + scrollX, y: top + scrollY, width: l.width, height: l.bottom - top };
    });
    await page.screenshot({ path: file, type: 'jpeg', quality: 82, clip: box, fullPage: true, animations: 'disabled' });
    console.log('saved', path.relative(ROOT, file));
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await run(browser, 'desk');
  await run(browser, 'phone');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
