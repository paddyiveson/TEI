/* Records the Community chat playing, first message to last, for Paddy to
   compare with the HTML animation. Needs the repo served on :8080.
     node mock/membership/record-chat.js [base-url]
   Writes rec/community-chat.mp4 (390x844) and
   rec/community-chat-1080x1920.mp4 (H.264, -preset veryfast). */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:8080';
const OUT = path.join(__dirname, 'rec');

async function record(w, h, name) {
  const tmp = path.join(OUT, 'tmp-' + name);
  fs.mkdirSync(tmp, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, recordVideo: { dir: tmp, size: { width: w, height: h } } });
  const t0 = Date.now();
  const page = await ctx.newPage();
  await page.goto(BASE + '/mock/membership/?rec', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const start = (Date.now() - t0) / 1000;
  await page.evaluate(() => window.startChat());
  await page.waitForFunction(() => window.__chatDone === true, null, { timeout: 30000 });
  await page.waitForTimeout(1500); // hold the full conversation a moment
  const video = page.video();
  await ctx.close();
  await browser.close();
  const webm = await video.path();
  const mp4 = path.join(OUT, name + '.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, start - 0.3)), '-i', webm,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', mp4]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('saved', path.relative(process.cwd(), mp4));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await record(390, 844, 'community-chat');
  await record(1080, 1920, 'community-chat-1080x1920');
})().catch((e) => { console.error(e.message); process.exit(1); });
