#!/usr/bin/env node
/* Rebuilds the homepage's Wealth OS and Portfolio Lab previews from the
   live Wealth OS pages, with the test-only demo client (scripts/wos-demo,
   sample figures, never a real client record). Run it from the repo root
   after Wealth OS changes:

     npm i --no-save playwright   (once, if Playwright is not installed)
     node scripts/capture-home-previews.js

   Writes, all dark, with reduced motion so every count and chart is at its
   end state:
     assets/img/home/os-{wealth,forecast,cashflow}-d.webp  1440x900 at 1.5x, full page
     assets/img/home/os-{wealth,forecast,cashflow}-m.webp  390x844 at 2x, full page
     assets/img/home/tool-lab.webp                         the Portfolio Lab treemap and stage tabs
   WebP is encoded by the browser itself, so nothing else needs installing. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'img', 'home');
const DEMO = fs.readFileSync(path.join(__dirname, 'wos-demo', 'demo-client.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, 'wos-demo', 'fake-supabase.js'), 'utf8');
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg'};
const PAGES = [['progress', 'wealth'], ['planning', 'forecast'], ['cashflow', 'cashflow']];
// The feedback button, toasts and the site footer are not part of the screens.
const HIDE = '.feedback-fab,#toast,.tei-boundary-footer,.tei-boundary,#sideSetupBtn{display:none!important}';

function serve(){
  return new Promise(res=>{
    const srv = http.createServer((req, out)=>{
      let p = decodeURIComponent(req.url.split('?')[0]);
      if(p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if(!f.startsWith(ROOT)){ out.writeHead(403); out.end(); return; }
      fs.readFile(f, (e, d)=>{ if(e){ out.writeHead(404); out.end(); return; } out.writeHead(200, {'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream'}); out.end(d); });
    }).listen(0, ()=> res(srv));
  });
}

async function toWebp(page, png, file, quality){
  const data = await page.evaluate(async ({b64, q})=>{
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', q).split(',')[1];
  }, {b64: png.toString('base64'), q: quality || 0.8});
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  console.log('wrote', path.relative(ROOT, file), Math.round(fs.statSync(file).size/1024) + 'KB');
}

async function open(browser, base, w, h, scale){
  const ctx = await browser.newContext({viewport:{width:w, height:h}, deviceScaleFactor:scale, reducedMotion:'reduce', colorScheme:'dark'});
  await ctx.route(/\/hub\/js\/supabase-config\.js/, r=> r.fulfill({contentType:'text/javascript', body:DEMO}));
  const page = await ctx.newPage();
  await page.goto(base + '/hub/wealth-os.html', {waitUntil:'networkidle'});
  await page.addStyleTag({content:HIDE});
  await page.evaluate(()=> document.fonts && document.fonts.ready);
  return {ctx, page};
}

(async ()=>{
  fs.mkdirSync(OUT, {recursive:true});
  const srv = await serve();
  const base = 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch();
  const blank = await (await browser.newContext()).newPage();
  for(const [w, h, scale, suffix] of [[1440, 900, 1.5, 'd'], [390, 844, 2, 'm']]){
    const {ctx, page} = await open(browser, base, w, h, scale);
    for(const [id, name] of PAGES){
      await page.evaluate(id=> TEI.app.showPage(id), id);
      await page.waitForTimeout(900);
      const png = await page.screenshot({fullPage:true});
      await toWebp(blank, png, path.join(OUT, 'os-' + name + '-' + suffix + '.webp'), 0.8);
    }
    if(suffix === 'd'){
      await page.evaluate(()=> TEI.app.showPage('lab'));
      await page.waitForTimeout(1200);
      // The treemap and the stage tabs, as on the homepage: from the top of the
      // Lab tile down to the row of stage tabs. The sticky page head is hidden.
      await page.addStyleTag({content:'#page-lab .hm-head{display:none!important}'});
      const box = await page.evaluate(()=>{
        const lab = document.getElementById('wlLab'); if(!lab) return null;
        const r = lab.getBoundingClientRect();
        const tabs = Array.from(lab.querySelectorAll('button')).find(b=> /Analyse/.test(b.textContent));
        const end = tabs ? tabs.getBoundingClientRect().bottom + 22 : r.top + 680;
        return {x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: Math.min(r.height, end - r.top)};
      });
      if(box) await toWebp(blank, await page.screenshot({clip: box, fullPage: true}), path.join(OUT, 'tool-lab.webp'), 0.82);
      else console.warn('Portfolio Lab tile not found; tool-lab.webp not updated');
    }
    await ctx.close();
  }
  await browser.close();
  srv.close();
})().catch(err=>{ console.error(err); process.exit(1); });
