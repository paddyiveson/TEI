/* Records a short, silent walkthrough of a members' earnings review for the
   Research section: the structure, headings and charts as they draw, with
   every figure and all body text blurred, so nothing of the analysis is
   given away. Needs the repo served on :8080.
     node mock/membership/record-research.js [base-url]
   Writes rec/research-onds.mp4 (1280x800, H.264) and rec/research-onds.jpg
   (the poster). */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:8080';
const OUT = path.join(__dirname, 'rec');
const SLUG = 'ondas-q3-2026-earnings-review';
// The test-only demo session (scripts/wos-demo), so the hub gate lets the
// local page render. No login and no live database.
const DEMO = fs.readFileSync(path.join(__dirname, '../../scripts/wos-demo/demo-client.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, '../../scripts/wos-demo/fake-supabase.js'), 'utf8');
const STOPS = ['top', '#s1', '#s2', '#s3', '#s4', '#s5', '#s6', '#s7'];

// Blur: every word in the article except the title's first line, the
// section headings and the category pills. Charts keep their shapes; their
// labels and figures blur with everything else. Verdicts, labels and
// conclusions stay unreadable.
const BLUR_CSS = `
  .mm-bl{filter:blur(6px)!important}
  h1 span:last-child, h1 em{filter:blur(8px)!important}
  select, input, output, textarea{filter:blur(6px)!important}
`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = path.join(OUT, 'tmp-research');
  fs.mkdirSync(tmp, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: tmp, size: { width: 1280, height: 800 } }, colorScheme: 'dark' });
  await ctx.route(/\/hub\/js\/supabase-config\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: DEMO }));
  const t0 = Date.now();
  const page = await ctx.newPage();
  await page.goto(BASE + '/hub/members/' + SLUG + '.html', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: BLUR_CSS });
  await page.evaluate(() => {
    const main = document.body;
    // Keep the title, section headings, and the hub bar and section nav (the
    // top 110px at load); everything else blurs.
    window.scrollTo(0, 0);
    const keep = (el) => el.closest('h1, h2, script, style') || el.getBoundingClientRect().top < 110;
    const w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const hits = [];
    let n;
    while ((n = w.nextNode())) {
      if (!n.nodeValue.trim() || !n.parentElement || keep(n.parentElement)) continue;
      // The category pills at the top stay (Earnings review, ONDS).
      if (n.parentElement.getBoundingClientRect().top < 200 && /^(Earnings review|ONDS)$/.test(n.nodeValue.trim())) continue;
      hits.push(n);
    }
    hits.forEach((t) => { const s = document.createElement('span'); s.className = 'mm-bl'; t.parentNode.insertBefore(s, t); s.appendChild(t); });
    document.documentElement.style.scrollBehavior = 'auto';
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const start = (Date.now() - t0) / 1000;
  await page.waitForTimeout(1800);
  const have = await page.evaluate((list) => list.filter((s) => document.querySelector(s)), STOPS.slice(1));
  console.log('stops', have.join(' '));
  for (const s of have) {
    // Ease to the next section, then hold while its charts draw.
    await page.evaluate((sel) => new Promise((done) => {
      const el = document.querySelector(sel);
      if (!el) { done(); return; }
      const from = scrollY, to = el.getBoundingClientRect().top + scrollY - 70, dur = 900, t1 = performance.now();
      const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
      (function step(now) {
        const k = Math.min(1, (now - t1) / dur);
        scrollTo(0, from + (to - from) * ease(k));
        if (k < 1) requestAnimationFrame(step); else done();
      })(t1);
    }), s);
    await page.waitForTimeout(2300);
  }
  const video = page.video();
  await ctx.close();
  await browser.close();
  const webm = await video.path();
  const mp4 = path.join(OUT, 'research-onds.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-i', webm, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27',
    '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', mp4]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1', '-i', mp4, '-frames:v', '1', '-q:v', '4', path.join(OUT, 'research-onds.jpg')]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('saved', path.relative(process.cwd(), mp4));
})().catch((e) => { console.error(e.message); process.exit(1); });
