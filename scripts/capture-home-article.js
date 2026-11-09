#!/usr/bin/env node
/* Rebuilds the homepage's "Members' articles" preview from a members' article.
   Run it from the repo root each time an article is published:

     node scripts/capture-home-article.js              newest article in hub/members-articles.json
     node scripts/capture-home-article.js <slug>       a particular one, e.g. nebius-sizing-up

   The blur rule (Paddy, 9 Nov): the title stays sharp as a tease; everything
   under it is blurred and carries a "Members only" chip. The blur is baked into
   the image, so no figure from the article can be read on the public homepage.
   The homepage alt text names the article, so update it in assets/home.js when
   the article changes.

   Writes assets/img/home/tool-article.webp (2000x1260). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'img', 'home', 'tool-article.webp');
const W = 1000, H = 630, SCALE = 2;
// The members' pages sit behind the Hub sign-in, so the test-only demo client stands in.
const DEMO = fs.readFileSync(path.join(__dirname, 'wos-demo', 'demo-client.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, 'wos-demo', 'fake-supabase.js'), 'utf8');
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg'};

function pick(slug){
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'hub', 'members-articles.json'), 'utf8'));
  if(slug){ const a = list.find(x=> x.slug === slug); if(!a) throw new Error('No members\' article with slug ' + slug); return a; }
  return list.filter(x=> x.type === 'article').sort((a, b)=> String(b.date).localeCompare(String(a.date)))[0];
}

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

(async ()=>{
  const art = pick(process.argv[2]);
  console.log('article:', art.slug, '-', art.title);
  const srv = await serve();
  const base = 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport:{width:W, height:H}, deviceScaleFactor:SCALE, reducedMotion:'reduce'});
  await ctx.route(/\/hub\/js\/supabase-config\.js/, r=> r.fulfill({contentType:'text/javascript', body:DEMO}));
  const page = await ctx.newPage();
  await page.goto(base + '/hub/members/' + art.slug + '.html', {waitUntil:'networkidle'}).catch(()=>{});
  // The article only: no Hub header, menu or tab bar.
  await page.addStyleTag({content:'#hubHeader,.hh-scrim,.hh-menu,.hh-tabs,.feedback-fab{display:none!important}html,body{padding-top:0!important;margin-top:0!important}'});
  await page.evaluate(()=> document.fonts && document.fonts.ready);
  await page.evaluate(()=> window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  // Where the title ends: the blur starts just under it.
  const cut = await page.evaluate(()=>{ const h = document.querySelector('h1'); return h ? Math.round(h.getBoundingClientRect().bottom) : 200; });
  const png = await page.screenshot();

  const data = await page.evaluate(async ({b64, cut, scale})=>{
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight, y0 = (cut + 10) * scale, feather = 16 * scale;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    // A heavy blur, drawn slightly oversized so its soft edges fall outside the frame.
    const b = document.createElement('canvas'); b.width = w; b.height = h; const bx = b.getContext('2d');
    bx.filter = 'blur(' + (15 * scale) + 'px)';
    bx.drawImage(img, -30 * scale, -30 * scale, w + 60 * scale, h + 60 * scale);
    bx.filter = 'none';
    bx.fillStyle = 'rgba(7,15,29,.28)'; bx.fillRect(0, 0, w, h);
    // Fade it in under the title.
    bx.globalCompositeOperation = 'destination-in';
    const g = bx.createLinearGradient(0, y0 - feather, 0, y0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    bx.fillStyle = g; bx.fillRect(0, 0, w, h);
    x.drawImage(b, 0, 0);
    // The "Members only" chip, centred in the blurred part.
    const label = 'Members only', fs = 15 * scale;
    x.font = '500 ' + fs + 'px Geist, Inter, system-ui, sans-serif';
    const tw = x.measureText(label).width, ph = 40 * scale, pw = tw + 64 * scale;
    const cx = w / 2, cy = y0 + (h - y0) / 2, left = cx - pw / 2, top = cy - ph / 2, r = ph / 2;
    x.beginPath(); x.roundRect(left, top, pw, ph, r);
    x.fillStyle = 'rgba(11,23,41,.86)'; x.fill();
    x.lineWidth = 1.5 * scale; x.strokeStyle = 'rgba(232,214,168,.55)'; x.stroke();
    // Padlock.
    const lx = left + 20 * scale, ly = cy - 8 * scale, s = scale;
    x.strokeStyle = '#E8D6A8'; x.lineWidth = 1.6 * s;
    x.beginPath(); x.roundRect(lx, ly + 6 * s, 14 * s, 10 * s, 2 * s); x.stroke();
    x.beginPath(); x.moveTo(lx + 3 * s, ly + 6 * s); x.lineTo(lx + 3 * s, ly + 3 * s); x.arc(lx + 7 * s, ly + 3 * s, 4 * s, Math.PI, 0); x.lineTo(lx + 11 * s, ly + 6 * s); x.stroke();
    x.fillStyle = '#E8D6A8'; x.textBaseline = 'middle';
    x.fillText(label, lx + 24 * s, cy + 1 * s);
    return c.toDataURL('image/webp', 0.84).split(',')[1];
  }, {b64: png.toString('base64'), cut, scale: SCALE});

  fs.writeFileSync(OUT, Buffer.from(data, 'base64'));
  console.log('wrote', path.relative(ROOT, OUT), Math.round(fs.statSync(OUT).size / 1024) + 'KB');
  console.log('Now update the alt text of the Members\' articles preview in assets/home.js to name: ' + art.title);
  await browser.close();
  srv.close();
})().catch(err=>{ console.error(err); process.exit(1); });
