// Records the demo screen bed: a real session against the live DM, captured to
// video. Derek intercuts his own push-up footage over the Heroic Effort beat.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(await readFile(join(root, p)));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(8080, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: 'screens/video', size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();

// Relay the DM call through Node (the sandbox proxy blocks browser HTTPS).
await page.route('https://arcana-dm.dj-b02.workers.dev/**', async route => {
  const isSpeak = route.request().url().endsWith('/speak');
  try {
    const r = await fetch(route.request().url(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:8080' },
      body: route.request().postData(),
    });
    if (isSpeak) {
      const buf = Buffer.from(await r.arrayBuffer());
      await route.fulfill({ status: r.status, contentType: 'audio/mpeg', body: buf });
    } else {
      await route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text() });
    }
  } catch (e) {
    await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: String(e) }) });
  }
});

await page.goto('http://localhost:8080/');
await page.waitForFunction(() => window.arcana);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.arcana);

const dm = () => page.evaluate(() => document.querySelectorAll('.say.dm:not(.thinking)').length);
const waitDM = async (n, ms = 90000) => {
  try { await page.waitForFunction(k => document.querySelectorAll('.say.dm:not(.thinking)').length >= k, n, { timeout: ms }); }
  catch { /* keep rolling; the camera does not stop */ }
};

// Type like a person so the footage reads as real play.
const playerSays = async line => {
  const before = await dm();
  await page.click('#say');
  await page.type('#say', line, { delay: 38 });
  await page.waitForTimeout(400);
  await page.click('#say-btn');
  return before;
};

// Answer approval prompts on camera: let them sit long enough to read, then
// allow. This is the human-in-the-loop beat, so it belongs in the footage.
let approvals = 0;
const watchApprovals = async () => {
  while (!stop) {
    try {
      await page.waitForSelector('.approval', { timeout: 2500 });
      approvals++;
      await page.waitForTimeout(2200);              // hold it on screen
      await page.click('.approval .ok').catch(() => {});
    } catch { /* none pending */ }
  }
};
let stop = false;
const approvalLoop = watchApprovals();

let gotChallenge = false;
console.log('recording…');
await waitDM(1);                                   // opening scene
await page.waitForTimeout(2500);

for (const line of [
  'I creep deeper into the crypt, sword drawn, listening for movement.',
  'I attack whatever is in front of me!',
  'I steel myself and charge it head-on — everything rides on this swing.',
  'This is the killing blow. I put every ounce of strength behind it.',
  'I finish it.',
]) {
  const before = await playerSays(line);
  const outcome = await Promise.race([
    page.waitForSelector('#challenge-modal:not([hidden])', { timeout: 90000 }).then(() => 'challenge'),
    page.waitForFunction(k => document.querySelectorAll('.say.dm:not(.thinking)').length >= k, before + 1, { timeout: 90000 }).then(() => 'spoke'),
  ]).catch(() => 'timeout');

  if (outcome === 'challenge') {
    const reps = parseInt(await page.innerText('#chal-title'), 10) || 10;
    gotChallenge = true;
    console.log(`  challenge offered: ${reps} reps — holding on screen for the cut`);
    await page.waitForTimeout(3800);               // let the offer breathe on camera
    await page.click('#chal-accept');
    for (let i = 0; i < reps; i++) { await page.waitForTimeout(340); await page.click('#chal-tap'); }
    await page.waitForTimeout(900);
    await waitDM(before + 1);
  }
  await page.waitForTimeout(2600);
  if (gotChallenge) break;                          // the money beat is in the can
}

// Land on the board so the last frame is the game, not a menu.
await page.waitForTimeout(2500);
stop = true; await approvalLoop.catch(() => {});
console.log('approvals answered on camera:', approvals);
console.log('done. board:', JSON.stringify((await page.evaluate(() => window.arcana.call('get_board_state'))).combat));

await ctx.close();                                 // flushes the video file
await browser.close();
server.close();
